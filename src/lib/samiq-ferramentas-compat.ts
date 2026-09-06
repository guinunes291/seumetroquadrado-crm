// Compatibilidade dos schemas das ferramentas com o gateway de IA.
//
// O AI SDK converte cada `inputSchema` zod em JSON Schema draft-7 completo:
// "$schema", "additionalProperties", "format": "uuid", "pattern" com regex,
// "minLength"/"maxLength", "minimum"/"maximum", "exclusiveMinimum", "const".
// Gateways que traduzem para a API nativa do Gemini rejeitam parte dessas
// chaves com HTTP 400 — e a Sami inteira cai com "temporariamente
// indisponível", porque o erro acontece antes de qualquer resposta.
//
// Aqui o schema que VAI para o modelo é o menor denominador comum (type,
// properties, required, description, enum, items, anyOf, nullable), com as
// restrições perdidas viradas em texto na description. A VALIDAÇÃO continua
// sendo a do zod original, no servidor, antes de executar a ferramenta: o
// modelo pode errar um uuid, mas o erro vira `tool-error` para ele corrigir,
// nunca uma consulta com entrada inválida.

import { jsonSchema, type ToolSet } from "ai";
import { z } from "zod";

type Json = Record<string, unknown>;

/** Chaves que sobrevivem à simplificação (fora `nullable`, que é derivada). */
export const CHAVES_SCHEMA_GATEWAY = [
  "type",
  "properties",
  "required",
  "description",
  "enum",
  "items",
  "anyOf",
] as const;

const MAX_DESCRICAO = 300;

function ehObjeto(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function ehNulo(v: unknown): boolean {
  return ehObjeto(v) && v.type === "null" && Object.keys(v).length === 1;
}

function dicas(node: Json): string[] {
  const d: string[] = [];
  if (typeof node.format === "string") d.push(`formato: ${node.format}`);
  if (typeof node.minimum === "number") d.push(`mínimo ${node.minimum}`);
  if (typeof node.exclusiveMinimum === "number") d.push(`maior que ${node.exclusiveMinimum}`);
  if (typeof node.maximum === "number") d.push(`máximo ${node.maximum}`);
  if (typeof node.maxLength === "number") d.push(`até ${node.maxLength} caracteres`);
  if (typeof node.maxItems === "number") d.push(`até ${node.maxItems} itens`);
  return d;
}

/** JSON Schema draft-7 → subconjunto aceito por qualquer gateway (recursivo). */
export function simplificarSchemaParaGateway(schema: unknown): Json {
  if (!ehObjeto(schema)) return {};
  let node: Json = { ...schema };
  let nullable = false;

  // type: ["string", "null"] → type: "string" + nullable
  if (Array.isArray(node.type)) {
    const tipos = (node.type as unknown[]).filter((t) => t !== "null");
    if (tipos.length !== (node.type as unknown[]).length) nullable = true;
    node.type = tipos.length === 1 ? tipos[0] : tipos;
  }

  // anyOf: [X, {type: "null"}] → X + nullable
  if (Array.isArray(node.anyOf)) {
    const ramos = node.anyOf as unknown[];
    const semNulo = ramos.filter((r) => !ehNulo(r));
    if (semNulo.length !== ramos.length) nullable = true;
    if (semNulo.length === 1 && ehObjeto(semNulo[0])) {
      const { anyOf: _anyOf, ...resto } = node;
      node = { ...semNulo[0], ...resto };
      delete node.anyOf;
    } else {
      node.anyOf = semNulo.map(simplificarSchemaParaGateway);
    }
  }

  // const → enum de um valor (Gemini não conhece const)
  if ("const" in node && !("enum" in node)) {
    node.enum = [node.const];
  }

  const out: Json = {};
  for (const chave of CHAVES_SCHEMA_GATEWAY) {
    if (!(chave in node)) continue;
    const valor = node[chave];
    if (chave === "properties" && ehObjeto(valor)) {
      out.properties = Object.fromEntries(
        Object.entries(valor).map(([k, v]) => [k, simplificarSchemaParaGateway(v)]),
      );
    } else if (chave === "items") {
      out.items = simplificarSchemaParaGateway(valor);
    } else if (chave !== "anyOf") {
      out[chave] = valor;
    } else {
      out.anyOf = valor;
    }
  }

  const extras = dicas(node);
  if (extras.length > 0) {
    const base = typeof out.description === "string" ? out.description.trim() : "";
    out.description = `${base}${base ? " " : ""}(${extras.join("; ")})`.slice(0, MAX_DESCRICAO);
  }
  if (nullable) out.nullable = true;
  return out;
}

function ehZod(v: unknown): v is z.ZodType {
  return typeof v === "object" && v !== null && "_zod" in v;
}

/**
 * Troca o `inputSchema` zod de cada ferramenta por um JSON Schema simplificado
 * que valida com o zod original. O resto da ferramenta (descrição, execute)
 * fica igual.
 */
export function compatibilizarFerramentasSamiQ(tools: ToolSet): ToolSet {
  const out: ToolSet = {};
  for (const [nome, ferramenta] of Object.entries(tools)) {
    const original = ferramenta.inputSchema;
    if (!ehZod(original)) {
      out[nome] = ferramenta;
      continue;
    }
    const simples = simplificarSchemaParaGateway(
      z.toJSONSchema(original, { target: "draft-7", io: "input" }),
    );
    out[nome] = {
      ...ferramenta,
      inputSchema: jsonSchema(simples, {
        validate: (value) => {
          const r = original.safeParse(value);
          return r.success ? { success: true, value: r.data } : { success: false, error: r.error };
        },
      }),
    };
  }
  return out;
}
