// Academia na identidade Lançamento (2026-10): a "Trilha do corretor" como no
// vídeo de lançamento — o módulo de onde parou em cinco passos (Trilha, Aula,
// Quiz, Prática, Certificado), pelo estado real dele.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { passosDoModulo } from "@/features/academia/passos-trilha";

const modulo = (p: Partial<Parameters<typeof passosDoModulo>[0]> = {}) => ({
  aulas_total: 4,
  aulas_feitas: 0,
  quiz_aprovado: false,
  exige_pratica: true,
  pratica_status: "nao_enviada" as const,
  concluido: false,
  ...p,
});

const estados = (m: Parameters<typeof passosDoModulo>[0]) => passosDoModulo(m).map((p) => p.estado);

describe("passosDoModulo", () => {
  it("são sempre cinco, na ordem do vídeo", () => {
    expect(passosDoModulo(modulo()).map((p) => p.rotulo)).toEqual([
      "Trilha",
      "Aula",
      "Quiz",
      "Prática",
      "Certificado",
    ]);
  });

  it("sem nada feito, o passo atual é a aula", () => {
    expect(estados(modulo())).toEqual(["feito", "atual", "pendente", "pendente", "pendente"]);
  });

  it("aulas pela metade continuam na aula: o quiz só abre com todas feitas", () => {
    expect(estados(modulo({ aulas_feitas: 2 }))).toEqual([
      "feito",
      "atual",
      "pendente",
      "pendente",
      "pendente",
    ]);
  });

  it("aulas e quiz feitos, a prática é o passo atual", () => {
    expect(
      estados(modulo({ aulas_feitas: 4, quiz_aprovado: true, pratica_status: "pendente" })),
    ).toEqual(["feito", "feito", "feito", "atual", "pendente"]);
  });

  it("módulo sem prática: o passo aparece dispensado, não como pendência", () => {
    expect(estados(modulo({ exige_pratica: false, aulas_feitas: 4, quiz_aprovado: true }))).toEqual(
      ["feito", "feito", "feito", "dispensado", "atual"],
    );
    expect(estados(modulo({ pratica_status: "dispensada" }))[3]).toBe("dispensado");
  });

  it("concluído, tudo feito até o certificado", () => {
    expect(
      estados(
        modulo({
          aulas_feitas: 4,
          quiz_aprovado: true,
          pratica_status: "aprovada",
          concluido: true,
        }),
      ),
    ).toEqual(["feito", "feito", "feito", "feito", "feito"]);
  });
});

describe("tela da trilha", () => {
  it("o título é o do módulo, com a frase do vídeo, e a trilha vem antes do progresso", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/features/academia/trilha-page.tsx"),
      "utf8",
    );
    expect(page).toContain('title="Academia"');
    expect(page).toContain("Trilha, aulas, quiz, prática e certificados para formar o time.");
    expect(page.indexOf("<TrilhaDoCorretor m={continuar} />")).toBeLessThan(
      page.indexOf("Módulos obrigatórios</span>"),
    );
  });
});
