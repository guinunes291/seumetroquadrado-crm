import { describe, expect, it } from "vitest";
import {
  DiretrizSamiInput,
  SAMIQ_MAX_DIRETRIZES,
  montarBlocoDiretrizes,
} from "@/lib/samiq-diretrizes";

describe("diretrizes aprendidas da Sami", () => {
  it("sem diretriz não mexe no prompt", () => {
    expect(montarBlocoDiretrizes([])).toBe("");
    expect(montarBlocoDiretrizes([{ texto: "   ", tipo: "comportamento" }])).toBe("");
  });

  it("monta o bloco com marcação de conhecimento e teto", () => {
    expect(SAMIQ_MAX_DIRETRIZES).toBe(40);
    const linhas = Array.from({ length: 43 }, (_, i) => ({
      texto: `regra ${i}`,
      tipo: i === 0 ? "conhecimento" : "comportamento",
    }));
    const bloco = montarBlocoDiretrizes(linhas);
    expect(bloco.startsWith("\n\nDIRETRIZES APRENDIDAS")).toBe(true);
    expect(bloco).toContain("- [conhecimento] regra 0");
    expect(bloco).toContain("- regra 1");
    expect(bloco.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(40);
  });

  it("valida o corpo da rota", () => {
    expect(DiretrizSamiInput.safeParse({ texto: "ok", id_origem: "x" }).success).toBe(false);
    expect(
      DiretrizSamiInput.safeParse({
        texto: "Quando o corretor pedir tabela, mande book junto.",
        id_origem: "abc",
      }).success,
    ).toBe(true);
  });
});