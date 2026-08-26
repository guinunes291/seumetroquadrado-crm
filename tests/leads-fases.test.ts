import { describe, expect, it } from "vitest";

import {
  CARTEIRA_STAGES,
  FUNNEL_STAGES,
  LEAD_STATUS_ORDER,
  PROSPECCAO_STAGES,
  stagesDaFase,
} from "@/lib/leads";

describe("fases do funil (Prospecção × Carteira)", () => {
  it("as fases são disjuntas", () => {
    const intersecao = PROSPECCAO_STAGES.filter((s) => CARTEIRA_STAGES.includes(s));
    expect(intersecao).toEqual([]);
  });

  it("juntas com `perdido`, as fases cobrem todo o funil canônico", () => {
    const uniao = new Set([...PROSPECCAO_STAGES, ...CARTEIRA_STAGES, "perdido"]);
    for (const status of LEAD_STATUS_ORDER) {
      expect(uniao.has(status), `status ${status} sem fase`).toBe(true);
    }
  });

  it("`novo` pertence à Prospecção mas não vira coluna de kanban", () => {
    expect(PROSPECCAO_STAGES).toContain("novo");
    expect(stagesDaFase("prospeccao")).not.toContain("novo");
  });

  it("stagesDaFase devolve as colunas na ordem canônica do funil", () => {
    expect(stagesDaFase("prospeccao")).toEqual([
      "aguardando_atendimento",
      "aguardando_retorno",
      "qualificacao_corretor",
    ]);
    expect(stagesDaFase("carteira")).toEqual([
      "em_atendimento",
      "agendado",
      "visita_realizada",
      "analise_credito",
      "contrato_fechado",
    ]);
  });

  it("sem fase, devolve undefined (quadro completo)", () => {
    expect(stagesDaFase(undefined)).toBeUndefined();
  });

  it("toda coluna de fase existe no kanban completo", () => {
    for (const s of [...stagesDaFase("prospeccao")!, ...stagesDaFase("carteira")!]) {
      expect(FUNNEL_STAGES).toContain(s);
    }
  });
});
