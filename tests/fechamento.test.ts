import { describe, it, expect } from "vitest";
import {
  probabilidadeFechamento,
  ETAPAS_RADAR,
  FECHAMENTO_TIER_LABEL,
} from "@/lib/fechamento";

const AGORA = new Date("2026-06-29T12:00:00Z");
const diasAtras = (n: number) =>
  new Date(AGORA.getTime() - n * 86_400_000).toISOString();

describe("probabilidadeFechamento", () => {
  it("etapa mais perto do contrato tem probabilidade maior", () => {
    const analise = probabilidadeFechamento({
      status: "analise_credito",
      ultimaInteracao: diasAtras(1),
      agora: AGORA,
    });
    const agendado = probabilidadeFechamento({
      status: "agendado",
      ultimaInteracao: diasAtras(1),
      agora: AGORA,
    });
    expect(analise.probabilidade).toBeGreaterThan(agendado.probabilidade);
    expect(analise.tier).toBe("alta");
  });

  it("quente sobe e frio derruba a probabilidade", () => {
    const base = { status: "visita_realizada", ultimaInteracao: diasAtras(1), agora: AGORA };
    const quente = probabilidadeFechamento({ ...base, temperatura: "quente" });
    const frio = probabilidadeFechamento({ ...base, temperatura: "frio" });
    expect(quente.probabilidade).toBeGreaterThan(frio.probabilidade);
  });

  it("lead parado há muito tempo perde probabilidade e cita o motivo", () => {
    const recente = probabilidadeFechamento({
      status: "proposta_enviada",
      ultimaInteracao: diasAtras(1),
      agora: AGORA,
    });
    const parado = probabilidadeFechamento({
      status: "proposta_enviada",
      ultimaInteracao: diasAtras(20),
      agora: AGORA,
    });
    expect(parado.probabilidade).toBeLessThan(recente.probabilidade);
    expect(parado.motivo).toContain("20 dias parado");
  });

  it("etapa fora do funil de negociação zera a base", () => {
    const novo = probabilidadeFechamento({ status: "novo", agora: AGORA });
    expect(novo.probabilidade).toBeLessThan(30);
    expect(novo.tier).toBe("baixa");
    expect(ETAPAS_RADAR).not.toContain("novo");
  });

  it("clampa entre 0 e 100", () => {
    const r = probabilidadeFechamento({
      status: "analise_credito",
      temperatura: "quente",
      ultimaInteracao: diasAtras(0),
      proximoFollowup: AGORA.toISOString(),
      agora: AGORA,
    });
    expect(r.probabilidade).toBeLessThanOrEqual(100);
    expect(r.probabilidade).toBeGreaterThanOrEqual(0);
  });

  it("expõe rótulos de tier", () => {
    expect(FECHAMENTO_TIER_LABEL.alta).toBeTruthy();
  });
});
