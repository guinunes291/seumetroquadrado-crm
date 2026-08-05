// Regras do material do empreendimento (book e tabela de preços).
//
// Puro de propósito: a tela de preenchimento em massa é grande, mas o que
// decide o que vai para o banco cabe aqui e é testado sem montar React.

/** Campos de material que a tela edita. */
export type MateriaisProjeto = {
  book_url: string | null;
  tabela_precos_url: string | null;
};

/** O mesmo par, como texto de formulário. */
export type MateriaisEdicao = {
  book_url: string;
  tabela_precos_url: string;
};

/** Vazio vira NULL: string em branco no banco esconderia o "falta material". */
export function urlOuNulo(valor: string): string | null {
  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}

/**
 * URL utilizável pelo corretor: precisa abrir no navegador. Aceita só http(s)
 * — link de Drive colado da barra de endereço passa; caminho de rede, não.
 * Campo vazio é válido: apagar um link é edição legítima.
 */
export function urlValida(valor: string): boolean {
  const limpo = valor.trim();
  if (!limpo) return true;
  try {
    const u = new URL(limpo);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * O que mudou de fato — comparação contra o valor gravado, já normalizada.
 * Devolve objeto vazio quando não há o que salvar, e é isso que decide se a
 * linha entra no lote do "Salvar".
 */
export function diffMateriais(
  projeto: MateriaisProjeto,
  edicao: MateriaisEdicao,
): Partial<MateriaisProjeto> {
  const mudancas: Partial<MateriaisProjeto> = {};
  const book = urlOuNulo(edicao.book_url);
  const tabela = urlOuNulo(edicao.tabela_precos_url);
  if (book !== (projeto.book_url ?? null)) mudancas.book_url = book;
  if (tabela !== (projeto.tabela_precos_url ?? null)) mudancas.tabela_precos_url = tabela;
  return mudancas;
}
