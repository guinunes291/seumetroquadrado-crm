// Venda por contrato (IA) — seleção das páginas que vão para a IA (pura).
//
// Por que existe: os contratos de construtora têm de 27 a 100 páginas
// (quadro-resumo + cláusulas gerais + memorial descritivo), mas os dados que
// interessam ficam em poucas: quadro-resumo no começo, "Resumo Geral de Venda"
// (Vibra), "Ficha Cadastro" no fim (Plano&Plano) e a página da data/assinatura.
// Mandar só essas ao modelo corta custo e tempo em ~90% e diminui a chance de
// ele confundir o comprador com a vendedora.

// ---------------------------------------------------------------------------
// 1) Seleção das páginas que vão para a IA
// ---------------------------------------------------------------------------

export type PaginaTexto = { pagina: number; texto: string };

/** Teto do texto enviado ao modelo (~11 mil tokens). */
export const LIMITE_CARACTERES_CONTRATO = 42_000;
/** Teto por página: uma página de cláusula corrida não ocupa o envio todo. */
const LIMITE_POR_PAGINA = 7_000;
/** O quadro-resumo ocupa as primeiras páginas (Plano&Plano: 2 a 8; Vibra: 1 a 4). */
const PAGINAS_INICIAIS = 8;
/** Pontuação mínima para uma página fora do começo entrar. */
const LIMIAR_PAGINA_EXTRA = 6;
/** Abaixo disso o PDF não tem texto (escaneado/foto): vai como imagem. */
export const MIN_CARACTERES_TEXTO = 400;

// A data por extenso ("São Paulo, 30 de outubro de 2026") marca a página da
// assinatura, que é onde muitos contratos trazem a data da venda.
// Só sinais FORTES: palavras como "preço", "CPF" ou "unidade autônoma"
// aparecem em todas as cláusulas gerais e, com peso, empurravam para fora a
// página que tem o dado (medido nos contratos reais da Plano&Plano e Vibra).
const SINAIS: [RegExp, number][] = [
  [/ficha\s+(de\s+)?cadastr/i, 10],
  [/resumo\s+geral\s+de\s+venda/i, 10],
  [/quadro[\s-]*resumo/i, 6],
  [/compradou?r\(?es\)?\s*:\s*\n?\s*nome/i, 6],
  [/data\s+de\s+nascimento/i, 4],
  [/data\s+da\s+venda/i, 4],
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, 3],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, 2],
  [
    /,\s*\d{1,2}\s+de\s+(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+20\d{2}/i,
    6,
  ],
  [/valor\s+negociado|pre[çc]o\s+da\s+unidade|\bdo\s+pre[çc]o\b/i, 2],
];

function limparTexto(texto: string): string {
  return texto
    .replace(/<<[^>]{1,60}>>/g, " ") // marcadores de rubrica do DocuSign/D4Sign
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Quanto a página parece ter dado do comprador ou da venda. */
export function pontuarPaginaContrato(texto: string): number {
  let score = 0;
  for (const [re, peso] of SINAIS) if (re.test(texto)) score += peso;
  return score;
}

/**
 * Escolhe as páginas que vão para a IA: as iniciais sempre (quadro-resumo),
 * depois as de maior pontuação até o teto de caracteres. Devolve na ordem do
 * documento, com o texto já limpo.
 */
export function selecionarPaginasContrato(
  paginas: PaginaTexto[],
  limite = LIMITE_CARACTERES_CONTRATO,
): PaginaTexto[] {
  const limpas = paginas
    .map((p) => ({ pagina: p.pagina, texto: limparTexto(p.texto).slice(0, LIMITE_POR_PAGINA) }))
    .filter((p) => p.texto.length > 0);
  const escolhidas = new Map<number, PaginaTexto>();
  let total = 0;
  const tentar = (p: PaginaTexto) => {
    if (escolhidas.has(p.pagina) || total + p.texto.length > limite) return;
    escolhidas.set(p.pagina, p);
    total += p.texto.length;
  };
  limpas.slice(0, PAGINAS_INICIAIS).forEach(tentar);
  limpas
    .map((p) => ({ p, score: pontuarPaginaContrato(p.texto) }))
    .filter((x) => x.score >= LIMIAR_PAGINA_EXTRA)
    .sort((a, b) => b.score - a.score || a.p.pagina - b.p.pagina)
    .forEach((x) => tentar(x.p));
  return [...escolhidas.values()].sort((a, b) => a.pagina - b.pagina);
}

/** O texto como o modelo lê: páginas separadas e numeradas. */
export function montarTextoContrato(paginas: PaginaTexto[]): string {
  return paginas.map((p) => `=== Página ${p.pagina} ===\n${p.texto}`).join("\n\n");
}
