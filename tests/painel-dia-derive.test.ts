import { describe, expect, it } from "vitest";
import {
  detalheLegivel,
  drillSearchDoTipo,
  excecoesParaExport,
  montarPainelDegradado,
  normalizarPainelDia,
  type Excecao,
} from "@/features/gestao/painel-dia/derive";

const excecaoBase: Excecao = {
  tipo: "parado",
  severidade: 3,
  lead_id: "l1",
  lead_nome: "João",
  telefone: "11999990000",
  corretor_id: "c1",
  corretor_nome: "Ana",
  etapa: "em_atendimento",
  temperatura: "quente",
  valor_potencial: 240000,
  detalhe: { dias_parado: 3, limiar_dias: 2 },
};

describe("normalizarPainelDia", () => {
  it("normaliza o jsonb da RPC e descarta itens malformados", () => {
    const p = normalizarPainelDia({
      excecoes: [
        excecaoBase,
        { tipo: "tipo_desconhecido", lead_id: "x" },
        { tipo: "parado" }, // sem lead_id
        null,
      ],
      resumo: {
        por_tipo: { parado: 1 },
        total: 1,
        vgv_em_risco: 240000,
        corretores_sem_interacao: [{ corretor_id: "c9", nome: "Bia" }],
      },
      atualizado_em: "2026-07-26T12:00:00Z",
    });
    expect(p.excecoes).toHaveLength(1);
    expect(p.resumo.total).toBe(1);
    expect(p.resumo.vgv_em_risco).toBe(240000);
    expect(p.resumo.corretores_sem_interacao[0].nome).toBe("Bia");
    expect(p.degradado).toBe(false);
  });

  it("payload nulo vira painel vazio, nunca NaN/undefined", () => {
    const p = normalizarPainelDia(null);
    expect(p.excecoes).toEqual([]);
    expect(p.resumo.total).toBe(0);
    expect(p.resumo.vgv_em_risco).toBe(0);
  });
});

describe("montarPainelDegradado", () => {
  it("compõe SLA estourado + parados sem duplicar lead e marca degradado", () => {
    const p = montarPainelDegradado(
      [
        {
          lead_id: "l1",
          corretor_id: "c1",
          nome: "João",
          telefone: "11",
          status: "aguardando_atendimento",
          sla_minutos: 30,
          minutos_decorridos: 45,
          sla_status: "estourado",
          temperatura_calc: "quente",
        },
        {
          lead_id: "l2",
          corretor_id: "c1",
          nome: "Maria",
          telefone: "11",
          status: "novo",
          sla_minutos: 30,
          minutos_decorridos: 10,
          sla_status: "ok",
          temperatura_calc: "morno",
        },
      ],
      [
        {
          lead_id: "l1", // duplicado com o SLA — não pode aparecer 2x
          nome: "João",
          telefone: "11",
          corretor_id: "c1",
          corretor_nome: "Ana",
          status: "aguardando_atendimento",
          minutos_parado: 45,
        },
        {
          lead_id: "l3",
          nome: "Pedro",
          telefone: "11",
          corretor_id: "c2",
          corretor_nome: "Bia",
          status: "em_atendimento",
          minutos_parado: 90,
        },
      ],
    );
    expect(p.degradado).toBe(true);
    expect(p.excecoes.map((e) => e.lead_id)).toEqual(["l1", "l3"]);
    expect(p.resumo.por_tipo.sla_estourado).toBe(1);
    expect(p.resumo.por_tipo.parado).toBe(1);
    // SLA ok não vira exceção.
    expect(p.excecoes.find((e) => e.lead_id === "l2")).toBeUndefined();
  });
});

describe("apresentação e drill", () => {
  it("detalheLegivel cobre os formatos conhecidos", () => {
    expect(detalheLegivel(excecaoBase)).toBe("3d parado (limiar 2d)");
    expect(
      detalheLegivel({ ...excecaoBase, detalhe: { minutos: 45, sla_minutos: 30 } }),
    ).toBe("45 min (SLA 30)");
    expect(detalheLegivel({ ...excecaoBase, detalhe: { vencido_ha_horas: 6 } })).toBe(
      "vencido há 6h",
    );
    expect(detalheLegivel({ ...excecaoBase, detalhe: {} })).toBe("");
  });

  it("drillSearchDoTipo aponta para filtros que a /leads entende", () => {
    expect(drillSearchDoTipo("sla_estourado")).toEqual({ status: "aguardando_atendimento" });
    expect(drillSearchDoTipo("parado")).toEqual({ contato: "sem_contato_5d" });
    expect(drillSearchDoTipo("analise_parada")).toEqual({ status: "analise_credito" });
    expect(drillSearchDoTipo("sem_corretor")).toEqual({});
  });

  it("excecoesParaExport gera linhas planas com rótulos", () => {
    const rows = excecoesParaExport([excecaoBase]);
    expect(rows[0].Tipo).toBe("Parados");
    expect(rows[0].Lead).toBe("João");
    expect(rows[0]["Valor potencial (R$)"]).toBe(240000);
  });
});
