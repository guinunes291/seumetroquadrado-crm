// Derivação PURA do estado de um módulo a partir de v_academia_modulo_status.
// Fica fora dos componentes de propósito: é a regra que decide o que o
// corretor vê na trilha, e regra se testa sem montar tela.

import type { AcademiaModuloStatusRow } from "@/features/academia/tipos";

export type EstadoModulo =
  | "nao_iniciado"
  | "em_andamento"
  | "quiz_pendente"
  | "pratica_pendente"
  | "concluido"
  | "atrasado";

export const ROTULO_ESTADO: Record<EstadoModulo, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  quiz_pendente: "Quiz pendente",
  pratica_pendente: "Prática pendente",
  concluido: "Concluído",
  atrasado: "Atrasado",
};

/** Data de hoje em Brasília, no formato YYYY-MM-DD (o mesmo que o banco usa). */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/**
 * Ordem de precedência, e o porquê de cada uma:
 *   1. concluído ganha de tudo, inclusive de prazo vencido: quem terminou
 *      terminou, e marcar de atrasado um módulo pronto só gera ruído;
 *   2. atrasado vem antes do detalhe do que falta, porque a ação que o prazo
 *      pede é a mesma (abrir o módulo) e a urgência é a informação nova;
 *   3. sem nenhuma atividade é "não iniciado", mesmo com aulas publicadas;
 *   4. faltando aula é "em andamento", porque o quiz nem abre antes disso;
 *   5. aulas feitas e quiz não aprovado é "quiz pendente";
 *   6. quiz aprovado e prática não aprovada é "prática pendente".
 */
export function estadoDoModulo(
  m: AcademiaModuloStatusRow,
  hoje: string = hojeBrasilia(),
): EstadoModulo {
  if (m.concluido) return "concluido";
  if (m.prazo_em && m.prazo_em < hoje) return "atrasado";

  const semAtividade =
    m.aulas_feitas === 0 && m.tentativas === 0 && m.pratica_status === "nao_enviada";
  if (semAtividade) return "nao_iniciado";

  if (m.aulas_feitas < m.aulas_total) return "em_andamento";
  if (!m.quiz_aprovado) return "quiz_pendente";
  if (m.exige_pratica && m.pratica_status !== "aprovada") return "pratica_pendente";
  return "em_andamento";
}

/** Percentual de conclusão do módulo, para a barra de progresso. */
export function progressoDoModulo(m: AcademiaModuloStatusRow): number {
  const etapas = 1 + (m.exige_pratica ? 1 : 0); // quiz + prática
  const aulas = m.aulas_total > 0 ? m.aulas_feitas / m.aulas_total : 1;
  const quiz = m.quiz_aprovado ? 1 : 0;
  const pratica = m.exige_pratica ? (m.pratica_status === "aprovada" ? 1 : 0) : 0;
  const total = (aulas + quiz + pratica) / (1 + etapas);
  return Math.round(Math.min(1, Math.max(0, total)) * 100);
}

/**
 * "Continue de onde parou": o módulo NÃO concluído com atividade mais recente.
 * Sem nenhuma atividade registrada, cai no primeiro módulo pendente na ordem
 * da trilha (fase, depois número): para quem nunca abriu a Academia, o
 * "continue" tem de ser o começo, não um vazio.
 */
export function continueDeOndeParou(
  modulos: AcademiaModuloStatusRow[],
): AcademiaModuloStatusRow | null {
  const pendentes = modulos.filter((m) => !m.concluido);
  if (pendentes.length === 0) return null;

  const comAtividade = pendentes.filter((m) => m.ultima_atividade !== null);
  if (comAtividade.length > 0) {
    return comAtividade.reduce((melhor, m) =>
      (m.ultima_atividade ?? "") > (melhor.ultima_atividade ?? "") ? m : melhor,
    );
  }
  return [...pendentes].sort((a, b) => a.fase - b.fase || a.numero - b.numero)[0];
}

/** Ordena os módulos de uma fase como a trilha apresenta. */
export function ordenarModulos(modulos: AcademiaModuloStatusRow[]): AcademiaModuloStatusRow[] {
  return [...modulos].sort((a, b) => a.fase - b.fase || a.numero - b.numero);
}

export function modulosDaFase(
  modulos: AcademiaModuloStatusRow[],
  fase: number,
): AcademiaModuloStatusRow[] {
  return ordenarModulos(modulos.filter((m) => m.fase === fase));
}

/**
 * Primeira aula ainda não concluída, na ordem da aula. É o alvo do card
 * "Sua próxima aula" e do botão de continuar dentro do módulo. Com tudo
 * feito devolve null: o que falta ali é quiz ou prática, não aula.
 */
export function primeiraAulaPendente<T extends { id: string; ordem: number }>(
  aulas: T[],
  feitas: ReadonlySet<string>,
): T | null {
  return [...aulas].sort((a, b) => a.ordem - b.ordem).find((a) => !feitas.has(a.id)) ?? null;
}
