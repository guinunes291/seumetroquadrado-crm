// Os cinco passos de um módulo (Trilha → Aula → Quiz → Prática → Certificado),
// como a linha de passos do vídeo de lançamento ("Trilha do corretor").
// Pura, para ser testável (tests/academia-lancamento.test.tsx). A ordem é a
// mesma regra de estadoDoModulo: o quiz só abre com as aulas feitas, a
// prática só depois do quiz aprovado, e o certificado sai com o módulo
// concluído.

import type { AcademiaModuloStatusRow } from "@/features/academia/tipos";

export type EstadoPasso = "feito" | "atual" | "pendente" | "dispensado";

export type PassoTrilha = {
  chave: "trilha" | "aula" | "quiz" | "pratica" | "certificado";
  rotulo: string;
  estado: EstadoPasso;
};

type Modulo = Pick<
  AcademiaModuloStatusRow,
  | "aulas_total"
  | "aulas_feitas"
  | "quiz_aprovado"
  | "exige_pratica"
  | "pratica_status"
  | "concluido"
>;

export function passosDoModulo(m: Modulo): PassoTrilha[] {
  const aulasFeitas = m.aulas_feitas >= m.aulas_total;
  const praticaFeita = m.pratica_status === "aprovada";
  const semPratica = !m.exige_pratica || m.pratica_status === "dispensada";

  // O primeiro passo ainda não feito é o "atual"; os seguintes, pendentes.
  const feitos: Array<[PassoTrilha["chave"], string, boolean | "dispensado"]> = [
    ["trilha", "Trilha", true],
    ["aula", "Aula", aulasFeitas],
    ["quiz", "Quiz", m.quiz_aprovado],
    ["pratica", "Prática", semPratica ? "dispensado" : praticaFeita],
    ["certificado", "Certificado", m.concluido],
  ];
  let atualMarcado = false;
  return feitos.map(([chave, rotulo, feito]) => {
    if (feito === "dispensado") return { chave, rotulo, estado: "dispensado" };
    if (feito) return { chave, rotulo, estado: "feito" };
    if (!atualMarcado) {
      atualMarcado = true;
      return { chave, rotulo, estado: "atual" };
    }
    return { chave, rotulo, estado: "pendente" };
  });
}
