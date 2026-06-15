// Helpers puros da Copa SMQ (réplica 1:1 — 14 semanas). Testáveis.

export const COPA_INICIO = "2026-06-03";

/** Calendário fixo de 14 semanas (igual ao Manus). */
export const SEMANAS: { semana: number; periodo: string; label: string }[] = [
  { semana: 1, periodo: "03/06–09/06", label: "FASE DE GRUPOS" },
  { semana: 2, periodo: "10/06–16/06", label: "FASE DE GRUPOS" },
  { semana: 3, periodo: "17/06–23/06", label: "FASE DE GRUPOS" },
  { semana: 4, periodo: "24/06–30/06", label: "FASE DE GRUPOS" },
  { semana: 5, periodo: "01/07–07/07", label: "FASE DE GRUPOS" },
  { semana: 6, periodo: "08/07–14/07", label: "FASE DE GRUPOS" },
  { semana: 7, periodo: "15/07–21/07", label: "FASE DE GRUPOS" },
  { semana: 8, periodo: "22/07–28/07", label: "REPESCAGEM 1" },
  { semana: 9, periodo: "29/07–04/08", label: "OITAVAS DE FINAL" },
  { semana: 10, periodo: "05/08–11/08", label: "REPESCAGEM 2" },
  { semana: 11, periodo: "12/08–18/08", label: "QUARTAS DE FINAL" },
  { semana: 12, periodo: "19/08–25/08", label: "SEMIFINAL" },
  { semana: 13, periodo: "26/08–01/09", label: "FINAL + 3º LUGAR" },
  { semana: 14, periodo: "02/09–08/09", label: "PREMIAÇÃO" },
];

export const TOTAL_SEMANAS = SEMANAS.length;

/** Semana atual (1..14), a partir de 03/06/2026. */
export function semanaAtual(now: Date = new Date()): number {
  const inicio = new Date(`${COPA_INICIO}T00:00:00`);
  const diffDias = Math.floor((now.getTime() - inicio.getTime()) / (24 * 3600 * 1000));
  return Math.min(Math.max(Math.floor(diffDias / 7) + 1, 1), TOTAL_SEMANAS);
}

/** Converte "DD/MM" em Date (ano 2026). */
export function parseDDMM(str: string | null | undefined): Date | null {
  if (!str) return null;
  const [d, m] = str.trim().split("/").map(Number);
  if (!d || !m) return null;
  return new Date(2026, m - 1, d);
}

/** Primeiro + último nome. */
export function shortName(nome: string): string {
  const parts = (nome ?? "").trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] ?? nome;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Medalha por posição (1..3) ou "Nº". */
export function medalha(posicao: number): string {
  if (posicao === 1) return "🥇";
  if (posicao === 2) return "🥈";
  if (posicao === 3) return "🥉";
  return `${posicao}º`;
}

export type CopaCounts = {
  agendamentos: number;
  visitas: number;
  documentacao: number;
  vendas: number;
};
export type CopaConfigPontos = CopaCounts;

/** Total = contadores × configuração. */
export function computeCopaTotal(c: CopaCounts, cfg: CopaConfigPontos): number {
  return (
    c.agendamentos * cfg.agendamentos +
    c.visitas * cfg.visitas +
    c.documentacao * cfg.documentacao +
    c.vendas * cfg.vendas
  );
}

/** Converte linhas de copa_config_pontos (chave/pontos) num objeto tipado (defaults reais 1/5/10/40). */
export function configFromRows(
  rows: { chave: string; pontos: number }[],
  fallback: CopaConfigPontos = { agendamentos: 1, visitas: 5, documentacao: 10, vendas: 40 },
): CopaConfigPontos {
  const m = new Map(rows.map((r) => [r.chave, r.pontos]));
  return {
    agendamentos: m.get("agendamentos") ?? fallback.agendamentos,
    visitas: m.get("visitas") ?? fallback.visitas,
    documentacao: m.get("documentacao") ?? fallback.documentacao,
    vendas: m.get("vendas") ?? fallback.vendas,
  };
}
