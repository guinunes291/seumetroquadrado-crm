// Compatibilidade dos schemas das ferramentas com o gateway: o que vai para o
// modelo é o menor denominador comum; a validação continua sendo a do zod.
import { describe, expect, it } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import {
  CHAVES_SCHEMA_GATEWAY,
  compatibilizarFerramentasSamiQ,
  simplificarSchemaParaGateway,
} from "@/lib/samiq-ferramentas-compat";
import * as T from "@/lib/samiq-tools";
import * as P from "@/lib/samiq-propostas";
import * as S from "@/lib/samiq-skills";

const PERMITIDAS = new Set<string>([...CHAVES_SCHEMA_GATEWAY, "nullable"]);

function chavesDoSchema(
  o: unknown,
  acc = new Set<string>(),
  dentroDeProperties = false,
): Set<string> {
  if (Array.isArray(o)) {
    for (const v of o) chavesDoSchema(v, acc, false);
    return acc;
  }
  if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o)) {
      // dentro de "properties" as chaves são nomes de campos, não palavras do schema
      if (!dentroDeProperties) acc.add(k);
      chavesDoSchema(v, acc, k === "properties");
    }
  }
  return acc;
}

function schemasZod(mod: Record<string, unknown>, sufixo: string): Array<[string, z.ZodType]> {
  return Object.entries(mod).filter(
    (e): e is [string, z.ZodType] =>
      e[0].endsWith(sufixo) && !!e[1] && typeof e[1] === "object" && "_zod" in (e[1] as object),
  );
}

describe("simplificarSchemaParaGateway", () => {
  it("remove $schema, additionalProperties, format, pattern e limites; move o que importa para a description", () => {
    const s = simplificarSchemaParaGateway(
      z.toJSONSchema(T.DetalheClienteInput, { target: "draft-7", io: "input" }),
    );
    expect(s).toEqual({
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description:
            "id do cliente (vem de buscar_clientes, da fila ou da agenda) (formato: uuid)",
        },
      },
      required: ["leadId"],
    });
  });

  it("const vira enum; nullable via anyOf/type[] vira nullable; limites viram dica", () => {
    const s = simplificarSchemaParaGateway({
      $schema: "x",
      type: "object",
      additionalProperties: false,
      properties: {
        tipo: { type: "string", const: "anotar" },
        quando: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] },
        nota: { type: ["string", "null"], maxLength: 500 },
        limite: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          exclusiveMinimum: 0,
          description: "Padrão 8",
        },
        lista: { type: "array", maxItems: 12, items: { type: "string", minLength: 1 } },
      },
      required: ["tipo"],
    });
    expect(s.properties).toEqual({
      tipo: { type: "string", enum: ["anotar"] },
      quando: { type: "string", nullable: true, description: "(formato: date-time)" },
      nota: { type: "string", nullable: true, description: "(até 500 caracteres)" },
      limite: { type: "integer", description: "Padrão 8 (mínimo 1; maior que 0; máximo 20)" },
      lista: { type: "array", items: { type: "string" }, description: "(até 12 itens)" },
    });
    expect(Object.keys(s)).toEqual(["type", "properties", "required"]);
  });

  it("TODOS os schemas de ferramenta da Sami saem só com as chaves permitidas", () => {
    const todos = [
      ...schemasZod(T, "Input"),
      ...schemasZod(P, "Payload"),
      ...schemasZod(S, "Input"),
    ];
    expect(todos.length).toBeGreaterThanOrEqual(18);
    for (const [nome, schema] of todos) {
      const s = simplificarSchemaParaGateway(
        z.toJSONSchema(schema, { target: "draft-7", io: "input" }),
      );
      const chaves = [...chavesDoSchema(s)];
      const proibidas = chaves.filter((k) => !PERMITIDAS.has(k));
      expect(proibidas, nome).toEqual([]);
      expect(s.type, nome).toBe("object");
    }
  });
});

describe("compatibilizarFerramentasSamiQ", () => {
  it("troca o inputSchema por JSON simplificado e mantém a validação zod, a descrição e o execute", async () => {
    const tools = {
      detalhe_cliente: tool({
        description: "Detalhe",
        inputSchema: T.DetalheClienteInput,
        execute: async (input) => ({ id: input.leadId }),
      }),
    };
    const compat = compatibilizarFerramentasSamiQ(tools);
    const schema = compat.detalhe_cliente.inputSchema as unknown as {
      jsonSchema: Record<string, unknown>;
      validate: (v: unknown) => { success: boolean } | Promise<{ success: boolean }>;
    };
    expect(JSON.stringify(schema.jsonSchema)).not.toMatch(
      /"\$schema"|"additionalProperties"|"format"|"pattern"/,
    );
    expect(compat.detalhe_cliente.description).toBe("Detalhe");
    expect(compat.detalhe_cliente.execute).toBe(tools.detalhe_cliente.execute);
    expect((await schema.validate({ leadId: "nao-uuid" })).success).toBe(false);
    expect(
      (await schema.validate({ leadId: "123e4567-e89b-12d3-a456-426614174000" })).success,
    ).toBe(true);
    expect((await schema.validate({})).success).toBe(false);
  });
});
