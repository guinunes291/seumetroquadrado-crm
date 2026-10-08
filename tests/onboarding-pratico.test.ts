import { describe, expect, it } from "vitest";
import { ESTADO_INICIAL, clicar, praticoConcluido } from "@/features/onboarding/pratico";

describe("onboarding prático", () => {
  const seq = ["nao_atendeu", "registrar"];

  it("só avança no botão certo, na ordem", () => {
    let e = clicar(ESTADO_INICIAL, seq, "registrar");
    expect(e).toEqual({ alvo: 0, feito: false, errou: true });
    e = clicar(e, seq, "nao_atendeu");
    expect(e).toEqual({ alvo: 1, feito: false, errou: false });
    e = clicar(e, seq, "registrar");
    expect(e.feito).toBe(true);
  });

  it("depois de feito ignora cliques", () => {
    const e = { alvo: 2, feito: true, errou: false };
    expect(clicar(e, seq, "x")).toBe(e);
  });

  it("conclusão exige data", () => {
    expect(praticoConcluido(null)).toBe(false);
    expect(praticoConcluido({})).toBe(false);
    expect(praticoConcluido({ concluido_em: "2026-10-08" })).toBe(true);
  });
});
