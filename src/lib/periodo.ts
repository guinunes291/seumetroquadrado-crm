// Helpers puros de data/período do hub de Desempenho (ranking, metas).
// Regras: semana começa na SEGUNDA-feira; todos os limites são calculados no
// fuso LOCAL (nunca via toISOString, que vira o dia em UTC); nenhuma função
// muta o Date recebido.
//
// A Copa NÃO usa estes helpers de propósito: o calendário dela é fixo
// (14 semanas a partir de 03/06/2026, semanas de quarta a terça) e vive em
// src/lib/copa.ts — implementações divergentes não foram unificadas.

export type PeriodoOption = "today" | "this_week" | "this_month" | "this_year" | "all";

export const PERIODO_LABELS: Record<PeriodoOption, string> = {
  today: "Hoje",
  this_week: "Esta semana",
  this_month: "Este mês",
  this_year: "Este ano",
  all: "Últimos 2 anos",
};

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Segunda-feira 00:00:00.000 da semana de `d`. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

/** Domingo 23:59:59.999 da semana de `d`. */
export function endOfWeek(d: Date): Date {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  return endOfDay(x);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

export function endOfYear(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), 11, 31));
}

/** Intervalo inclusivo do mês `mes` (1–12): [dia 1 00:00, último dia 23:59:59.999]. */
export function mesRange(ano: number, mes: number): { from: Date; to: Date } {
  return { from: new Date(ano, mes - 1, 1), to: endOfDay(new Date(ano, mes, 0)) };
}

/** Quantidade de dias do mês `mes` (1–12), fevereiro bissexto incluso. */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

/** Intervalo de um preset de período, relativo a `now` (injetável para teste). */
export function getDateRange(p: PeriodoOption, now: Date = new Date()): { from: Date; to: Date } {
  switch (p) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "this_week":
      return { from: startOfWeek(now), to: endOfWeek(now) };
    case "this_month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "this_year":
      return { from: startOfYear(now), to: endOfYear(now) };
    case "all":
      return {
        from: startOfDay(new Date(now.getFullYear() - 2, now.getMonth(), now.getDate())),
        to: new Date(now),
      };
  }
}

/** Chave YYYY-MM-DD do dia LOCAL — segura contra viradas de dia em UTC. */
export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
