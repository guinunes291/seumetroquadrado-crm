import { describe, expect, it } from "vitest";

import { CLASSES_MODULO, classesEsperadas, type CorModulo } from "@/features/nav/cores-modulo";
import { SISTEMAS } from "@/features/nav/sistemas";

const CORES: CorModulo[] = [
  "central",
  "prospeccao",
  "atendimento",
  "carteira",
  "followup",
  "projetos",
  "financeiro",
  "bi",
  "config",
  "sdr",
];

describe("cor por módulo (identidade v3)", () => {
  it("os literais de classe seguem a forma documentada para as 10 cores", () => {
    // Os literais existem para o Tailwind enxergar as classes no build; este
    // teste impede que um deles saia de sincronia com a forma canônica.
    for (const cor of CORES) expect(CLASSES_MODULO[cor]).toEqual(classesEsperadas(cor));
  });

  it("todo sistema do registro tem uma cor, e os módulos de trabalho não repetem cor", () => {
    const cores = SISTEMAS.map((s) => s.cor);
    expect(cores).toHaveLength(10);
    // Dourado é da Central; os 5 módulos do dia + SDR + 3 de consulta são distintos.
    const operacaoEConsulta = SISTEMAS.filter((s) => s.grupo !== "gestao").map((s) => s.cor);
    expect(new Set(operacaoEConsulta).size).toBe(operacaoEConsulta.length);
    expect(SISTEMAS.find((s) => s.id === "central-comando")?.cor).toBe("central");
    expect(SISTEMAS.find((s) => s.id === "configuracoes")?.cor).toBe("config");
  });
});
