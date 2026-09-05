// Helpers puros de data/período do hub de Desempenho (ranking, metas).
// Regras: semana começa na SEGUNDA-feira; todos os limites são calculados no
// fuso LOCAL (nunca via toISOString, que vira o dia em UTC); nenhuma função
// muta o Date recebido.

export type PeriodoOption =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "last_7"
  | "this_month"
  | "last_month"
  | "last_30"
  | "last_90"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year"
  | "all";

export const PERIODO_LABELS: Record<PeriodoOption, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  this_week: "Esta semana",
  last_week: "Semana passada",
  last_7: "Últimos 7 dias",
  this_month: "Este mês",
  last_month: "Mês passado",
  last_30: "Últimos 30 dias",
  last_90: "Últimos 90 dias",
  this_quarter: "Este trimestre",
  last_quarter: "Trimestre passado",
  this_year: "Este ano",
  last_year: "Ano passado",
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
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last_week": {
      const lw = new Date(now);
      lw.setDate(lw.getDate() - 7);
      return { from: startOfWeek(lw), to: endOfWeek(lw) };
    }
    case "last_7": {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { from: startOfDay(d), to: endOfDay(now) };
    }
    case "last_month": {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    case "last_30": {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { from: startOfDay(d), to: endOfDay(now) };
    }
    case "last_90": {
      const d = new Date(now);
      d.setDate(d.getDate() - 89);
      return { from: startOfDay(d), to: endOfDay(now) };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return {
        from: new Date(now.getFullYear(), q * 3, 1),
        to: endOfDay(new Date(now.getFullYear(), q * 3 + 3, 0)),
      };
    }
    case "last_quarter": {
      const q = Math.floor(now.getMonth() / 3) - 1;
      const ano = q < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const qq = ((q % 4) + 4) % 4;
      return {
        from: new Date(ano, qq * 3, 1),
        to: endOfDay(new Date(ano, qq * 3 + 3, 0)),
      };
    }
    case "last_year": {
      const ly = new Date(now.getFullYear() - 1, 0, 1);
      return { from: startOfYear(ly), to: endOfYear(ly) };
    }
    case "this_week":
      return { from: startOfWeek(now), to: endOfWeek(now) };
    case "this_month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "this_year":
      return { from: startOfYear(now), to: endOfYear(now) };
    case "all": {
      // "Últimos 2 anos" precisa caber no teto do RPC ranking_periodo_v2
      // (_fim - _inicio <= 730). Dois anos-calendário com um 29/02 no meio
      // dão 731 dias e derrubavam a página inteira; o intervalo é grampeado
      // em 730 dias corridos (o rótulo continua "Últimos 2 anos").
      const doisAnos = startOfDay(new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()));
      const teto = startOfDay(now);
      teto.setDate(teto.getDate() - MAX_DIAS_INTERVALO);
      return { from: doisAnos < teto ? teto : doisAnos, to: new Date(now) };
    }
  }
}

/** Maior intervalo (em dias corridos) aceito pelo RPC ranking_periodo_v2. */
export const MAX_DIAS_INTERVALO = 730;

/** Dias corridos entre os dias-calendário de `from` e `to` (fuso local). */
export function diasEntre(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * "Agora" em America/Sao_Paulo (o fuso da operação e do banco), materializado
 * como um Date cujos campos LOCAIS (getFullYear/getMonth/getDate/getHours)
 * são os do relógio de São Paulo. Os helpers deste arquivo trabalham no fuso
 * local do navegador; os RPCs interpretam datas em São Paulo. Passando este
 * Date como `now`, um gestor com o aparelho em outro fuso vê o mesmo "hoje"
 * que o banco — e uma TV em UTC não vira o dia às 21h.
 */
export function agoraSaoPaulo(now: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return new Date(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
}

/** Chave YYYY-MM-DD do dia LOCAL — segura contra viradas de dia em UTC. */
export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
