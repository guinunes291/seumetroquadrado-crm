// Regressão do incidente 2026-08-01: corretora marcada Inapta na roleta
// Marquinhos continuou recebendo lead de chatbot porque seguia ativa numa
// roleta de CAMPANHA. O agrupamento abaixo é o que a central usa para avisar
// "Inapto aqui, mas continua recebendo em: ...".

import { describe, expect, it } from "vitest";

import { agruparRoletasPorCorretor, type ParticipacaoBruta } from "@/features/distribuicao/queries";

const AGORA = new Date("2026-08-01T15:00:00Z").getTime();
const JESSICA = "0f7f0a7e-1f2a-4b3c-9d4e-5a6b7c8d9e01";

function roleta(slug: string, nome: string, tipo = "sistema", ativo = true) {
  return { slug, nome, tipo, ativo };
}

function participacao(over: Partial<ParticipacaoBruta> = {}): ParticipacaoBruta {
  return {
    corretor_id: JESSICA,
    ativo: true,
    pausado_ate: null,
    roleta: roleta("plantao", "Plantão"),
    ...over,
  };
}

describe("agruparRoletasPorCorretor", () => {
  it("mantém a roleta em que o corretor entra no rodízio", () => {
    const mapa = agruparRoletasPorCorretor([participacao()], AGORA);
    expect(mapa.get(JESSICA)).toEqual([{ slug: "plantao", nome: "Plantão", tipo: "sistema" }]);
  });

  it("descarta participação inativa (removido da roleta)", () => {
    const mapa = agruparRoletasPorCorretor([participacao({ ativo: false })], AGORA);
    expect(mapa.has(JESSICA)).toBe(false);
  });

  it("descarta pausa vigente — é assim que o toggle Inapto grava (2099)", () => {
    const mapa = agruparRoletasPorCorretor(
      [participacao({ pausado_ate: "2099-12-31T23:59:59Z" })],
      AGORA,
    );
    expect(mapa.has(JESSICA)).toBe(false);
  });

  it("mantém pausa já vencida — o corretor voltou ao rodízio sozinho", () => {
    const mapa = agruparRoletasPorCorretor(
      [participacao({ pausado_ate: "2026-07-30T00:00:00Z" })],
      AGORA,
    );
    expect(mapa.get(JESSICA)).toHaveLength(1);
  });

  it("descarta roleta desativada", () => {
    const mapa = agruparRoletasPorCorretor(
      [participacao({ roleta: roleta("landing", "Landing", "sistema", false) })],
      AGORA,
    );
    expect(mapa.has(JESSICA)).toBe(false);
  });

  it("aceita o embed como array (variação do PostgREST)", () => {
    const mapa = agruparRoletasPorCorretor(
      [participacao({ roleta: [roleta("landing", "Landing")] })],
      AGORA,
    );
    expect(mapa.get(JESSICA)?.[0]?.slug).toBe("landing");
  });

  it("ignora linha sem roleta embutida em vez de quebrar", () => {
    const mapa = agruparRoletasPorCorretor([participacao({ roleta: null })], AGORA);
    expect(mapa.has(JESSICA)).toBe(false);
  });

  it("o caso do incidente: Inapta na Marquinhos, ativa na campanha", () => {
    const mapa = agruparRoletasPorCorretor(
      [
        participacao({
          pausado_ate: "2099-12-31T23:59:59Z",
          roleta: roleta("marquinhos", "Marquinhos"),
        }),
        participacao({ roleta: roleta("ma-vila-prudente", "MA Vila Prudente", "campanha") }),
        participacao({ roleta: roleta("plantao", "Plantão") }),
        participacao({ roleta: roleta("landing", "Landing") }),
      ],
      AGORA,
    );
    const slugs = mapa.get(JESSICA)?.map((r) => r.slug);
    expect(slugs).not.toContain("marquinhos");
    expect(slugs).toEqual(["landing", "ma-vila-prudente", "plantao"]);
  });

  it("agrupa por corretor sem misturar carteiras", () => {
    const outro = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    const mapa = agruparRoletasPorCorretor(
      [
        participacao({ roleta: roleta("plantao", "Plantão") }),
        participacao({ corretor_id: outro, roleta: roleta("landing", "Landing") }),
      ],
      AGORA,
    );
    expect(mapa.get(JESSICA)?.map((r) => r.slug)).toEqual(["plantao"]);
    expect(mapa.get(outro)?.map((r) => r.slug)).toEqual(["landing"]);
  });
});
