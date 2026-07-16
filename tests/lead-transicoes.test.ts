import { describe, it, expect } from "vitest";
import {
  transicaoLeadPermitida,
  motivoTransicaoBloqueada,
  FUNNEL_STAGES,
  LEAD_STATUS_ORDER,
  type LeadStatus,
} from "../src/lib/leads";

// Espelho de public.transicao_lead_permitida (migration 20260715191457).
// Estes testes fixam o contrato: se a função SQL mudar, o espelho (e estes
// casos) precisam mudar juntos — senão a UI volta a oferecer destino inválido.

describe("transicaoLeadPermitida — espelho da máquina de estados do banco", () => {
  it("mesma etapa é sempre permitida", () => {
    for (const s of LEAD_STATUS_ORDER) {
      expect(transicaoLeadPermitida(s, s, false)).toBe(true);
    }
  });

  it("fluxo feliz do corretor avança etapa a etapa", () => {
    expect(transicaoLeadPermitida("novo", "em_atendimento", false)).toBe(true);
    expect(transicaoLeadPermitida("aguardando_atendimento", "em_atendimento", false)).toBe(true);
    expect(transicaoLeadPermitida("em_atendimento", "agendado", false)).toBe(true);
    expect(transicaoLeadPermitida("agendado", "visita_realizada", false)).toBe(true);
    expect(transicaoLeadPermitida("visita_realizada", "analise_credito", false)).toBe(true);
    expect(transicaoLeadPermitida("analise_credito", "contrato_fechado", false)).toBe(true);
  });

  it("aguardando_atendimento não pula direto para etapas avançadas", () => {
    for (const alvo of ["agendado", "visita_realizada", "analise_credito"] as LeadStatus[]) {
      expect(transicaoLeadPermitida("aguardando_atendimento", alvo, false)).toBe(false);
      expect(transicaoLeadPermitida("aguardando_atendimento", alvo, true)).toBe(false);
    }
  });

  it("voltar para aguardando_atendimento nunca é permitido a partir do funil ativo", () => {
    for (const de of [
      "em_atendimento",
      "aguardando_retorno",
      "agendado",
      "visita_realizada",
      "analise_credito",
    ] as LeadStatus[]) {
      expect(transicaoLeadPermitida(de, "aguardando_atendimento", true)).toBe(false);
    }
  });

  it("perdido é alcançável de qualquer etapa ativa, mas não de venda/pós-venda", () => {
    for (const de of [
      "novo",
      "aguardando_atendimento",
      "em_atendimento",
      "aguardando_retorno",
      "agendado",
      "visita_realizada",
      "analise_credito",
    ] as LeadStatus[]) {
      expect(transicaoLeadPermitida(de, "perdido", false)).toBe(true);
    }
    expect(transicaoLeadPermitida("contrato_fechado", "perdido", true)).toBe(false);
    expect(transicaoLeadPermitida("pos_venda", "perdido", true)).toBe(false);
  });

  it("etapas terminais só saem com papel de gestão", () => {
    expect(transicaoLeadPermitida("perdido", "em_atendimento", false)).toBe(false);
    expect(transicaoLeadPermitida("perdido", "em_atendimento", true)).toBe(true);
    expect(transicaoLeadPermitida("contrato_fechado", "pos_venda", false)).toBe(false);
    expect(transicaoLeadPermitida("contrato_fechado", "pos_venda", true)).toBe(true);
    expect(transicaoLeadPermitida("contrato_fechado", "analise_credito", true)).toBe(true);
    expect(transicaoLeadPermitida("pos_venda", "aguardando_retorno", true)).toBe(true);
  });

  it("status desconhecido nunca transiciona", () => {
    expect(transicaoLeadPermitida("inexistente", "em_atendimento", true)).toBe(false);
  });
});

describe("motivoTransicaoBloqueada — mensagens acionáveis", () => {
  it("explica o caminho quando falta iniciar o atendimento", () => {
    const msg = motivoTransicaoBloqueada("aguardando_atendimento", "agendado", false);
    expect(msg).toContain("Em atendimento");
    expect(msg).toContain("Agendado");
  });

  it("explica o gate de gestão nas etapas terminais", () => {
    const msg = motivoTransicaoBloqueada("perdido", "em_atendimento", false);
    expect(msg).toContain("gestão");
  });

  it("toda etapa do menu tem mensagem não-vazia quando bloqueada", () => {
    for (const de of FUNNEL_STAGES) {
      for (const para of FUNNEL_STAGES) {
        if (transicaoLeadPermitida(de, para, false)) continue;
        expect(motivoTransicaoBloqueada(de, para, false).length).toBeGreaterThan(10);
      }
    }
  });
});
