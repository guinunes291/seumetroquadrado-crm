// Renda digitada pelo corretor → número (R$/mês). Usada pela barra de renda da
// prateleira e pelo pré-preenchimento vindo do lead (`renda_informada` é texto
// livre no cadastro: "4.000", "R$ 4 mil", "4000,00").

/** "4.000" / "R$ 4000" / "4 mil" → 4000; vazio/inválido → null. */
export function parseRenda(texto: string | null | undefined): number | null {
  const limpo = (texto ?? "").toLowerCase().replace(/r\$/g, "").trim();
  if (!limpo) return null;
  const mil = /\bmil\b/.test(limpo);
  const digitos = limpo.replace(/\bmil\b/g, "").replace(/[^\d,.]/g, "");
  if (!digitos) return null;
  // Ponto de milhar é o padrão brasileiro em renda ("4.000"); vírgula é decimal.
  const normalizado = digitos.includes(",")
    ? digitos.replace(/\./g, "").replace(",", ".")
    : digitos.replace(/\./g, "");
  const n = Number(normalizado);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(mil ? n * 1_000 : n);
}
