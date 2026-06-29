import { describe, it, expect } from "vitest";
import { scoreLead, diasDesde, TIER_DOT, TIER_LABEL } from "@/lib/priority";

const AGORA = new Date("2026-06-28T12:00:00.000Z");

describe("score de prioridade", () => {
  it("quente pontua mais que frio na mesma etapa", () => {
    const quente = scoreLead({ temperatura: "quente", status: "em_atendimento", agora: AGORA, ultimaInteracao: AGORA.toISOString() });
    const frio = scoreLead({ temperatura: "frio", status: "em_atendimento", agora: AGORA, ultimaInteracao: AGORA.toISOString() });
    expect(quente.score).toBeGreaterThan(frio.score);
    expect(quente.motivo.toLowerCase()).toContain("quente");
  });

  it("etapa mais próxima da venda pontua mais", () => {
    const credito = scoreLead({ status: "analise_credito", agora: AGORA, ultimaInteracao: AGORA.toISOString() });
    const aguardando = scoreLead({ status: "aguardando_atendimento", agora: AGORA, ultimaInteracao: AGORA.toISOString() });
    expect(credito.score).toBeGreaterThan(aguardando.score);
  });

  it("SLA estourado eleva o score e entra no motivo", () => {
    const base = scoreLead({ status: "em_atendimento", agora: AGORA, ultimaInteracao: AGORA.toISOString() });
    const estourado = scoreLead({ status: "em_atendimento", slaStatus: "estourado", agora: AGORA, ultimaInteracao: AGORA.toISOString() });
    expect(estourado.score).toBeGreaterThan(base.score);
    expect(estourado.motivo).toContain("SLA estourado");
  });

  it("dias sem contato aumentam o score e aparecem no motivo (>=3 dias)", () => {
    const recente = scoreLead({ status: "em_atendimento", ultimaInteracao: AGORA.toISOString(), agora: AGORA });
    const parado = scoreLead({
      status: "em_atendimento",
      ultimaInteracao: new Date("2026-06-22T12:00:00.000Z").toISOString(), // 6 dias
      agora: AGORA,
    });
    expect(parado.score).toBeGreaterThan(recente.score);
    expect(parado.motivo).toContain("6 dias sem contato");
  });

  it("sem interação registrada entra no motivo", () => {
    const r = scoreLead({ status: "novo", ultimaInteracao: null, agora: AGORA });
    expect(r.motivo.toLowerCase()).toContain("sem contato registrado");
  });

  it("score fica entre 0 e 100 mesmo no pior caso", () => {
    const r = scoreLead({
      temperatura: "quente",
      status: "analise_credito",
      slaStatus: "estourado",
      ultimaInteracao: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      agora: AGORA,
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.tier).toBe("alta");
  });

  it("tiers seguem os limiares (alta>=60, media>=35, baixa<35)", () => {
    expect(scoreLead({ temperatura: "frio", status: "novo", ultimaInteracao: AGORA.toISOString(), agora: AGORA }).tier).toBe("baixa");
    expect(scoreLead({ temperatura: "quente", status: "analise_credito", slaStatus: "estourado", ultimaInteracao: null, agora: AGORA }).tier).toBe("alta");
  });

  it("diasDesde calcula corretamente e trata nulos", () => {
    expect(diasDesde(null, AGORA)).toBeNull();
    expect(diasDesde("2026-06-25T12:00:00.000Z", AGORA)).toBe(3);
    expect(diasDesde(AGORA.toISOString(), AGORA)).toBe(0);
  });

  it("expõe classes de cor e rótulo para cada tier", () => {
    (["alta", "media", "baixa"] as const).forEach((t) => {
      expect(TIER_DOT[t]).toBeTruthy();
      expect(TIER_LABEL[t]).toBeTruthy();
    });
  });
});
