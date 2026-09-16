import { describe, expect, it } from "vitest";

import {
  deveAbrirSozinho,
  podeConcluir,
  type OnboardingStatus,
} from "@/features/onboarding/onboarding";

const base: OnboardingStatus = {
  concluido_em: null,
  origem: null,
  eh_corretor: true,
  tem_interacao: false,
};

describe("abertura da trilha de onboarding", () => {
  it("abre para corretor que ainda não concluiu", () => {
    expect(deveAbrirSozinho({ status: base, ehCorretor: true, fechadoNestaSessao: false })).toBe(
      true,
    );
  });

  it("não abre para gestor, admin ou SDR", () => {
    expect(deveAbrirSozinho({ status: base, ehCorretor: false, fechadoNestaSessao: false })).toBe(
      false,
    );
  });

  it("não abre para quem já concluiu", () => {
    expect(
      deveAbrirSozinho({
        status: { ...base, concluido_em: "2026-09-10T12:00:00Z", origem: "manual" },
        ehCorretor: true,
        fechadoNestaSessao: false,
      }),
    ).toBe(false);
  });

  it("não reabre sozinha depois de fechada na mesma sessão", () => {
    expect(deveAbrirSozinho({ status: base, ehCorretor: true, fechadoNestaSessao: true })).toBe(
      false,
    );
  });

  it("não abre sem status (RPC indisponível)", () => {
    expect(deveAbrirSozinho({ status: null, ehCorretor: true, fechadoNestaSessao: false })).toBe(
      false,
    );
  });
});

describe("conclusão do passo 6", () => {
  it("não conclui sem interação registrada", () => {
    expect(podeConcluir(base)).toBe(false);
  });

  it("conclui com pelo menos uma interação", () => {
    expect(podeConcluir({ ...base, tem_interacao: true })).toBe(true);
  });

  it("quem já concluiu continua podendo reabrir e fechar", () => {
    expect(podeConcluir({ ...base, concluido_em: "2026-09-10T12:00:00Z" })).toBe(true);
  });
});
