import { describe, it, expect } from "vitest";
import { indiceSinalFechamento, ETAPAS_RADAR, FECHAMENTO_TIER_LABEL } from "@/lib/fechamento";

const AGORA = new Date("2026-06-29T12:00:00Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();

describe("indiceSinalFechamento", () => {
  it("etapa mais perto do contrato tem índice heurístico maior", () => {
    const analise = indiceSinalFechamento({
      status: "analise_credito",
      ultimaInteracao: diasAtras(1),
      agora: AGORA,
    });
    const agendado = indiceSinalFechamento({
      status: "agendado",
      ultimaInteracao: diasAtras(1),
      agora: AGORA,
    });
    expect(analise.indice).toBeGreaterThan(agendado.indice);
    expect(analise.nivel).toBe("alta");
    expect(analise.metodo).toBe("heuristico");
  });

  it("quente sobe e frio derruba o índice", () => {
    const base = { status: "visita_realizada", ultimaInteracao: diasAtras(1), agora: AGORA };
    const quente = indiceSinalFechamento({ ...base, temperatura: "quente" });
    const frio = indiceSinalFechamento({ ...base, temperatura: "frio" });
    expect(quente.indice).toBeGreaterThan(frio.indice);
  });

  it("lead parado há muito tempo perde índice e explica o fator", () => {
    const recente = indiceSinalFechamento({
      status: "proposta_enviada",
      ultimaInteracao: diasAtras(1),
      agora: AGORA,
    });
    const parado = indiceSinalFechamento({
      status: "proposta_enviada",
      ultimaInteracao: diasAtras(20),
      agora: AGORA,
    });
    expect(parado.indice).toBeLessThan(recente.indice);
    expect(parado.fatores).toContain("20 dias sem interação");
  });

  it("etapa fora do funil de negociação zera a base", () => {
    const novo = indiceSinalFechamento({ status: "novo", agora: AGORA });
    expect(novo.indice).toBeLessThan(30);
    expect(novo.nivel).toBe("baixa");
    expect(ETAPAS_RADAR).not.toContain("novo");
  });

  it("clampa entre 0 e 100", () => {
    const r = indiceSinalFechamento({
      status: "analise_credito",
      temperatura: "quente",
      ultimaInteracao: diasAtras(0),
      proximoFollowup: AGORA.toISOString(),
      agora: AGORA,
    });
    expect(r.indice).toBeLessThanOrEqual(100);
    expect(r.indice).toBeGreaterThanOrEqual(0);
  });

  it("expõe rótulos de tier", () => {
    expect(FECHAMENTO_TIER_LABEL.alta).toBeTruthy();
  });
});
