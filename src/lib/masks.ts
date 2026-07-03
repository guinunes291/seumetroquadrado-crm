// Máscaras de digitação (live) para inputs brasileiros. Complementam as
// validações de lib/validators.ts: a máscara formata enquanto o usuário digita;
// a validação decide no submit. Todas aceitam texto sujo e devolvem o valor
// formatado — use no onChange: `setTelefone(maskPhoneBR(e.target.value))`.

import { onlyDigits } from "@/lib/validators";

/** (11) 98765-4321 — aceita fixo (10 díg.) e celular (11 díg.). */
export function maskPhoneBR(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** 123.456.789-09 */
export function maskCPF(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Moeda BRL enquanto digita: os dígitos são tratados como centavos.
 * "123456" → "R$ 1.234,56". Use `parseCurrencyBRL` para obter o número.
 */
export function maskCurrencyBRL(v: string): string {
  const d = onlyDigits(v).replace(/^0+(?=\d)/, "").slice(0, 15);
  if (!d) return "";
  const cents = d.padStart(3, "0");
  const int = cents.slice(0, -2);
  const frac = cents.slice(-2);
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${intFmt},${frac}`;
}

/** Converte o valor mascarado ("R$ 1.234,56") de volta para número (1234.56). */
export function parseCurrencyBRL(v: string): number | null {
  const d = onlyDigits(v);
  if (!d) return null;
  return Number(d) / 100;
}
