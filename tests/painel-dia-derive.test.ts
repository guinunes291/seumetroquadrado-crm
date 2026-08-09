import { describe, expect, it } from "vitest";
import {
  detalheLegivel,
  drillSearchDoTipo,
  excecoesParaExport,
  montarPainelDegradado,
  normalizarPainelDia,
  resumoSemanalParaSheets,
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
        // O 8º tipo (item 2.6) passa pelo gate de TIPO_META como os demais.
        { ...excecaoBase, tipo: "documentacao_travada", lead_id: "l2" },
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
    expect(p.excecoes).toHaveLength(2);
    expect(p.excecoes[1].tipo).toBe("documentacao_travada");
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
    // Durações em minutos/horas saem no formato único hh:mm (formatDuration).
    expect(detalheLegivel({ ...excecaoBase, detalhe: { minutos: 45, sla_minutos: 30 } })).toBe(
      "00:45 (SLA 00:30)",
    );
    expect(detalheLegivel({ ...excecaoBase, detalhe: { vencido_ha_horas: 6 } })).toBe(
      "vencido há 06:00",
    );
    expect(detalheLegivel({ ...excecaoBase, detalhe: {} })).toBe("");
  });

  it("documentacao_travada mostra a contagem de docs, não o 'parado' genérico", () => {
    // O payload carrega dias_parado TAMBÉM — o ramo específico tem que vencer.
    expect(
      detalheLegivel({
        ...excecaoBase,
        tipo: "documentacao_travada",
        detalhe: { docs_pendentes: 2, dias_parado: 5, limiar_dias: 3 },
      }),
    ).toBe("2 doc(s) sem movimento há 5d (limiar 3d)");
  });

  it("drillSearchDoTipo aponta para filtros que a /leads entende", () => {
    expect(drillSearchDoTipo("sla_estourado")).toEqual({ status: "aguardando_atendimento" });
    expect(drillSearchDoTipo("parado")).toEqual({ contato: "sem_contato_5d" });
    expect(drillSearchDoTipo("analise_parada")).toEqual({ status: "analise_credito" });
    expect(drillSearchDoTipo("documentacao_travada")).toEqual({ status: "analise_credito" });
    expect(drillSearchDoTipo("sem_corretor")).toEqual({});
  });

  it("excecoesParaExport gera linhas planas com rótulos", () => {
    const rows = excecoesParaExport([excecaoBase]);
    expect(rows[0].Tipo).toBe("Parados");
    expect(rows[0].Lead).toBe("João");
    expect(rows[0]["Valor potencial (R$)"]).toBe(240000);
  });
});

describe("resumoSemanalParaSheets", () => {
  it("converte o jsonb do resumo em abas de XLSX", () => {
    const sheets = resumoSemanalParaSheets({
      semana: { de: "2026-07-19", ate: "2026-07-25" },
      kpis: {
        leads_novos: 40,
        leads_novos_prev: 35,
        visitas: 12,
        vendas: 3,
        vendas_prev: 2,
        vgv: 600000,
        perdidos: 5,
      },
      por_corretor: [
        { nome: "Ana", leads_novos: 20, interacoes: 80, visitas: 7, vendas: 2, vgv: 400000 },
      ],
    });
    expect(sheets.map((s) => s.name)).toEqual(["Resumo", "Por corretor"]);
    expect(sheets[0].rows.find((r) => r.Indicador === "Vendas aprovadas")).toMatchObject({
      Valor: 3,
      "Semana anterior": 2,
    });
    expect(sheets[1].rows[0].Corretor).toBe("Ana");
  });

  it("payload inválido devolve lista vazia", () => {
    expect(resumoSemanalParaSheets(null)).toEqual([]);
  });
});
