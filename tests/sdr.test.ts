import { describe, expect, it } from "vitest";

import {
  comparecimentoPct,
  motivoEntregaValido,
  podeAgendarSdr,
  podeEntregarSdr,
  requisitosQualificado,
  sdrRegraLabel,
  situacaoSdr,
} from "@/lib/sdr";

describe("requisitosQualificado — espelho do trigger sdr_guarda_qualificado", () => {
  it("lista tudo que falta, na ordem das mensagens do banco", () => {
    expect(requisitosQualificado({})).toEqual([
      "Interesse confirmado",
      "Renda",
      "Tipo de renda",
      "Quem decide",
    ]);
  });

  it("renda estimada > 0 vale como renda; string vazia não vale", () => {
    const base = { sdr_interesse_confirmado: true, tipo_renda: "CLT", decisor: "Casal" };
    expect(requisitosQualificado({ ...base, renda_informada: "  " })).toEqual(["Renda"]);
    expect(requisitosQualificado({ ...base, renda_estimada: 4000 })).toEqual([]);
    expect(requisitosQualificado({ ...base, renda_informada: "R$ 4.000" })).toEqual([]);
  });
});

describe("régua de etapa do SDR", () => {
  it("agendar: qualquer etapa viva antes da entrega; nunca depois de entregue", () => {
    expect(podeAgendarSdr("aguardando_atendimento", null)).toBe(true);
    expect(podeAgendarSdr("qualificado", null)).toBe(true);
    expect(podeAgendarSdr("perdido", null)).toBe(false);
    expect(podeAgendarSdr("qualificado", "2026-09-04T10:00:00Z")).toBe(false);
  });

  it("entregar com motivo: só depois do primeiro contato", () => {
    expect(podeEntregarSdr("aguardando_atendimento", null)).toBe(false);
    expect(podeEntregarSdr("em_atendimento", null)).toBe(true);
    expect(podeEntregarSdr("qualificado", null)).toBe(true);
    expect(podeEntregarSdr("contrato_fechado", null)).toBe(false);
    expect(podeEntregarSdr("qualificado", "2026-09-04T10:00:00Z")).toBe(false);
  });

  it("motivo da entrega: mínimo de 5 caracteres, como a RPC", () => {
    expect(motivoEntregaValido("  ok ")).toBe(false);
    expect(motivoEntregaValido("cliente com docs")).toBe(true);
  });
});

describe("situação e rótulos", () => {
  it("situação do lead na visão do SDR", () => {
    expect(situacaoSdr({ corretor_id: null, sdr_entregue_em: null })).toBe("na_base");
    expect(situacaoSdr({ corretor_id: "c", sdr_entregue_em: null })).toBe("reaquecendo");
    expect(situacaoSdr({ corretor_id: "c", sdr_entregue_em: "x" })).toBe("entregue");
    expect(situacaoSdr({ corretor_id: null, sdr_entregue_em: null, sdr_devolvido_em: "y" })).toBe(
      "devolvido",
    );
  });

  it("regra desconhecida volta crua, nunca vazia", () => {
    expect(sdrRegraLabel("roleta_sdr")).toBe("Roleta de agendados do SDR");
    expect(sdrRegraLabel("outra_regra")).toBe("outra_regra");
    expect(sdrRegraLabel(null)).toBe("—");
  });

  it("comparecimento: null sem amostra, 1 casa decimal com amostra", () => {
    expect(comparecimentoPct(0, 0)).toBeNull();
    expect(comparecimentoPct(2, 1)).toBe(66.7);
  });
});
