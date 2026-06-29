// Cálculo de período (Hoje/Semana/Mês) ancorado no fuso horário do negócio
// (America/Sao_Paulo). Funções PURAS e testáveis — `now`/`tz` são injetáveis.
//
// Por que ancorar em SP: o banco grava `atividades_diarias.dia` em horário de
// São Paulo (triggers usam `AT TIME ZONE 'America/Sao_Paulo'`). Calcular o "hoje"
// com `toISOString()` (UTC) faz a virada do dia às 21h BRT mostrar o dia errado.
// Aqui derivamos a data civil de SP independentemente do fuso do dispositivo.
//
// Sem date-fns-tz no projeto: usamos Intl para a data civil + o offset, e date-fns
// (já presente) apenas para os limites de semana/mês sobre uma data "flutuante".

import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from "date-fns";

export const SP_TZ = "America/Sao_Paulo";

export type Periodo = "hoje" | "semana" | "mes";

export type PeriodRange = {
  /** Limites como data (YYYY-MM-DD) para colunas de data — ex.: atividades_diarias.dia. */
  diDate: string;
  dfDate: string;
  /** Limites como instante ISO (UTC) para colunas timestamptz — ex.: data_inicio. */
  iniIso: string;
  fimIso: string;
};

/** Data civil (YYYY-MM-DD) no fuso de negócio para o instante informado. */
export function spDateString(now: Date = new Date(), tz: string = SP_TZ): string {
  // en-CA emite no formato ISO YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Offset do fuso de negócio no formato "-03:00" para o instante informado. */
export function spOffset(now: Date = new Date(), tz: string = SP_TZ): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  }).formatToParts(now);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  return parseOffset(name);
}

// Converte "GMT-3" | "GMT-03:00" | "GMT" | "UTC" | "GMT+5:30" → "-03:00" etc.
function parseOffset(tzName: string): string {
  const m = tzName.match(/(?:GMT|UTC)?\s*([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return "+00:00";
  const sign = m[1];
  const hh = m[2].padStart(2, "0");
  const mm = (m[3] ?? "00").padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/**
 * Intervalo do período no fuso de negócio.
 * - hoje: o dia civil de SP.
 * - semana: segunda a domingo da semana atual (alinha ao dashboard, weekStartsOn:1).
 * - mes: do 1º ao último dia do mês atual.
 */
export function rangeForPeriodo(
  p: Periodo,
  now: Date = new Date(),
  tz: string = SP_TZ,
): PeriodRange {
  const today = spDateString(now, tz); // "YYYY-MM-DD" em SP
  const [y, m, d] = today.split("-").map(Number);
  // Data "flutuante" (campos civis) só para alimentar a aritmética do date-fns.
  const civil = new Date(y, m - 1, d);

  let startCivil = civil;
  let endCivil = civil;
  if (p === "semana") {
    startCivil = startOfWeek(civil, { weekStartsOn: 1 });
    endCivil = endOfWeek(civil, { weekStartsOn: 1 });
  } else if (p === "mes") {
    startCivil = startOfMonth(civil);
    endCivil = endOfMonth(civil);
  }

  const diDate = format(startCivil, "yyyy-MM-dd");
  const dfDate = format(endCivil, "yyyy-MM-dd");

  // SP não observa DST desde 2019; usar o offset corrente é seguro e suficiente.
  const offset = spOffset(now, tz);
  const iniIso = new Date(`${diDate}T00:00:00.000${offset}`).toISOString();
  const fimIso = new Date(`${dfDate}T23:59:59.999${offset}`).toISOString();

  return { diDate, dfDate, iniIso, fimIso };
}
