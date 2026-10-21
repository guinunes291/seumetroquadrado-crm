import { onlyDigits } from "@/lib/validators";

/** Exact national number: keep DDD; strip 55 only from valid-length BR numbers. */
export function telefoneNacionalCorretor(telefone: string | null | undefined): string | null {
  const digits = onlyDigits(telefone);
  const nacional =
    (digits.length === 12 || digits.length === 13) && digits.startsWith("55")
      ? digits.slice(2)
      : digits;
  return nacional.length === 10 || nacional.length === 11 ? nacional : null;
}

export function telefonePertenceACorretor(
  telefone: string,
  corretores: ReadonlyArray<{ telefone: string | null }>,
): boolean {
  const nacional = telefoneNacionalCorretor(telefone);
  return nacional !== null && corretores.some((c) => telefoneNacionalCorretor(c.telefone) === nacional);
}