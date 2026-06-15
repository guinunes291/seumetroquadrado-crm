import { describe, it, expect } from "vitest";
import {
  isInPeriod,
  pct,
  progressoMeta,
  computeAgentMetrics,
  rankAgents,
  MESES_PT,
} from "@/lib/metas";

describe("metas helpers", () => {
  it("MESES_PT tem 12 meses", () => {
    expect(MESES_PT).toHaveLength(12);
    expect(MESES_PT[0]).toBe("Janeiro");
    expect(MESES_PT[11]).toBe("Dezembro");
  });

  it("isInPeriod casa ano/mês", () => {
    expect(isInPeriod("2026-06-15T10:00:00Z", 2026, 6)).toBe(true);
    expect(isInPeriod("2026-05-31T10:00:00Z", 2026, 6)).toBe(false);
    expect(isInPeriod(null, 2026, 6)).toBe(false);
    expect(isInPeriod(undefined, 2026, 6)).toBe(false);
  });

  it("pct calcula porcentagem inteira", () => {
    expect(pct(50, 200)).toBe(25);
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
  });

  it("progressoMeta cap em 100", () => {
    expect(progressoMeta(10, 5)).toBe(100);
    expect(progressoMeta(5, 10)).toBe(50);
    expect(progressoMeta(0, 0)).toBe(0);
  });
});

describe("computeAgentMetrics", () => {
  const leads = [
    { status: "novo", corretor_id: "a", created_at: "2026-06-01T10:00:00Z" },
    { status: "em_atendimento", corretor_id: "a", created_at: "2026-06-10T10:00:00Z" },
    { status: "contrato_fechado", corretor_id: "a", created_at: "2026-06-15T10:00:00Z" },
    { status: "perdido", corretor_id: "a", created_at: "2026-06-20T10:00:00Z" },
    // outro corretor / mês fora
    { status: "contrato_fechado", corretor_id: "b", created_at: "2026-06-12T10:00:00Z" },
    { status: "contrato_fechado", corretor_id: "a", created_at: "2026-05-15T10:00:00Z" },
    // sem corretor: ignora
    { status: "novo", corretor_id: null, created_at: "2026-06-01T10:00:00Z" },
  ];
  const ags = [
    { status: "realizado", corretor_id: "a", data_inicio: "2026-06-05T14:00:00Z" },
    { status: "realizado", corretor_id: "a", data_inicio: "2026-06-12T14:00:00Z" },
    { status: "agendado", corretor_id: "a", data_inicio: "2026-06-20T14:00:00Z" },
    { status: "realizado", corretor_id: "b", data_inicio: "2026-06-08T14:00:00Z" },
    { status: "realizado", corretor_id: "a", data_inicio: "2026-05-10T14:00:00Z" }, // fora
  ];

  it("agrega corretamente por corretor no período", () => {
    const m = computeAgentMetrics(leads as any, ags as any, 2026, 6);
    const a = m.get("a")!;
    expect(a.leads_total).toBe(4);
    expect(a.leads_atendidos).toBe(3); // em_atendimento + contrato + perdido
    expect(a.vendas).toBe(1);
    expect(a.perdidos).toBe(1);
    expect(a.visitas).toBe(2); // apenas realizados em junho
    expect(a.taxa_conversao).toBe(33); // 1/3
    const b = m.get("b")!;
    expect(b.vendas).toBe(1);
    expect(b.visitas).toBe(1);
  });

  it("ignora leads sem corretor", () => {
    const m = computeAgentMetrics(leads as any, ags as any, 2026, 6);
    expect(m.size).toBe(2);
  });

  it("rankAgents ordena por vendas desc e atribui posição", () => {
    const m = computeAgentMetrics(leads as any, ags as any, 2026, 6);
    const nomes = new Map([
      ["a", "Ana"],
      ["b", "Bruno"],
    ]);
    const r = rankAgents(m, nomes);
    expect(r[0].posicao).toBe(1);
    expect(r[1].posicao).toBe(2);
    // empate em vendas (1x1): desempate pelas visitas (a=2, b=1)
    expect(r[0].corretor_id).toBe("a");
    expect(r[0].nome).toBe("Ana");
  });

  it("conta vendas por transições para contrato_fechado quando fornecidas", () => {
    const transicoes = [
      { para_status: "contrato_fechado", corretor_id: "a", created_at: "2026-06-18T10:00:00Z" },
      { para_status: "contrato_fechado", corretor_id: "a", created_at: "2026-06-25T10:00:00Z" },
      { para_status: "visita_realizada", corretor_id: "a", created_at: "2026-06-19T10:00:00Z" },
      { para_status: "contrato_fechado", corretor_id: "a", created_at: "2026-05-30T10:00:00Z" }, // fora
      { para_status: "contrato_fechado", corretor_id: "b", created_at: "2026-06-02T10:00:00Z" },
    ];
    const m = computeAgentMetrics(leads as any, ags as any, 2026, 6, transicoes as any);
    // a: 2 transições em junho (ignora a de maio e a de visita)
    expect(m.get("a")!.vendas).toBe(2);
    expect(m.get("b")!.vendas).toBe(1);
  });
});
