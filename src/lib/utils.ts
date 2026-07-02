import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata uma duração em minutos como dd:hh:mm legível, para SLAs de leads que
 * acumulam indefinidamente (ex.: "Leads parados"). Em vez de "167797 min",
 * mostra "116d 12h37". Abaixo de 1 dia cai para "Xh Ym"; abaixo de 1h, "Xmin".
 */
export function formatDuracaoParado(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min) || min <= 0) return "—";
  const total = Math.floor(min);
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}h${pad(m)}`;
  if (h > 0) return `${h}h${pad(m)}`;
  return `${m}min`;
}
