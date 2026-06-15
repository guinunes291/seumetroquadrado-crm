// Validação/normalização de dados de entrada de leads (telefone BR, e-mail, CPF).

/** Retorna apenas os dígitos de uma string. */
export function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D+/g, "");
}

/**
 * Telefone brasileiro válido: 10 ou 11 dígitos (DDD + número) sem DDI,
 * ou 12/13 dígitos quando incluir o DDI 55.
 */
export function isValidBrazilPhone(telefone: string | null | undefined): boolean {
  const d = onlyDigits(telefone);
  if (d.length === 10 || d.length === 11) return true;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return true;
  return false;
}

/** Validação simples de e-mail (formato). */
export function isValidEmail(email: string | null | undefined): boolean {
  const v = (email ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Valida CPF pelos dígitos verificadores (aceita com ou sem máscara). */
export function isValidCPF(cpf: string | null | undefined): boolean {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // todos iguais

  const dig = (factor: number, upTo: number): number => {
    let sum = 0;
    for (let i = 0; i < upTo; i++) sum += Number(d[i]) * (factor - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };

  return dig(10, 9) === Number(d[9]) && dig(11, 10) === Number(d[10]);
}
