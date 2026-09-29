// Nomes e ordem dos níveis da trilha.
//
// "Habilitado" é o selo da ACADEMIA. Não é o "Apto" da roleta v2
// (profiles.onboarding_concluido_em), que continua sendo outra coisa e não é
// tocado por nenhuma tela desta fatia.

import type { AcademiaNivel } from "@/features/academia/tipos";

export const ORDEM_NIVEIS: AcademiaNivel[] = [
  "iniciante",
  "habilitado",
  "intermediario",
  "especialista",
  "mestre",
];

export const ROTULO_NIVEL: Record<AcademiaNivel, string> = {
  iniciante: "Iniciante",
  habilitado: "Habilitado",
  intermediario: "Intermediário",
  especialista: "Especialista",
  mestre: "Mestre",
};

export function proximoNivel(nivel: AcademiaNivel): AcademiaNivel | null {
  const i = ORDEM_NIVEIS.indexOf(nivel);
  return i >= 0 && i < ORDEM_NIVEIS.length - 1 ? ORDEM_NIVEIS[i + 1] : null;
}

/** Fases que faltam para o próximo nível, pela regra de academia_recalcular_nivel. */
export const FASES_DO_NIVEL: Record<AcademiaNivel, number[]> = {
  iniciante: [],
  habilitado: [0],
  intermediario: [0, 1, 2],
  especialista: [0, 1, 2, 3],
  mestre: [0, 1, 2, 3, 4, 5],
};
