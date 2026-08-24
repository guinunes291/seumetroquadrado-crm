// Helpers compartilhados da telefonia Sonax (espelho Deno — as functions não
// importam de src/). Mantém sonax-discar e sonax-campanha com UMA definição
// de normalização de número.

/**
 * Número no formato da API v1 do Sonax: DDD + número, só dígitos, sem DDI
 * (o exemplo oficial usa `numero=33999504944`). Tira zeros de tronco e o 55.
 * Devolve null quando o que sobra não é um telefone BR discável.
 */
export function toSonaxNumero(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "").replace(/^0+/, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d.length >= 10 && d.length <= 11 ? d : null;
}
