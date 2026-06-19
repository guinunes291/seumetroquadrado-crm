import { describe, it, expect } from "vitest";
import {
  LEAD_STATUS_ORDER,
  FUNNEL_STAGES,
  STAGE_MODAL,
  stageRequiresModal,
  resolveStageAction,
  MOTIVO_PERDA_CATEGORIAS,
  MOTIVO_PERDA_LABEL,
} from "../src/lib/leads";

describe("funil — avanço a partir dos cards", () => {
  describe("FUNNEL_STAGES", () => {
    it("não inclui 'perdido'", () => {
      expect(FUNNEL_STAGES).not.toContain("perdido");
    });

    it("tem 7 etapas, preservando a ordem do funil do corretor", () => {
      expect(FUNNEL_STAGES).toEqual(LEAD_STATUS_ORDER.filter((s) => s !== "perdido"));
      expect(FUNNEL_STAGES).toHaveLength(7);
      expect(FUNNEL_STAGES[0]).toBe("aguardando_atendimento");
      expect(FUNNEL_STAGES[FUNNEL_STAGES.length - 1]).toBe("contrato_fechado");
    });

    it("inclui 'aguardando_retorno' e exclui status legados do funil", () => {
      expect(FUNNEL_STAGES).toContain("aguardando_retorno");
      for (const legado of ["novo", "qualificado", "proposta_enviada", "pos_venda"] as const) {
        expect(FUNNEL_STAGES).not.toContain(legado);
      }
    });
  });

  describe("stageRequiresModal / STAGE_MODAL", () => {
    it("exige modal nas 4 etapas com captura de dados", () => {
      expect(stageRequiresModal("agendado")).toBe(true);
      expect(stageRequiresModal("visita_realizada")).toBe(true);
      expect(stageRequiresModal("analise_credito")).toBe(true);
      expect(stageRequiresModal("contrato_fechado")).toBe(true);
      expect(Object.keys(STAGE_MODAL)).toHaveLength(4);
    });

    it("não exige modal nas etapas diretas", () => {
      for (const s of [
        "novo",
        "aguardando_atendimento",
        "aguardando_retorno",
        "em_atendimento",
        "qualificado",
        "proposta_enviada",
        "pos_venda",
      ] as const) {
        expect(stageRequiresModal(s)).toBe(false);
      }
    });
  });

  describe("resolveStageAction", () => {
    it("retorna 'perdido' para a etapa perdido", () => {
      expect(resolveStageAction("perdido")).toEqual({ kind: "perdido" });
    });

    it("retorna 'modal' com o modal correto", () => {
      expect(resolveStageAction("agendado")).toEqual({ kind: "modal", modal: "agendado" });
      expect(resolveStageAction("contrato_fechado")).toEqual({
        kind: "modal",
        modal: "contrato_fechado",
      });
    });

    it("retorna 'direct' para etapas sem captura", () => {
      expect(resolveStageAction("em_atendimento")).toEqual({ kind: "direct" });
      expect(resolveStageAction("qualificado")).toEqual({ kind: "direct" });
      expect(resolveStageAction("proposta_enviada")).toEqual({ kind: "direct" });
    });
  });

  describe("motivos de perda", () => {
    it("tem um rótulo pt-BR para cada categoria", () => {
      MOTIVO_PERDA_CATEGORIAS.forEach((c) => {
        expect(MOTIVO_PERDA_LABEL[c]).toBeTruthy();
      });
    });
  });
});
