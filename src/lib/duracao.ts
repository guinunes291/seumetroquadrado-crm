/**
 * Formatação ÚNICA de duração do CRM (auditoria 2026-08-09).
 *
 * Regra de ouro: banco e API trafegam NÚMEROS (minutos inteiros; horas
 * decimais nas MVs de tempo por etapa); a string hh:mm existe apenas na
 * camada de exibição. Nunca gravar o texto formatado nem usá-lo para
 * ordenar/somar — ordenação de coluna continua sobre o valor cru.
 */

export type EstiloAcimaDe24h = "dias" | "acumulado";

/**
 * Formato padrão acima de 24h: "1d 02:15". Trocar esta constante para
 * "acumulado" muda o app inteiro para hh:mm corrido ("26:15") — decisão em
 * aberto com o Guilherme (relatório da auditoria, seção Decisões).
 */
export const ACIMA_DE_24H_PADRAO: EstiloAcimaDe24h = "dias";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Duração em MINUTOS → hh:mm.
 * - null/undefined/NaN → "—" (pendente — lead sem contato nunca vira 00:00)
 * - negativo (timestamp invertido/dado sujo) → "—"
 * - 0–59 min → "00:42" · 1h–23h59 → "02:35" · ≥24h → "1d 02:15" (ou "26:15")
 * - arredonda ao minuto mais próximo SÓ na exibição
 */
export function formatDuration(
  min: number | null | undefined,
  opts?: { acimaDe24h?: EstiloAcimaDe24h },
): string {
  if (min == null || !Number.isFinite(min) || min < 0) return "—";
  const total = Math.round(min);
  const estilo = opts?.acimaDe24h ?? ACIMA_DE_24H_PADRAO;
  if (estilo === "dias" && total >= 1440) {
    const dias = Math.floor(total / 1440);
    const resto = total % 1440;
    return `${dias}d ${pad(Math.floor(resto / 60))}:${pad(resto % 60)}`;
  }
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Duração em HORAS decimais (ex.: horas_media/horas_p50 das MVs) → hh:mm. */
export function formatDurationHoras(
  horas: number | null | undefined,
  opts?: { acimaDe24h?: EstiloAcimaDe24h },
): string {
  if (horas == null || !Number.isFinite(horas)) return "—";
  return formatDuration(horas * 60, opts);
}
