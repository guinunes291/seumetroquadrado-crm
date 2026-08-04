// A máquina de estados do funil existe DUAS vezes: em public.transicao_lead_permitida
// (a autoridade — transicionar_lead rejeita qualquer transição fora dela) e em
// TRANSICOES/transicaoLeadPermitida (src/lib/leads.ts), que a UI usa para só
// OFERECER destinos válidos em vez de deixar o corretor tentar e tomar erro.
//
// O comentário de src/lib/leads.ts pede "ao alterar a função SQL, atualize aqui
// junto" — mas nada garantia isso. Divergir é silencioso e cruel: o menu
// oferece uma etapa que o banco recusa, ou esconde uma que ele aceitaria.
// Este teste lê o SQL vigente e compara par a par.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LEAD_STATUS_ORDER, transicaoLeadPermitida, type LeadStatus } from "../src/lib/leads";

const DIR = join(process.cwd(), "supabase", "migrations");

/** Última migração (ordem lexicográfica = cronológica) que define a função. */
function sqlVigente(): string {
  const alvo = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      readFileSync(join(DIR, f), "utf8").includes(
        "CREATE OR REPLACE FUNCTION public.transicao_lead_permitida",
      ),
    )
    .pop();
  if (!alvo) throw new Error("nenhuma migração define transicao_lead_permitida");
  return readFileSync(join(DIR, alvo), "utf8");
}

/** Extrai de → {destinos, exigeGestao} do CASE da função. */
function matrizDoSql(sql: string): Map<string, { destinos: Set<string>; gestao: boolean }> {
  const corpo = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.transicao_lead_permitida"));
  const fim = corpo.indexOf("$$;");
  const trecho = corpo.slice(0, fim === -1 ? undefined : fim);

  const mapa = new Map<string, { destinos: Set<string>; gestao: boolean }>();
  // WHEN p_de::text = 'x'  |  WHEN p_de::text IN ('x','y')
  //   THEN [p_gestao AND] p_para::text = ANY (ARRAY['a','b',...])
  const re =
    /WHEN\s+p_de::text\s+(?:=\s*'([a-z_]+)'|IN\s*\(([^)]+)\))\s*\n?\s*THEN\s+(p_gestao\s+AND\s+)?p_para::text\s*=\s*ANY\s*\(ARRAY\[([^\]]+)\]\)/g;

  for (const m of trecho.matchAll(re)) {
    const origens = m[1]
      ? [m[1]]
      : m[2].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    const gestao = Boolean(m[3]);
    const destinos = new Set(m[4].split(",").map((s) => s.trim().replace(/^'|'$/g, "")));
    for (const de of origens) mapa.set(de, { destinos, gestao });
  }
  return mapa;
}

describe("funil — o espelho TypeScript bate com a autoridade SQL", () => {
  const sql = sqlVigente();
  const matriz = matrizDoSql(sql);

  it("o parser encontrou a máquina de estados inteira", () => {
    // Se o formato do SQL mudar a ponto do regex não casar, o teste vira um
    // falso verde — esta asserção impede isso.
    expect(matriz.size).toBeGreaterThanOrEqual(13);
    expect(matriz.has("analise_credito")).toBe(true);
    expect(matriz.has("contrato_fechado")).toBe(true);
  });

  it("as etapas novas do resultado da análise existem no SQL", () => {
    expect(matriz.has("analise_aprovada")).toBe(true);
    expect(matriz.has("analise_reprovada")).toBe(true);
    expect(matriz.get("analise_credito")!.destinos).toContain("analise_aprovada");
    expect(matriz.get("analise_credito")!.destinos).toContain("analise_reprovada");
    // Nenhuma das duas exige papel de gestão: quem recebe o retorno da Caixa
    // e registra é o corretor.
    expect(matriz.get("analise_aprovada")!.gestao).toBe(false);
    expect(matriz.get("analise_reprovada")!.gestao).toBe(false);
  });

  it("cada par (de, para) decide igual nos dois lados", () => {
    const todos = [...matriz.keys()] as LeadStatus[];
    const divergentes: string[] = [];

    for (const de of todos) {
      const regra = matriz.get(de)!;
      for (const para of todos) {
        if (de === para) continue;
        for (const gestao of [false, true]) {
          const sqlPermite = regra.destinos.has(para) && (!regra.gestao || gestao);
          const tsPermite = transicaoLeadPermitida(de, para, gestao);
          if (sqlPermite !== tsPermite) {
            divergentes.push(
              `${de} → ${para} (gestao=${gestao}): SQL=${sqlPermite}, TS=${tsPermite}`,
            );
          }
        }
      }
    }

    expect(divergentes).toEqual([]);
  });

  it("toda etapa do funil do corretor é conhecida pelo SQL", () => {
    for (const s of LEAD_STATUS_ORDER) {
      expect(matriz.has(s), `SQL não conhece a origem '${s}'`).toBe(true);
    }
  });
});
