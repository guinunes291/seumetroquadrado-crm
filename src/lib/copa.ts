// Helpers puros da Copa SMQ (pontuação, semana/fase, medalhas). Testáveis.

export type CopaCounts = {
  agendamentos: number;
  visitas: number;
  analise: number;
  vendas: number;
};

export type CopaConfigPontos = {
  agendamento: number;
  visita: number;
  analise: number;
  venda: number;
};

/** Chaves de atividade da Copa (mesmas de copa_config_pontos). */
export const COPA_ATIVIDADES = ["agendamento", "visita", "analise", "venda"] as const;
export type CopaAtividade = (typeof COPA_ATIVIDADES)[number];

/** Total de pontos = contadores × configuração. */
export function computeCopaTotal(c: CopaCounts, cfg: CopaConfigPontos): number {
  return (
    c.agendamentos * cfg.agendamento +
    c.visitas * cfg.visita +
    c.analise * cfg.analise +
    c.vendas * cfg.venda
  );
}

/** Converte linhas de copa_config_pontos (chave/pontos) num objeto tipado. */
export function configFromRows(
  rows: { chave: string; pontos: number }[],
  fallback: CopaConfigPontos = { agendamento: 25, visita: 40, analise: 60, venda: 150 },
): CopaConfigPontos {
  const map = new Map(rows.map((r) => [r.chave, r.pontos]));
  return {
    agendamento: map.get("agendamento") ?? fallback.agendamento,
    visita: map.get("visita") ?? fallback.visita,
    analise: map.get("analise") ?? fallback.analise,
    venda: map.get("venda") ?? fallback.venda,
  };
}

/** Número total de semanas da edição (mínimo 1). */
export function totalSemanas(dataInicio: string, dataFim: string): number {
  const ini = new Date(`${dataInicio}T00:00:00`);
  const fim = new Date(`${dataFim}T23:59:59`);
  return Math.max(1, Math.ceil((fim.getTime() - ini.getTime()) / (7 * 24 * 3600 * 1000)));
}

/** Semana atual (1..totalSemanas), limitada ao intervalo da edição. */
export function semanaAtual(dataInicio: string, dataFim: string, now: Date = new Date()): number {
  const ini = new Date(`${dataInicio}T00:00:00`);
  if (now.getTime() < ini.getTime()) return 1;
  const diffDays = Math.floor((now.getTime() - ini.getTime()) / (24 * 3600 * 1000));
  const semana = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(semana, 1), totalSemanas(dataInicio, dataFim));
}

export type CopaFaseLite = {
  nome: string;
  ordem: number;
  semana_inicio: number;
  semana_fim: number;
};

/** Fase correspondente a uma semana (ou a última fase, se a semana passou do fim). */
export function faseDaSemana<T extends CopaFaseLite>(fases: T[], semana: number): T | undefined {
  const direta = fases.find((f) => semana >= f.semana_inicio && semana <= f.semana_fim);
  if (direta) return direta;
  return [...fases].sort((a, b) => b.ordem - a.ordem).find((f) => semana >= f.semana_inicio);
}

/** Vencedor de um confronto por pontos (empate favorece A — mesmo critério do SQL). */
export function decideVencedor(aPontos: number, bPontos: number, aId: string, bId: string): string {
  return bPontos > aPontos ? bId : aId;
}

/** Medalha por posição (1..3) ou "Nº". */
export function medalha(posicao: number): string {
  if (posicao === 1) return "🥇";
  if (posicao === 2) return "🥈";
  if (posicao === 3) return "🥉";
  return `${posicao}º`;
}
