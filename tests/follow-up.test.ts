import { describe, it, expect } from "vitest";
import { followUpParaStatus } from "@/lib/follow-up";
import type { LeadStatus } from "@/lib/leads";

const AGORA = new Date("2026-06-28T12:00:00.000Z");

describe("followUpParaStatus — motor anti-perda", () => {
  it("não gera follow-up para etapas sem acompanhamento", () => {
    const semFollowUp: LeadStatus[] = [
      "novo",
      "aguardando_atendimento",
      "contrato_fechado",
      "pos_venda",
      "perdido",
    ];
    for (const s of semFollowUp) {
      expect(followUpParaStatus(s, { agora: AGORA })).toBeNull();
    }
  });

  it("gera follow-up para as etapas que pedem acompanhamento", () => {
    const comFollowUp: LeadStatus[] = [
      "agendado",
      "visita_realizada",
      "analise_credito",
      "em_atendimento",
      "aguardando_retorno",
      "qualificado",
      "proposta_enviada",
    ];
    for (const s of comFollowUp) {
      const tpl = followUpParaStatus(s, { nome: "Maria", agora: AGORA });
      expect(tpl).not.toBeNull();
      expect(tpl!.titulo).toContain("Maria");
      expect(tpl!.vencimento).toBeTruthy();
    }
  });

  it("não deixa qualificação ou proposta sem próxima ação", () => {
    const qualificado = followUpParaStatus("qualificado", { nome: "Maria", agora: AGORA })!;
    const proposta = followUpParaStatus("proposta_enviada", { nome: "Maria", agora: AGORA })!;
    expect(qualificado.titulo).toContain("Apresentar opções");
    expect(proposta.titulo).toContain("Acompanhar a proposta");
    expect(qualificado.vencimento).toBe(new Date("2026-06-30T12:00:00.000Z").toISOString());
  });

  it("usa um destinatário genérico quando não há nome", () => {
    const tpl = followUpParaStatus("visita_realizada", { agora: AGORA });
    expect(tpl!.titulo).toContain("o cliente");
  });

  it("pós-visita vence em 2 dias com prioridade alta", () => {
    const tpl = followUpParaStatus("visita_realizada", { nome: "João", agora: AGORA })!;
    expect(tpl.tipo).toBe("follow_up");
    expect(tpl.prioridade).toBe("alta");
    expect(tpl.vencimento).toBe(new Date("2026-06-30T12:00:00.000Z").toISOString());
  });

  it("cobrança de crédito vence em 3 dias", () => {
    const tpl = followUpParaStatus("analise_credito", { nome: "João", agora: AGORA })!;
    expect(tpl.vencimento).toBe(new Date("2026-07-01T12:00:00.000Z").toISOString());
  });

  it("agendado: confirma ~1 dia antes de uma visita distante", () => {
    const visita = "2026-07-05T15:00:00.000Z";
    const tpl = followUpParaStatus("agendado", { nome: "Ana", dataInicio: visita, agora: AGORA })!;
    expect(tpl.tipo).toBe("whatsapp");
    expect(tpl.prioridade).toBe("alta");
    // 1 dia antes da visita = 04/jul 15:00.
    expect(tpl.vencimento).toBe(new Date("2026-07-04T15:00:00.000Z").toISOString());
  });

  it("agendado: para visita iminente, não agenda no passado", () => {
    const visita = new Date(AGORA.getTime() + 2 * 60 * 60 * 1000).toISOString(); // +2h
    const tpl = followUpParaStatus("agendado", { dataInicio: visita, agora: AGORA })!;
    const venc = Date.parse(tpl.vencimento);
    expect(venc).toBeGreaterThanOrEqual(AGORA.getTime());
    expect(venc).toBeLessThanOrEqual(Date.parse(visita));
  });

  it("agendado sem data de visita usa fallback de 1 dia", () => {
    const tpl = followUpParaStatus("agendado", { nome: "Ana", agora: AGORA })!;
    expect(tpl.vencimento).toBe(new Date("2026-06-29T12:00:00.000Z").toISOString());
  });
});
