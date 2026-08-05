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

// ---------------------------------------------------------------------------
// Colar em lote
//
// Os materiais chegam do Drive como uma lista "projeto / book / tabela" — vinda
// de planilha ou de um levantamento feito fora do CRM. Digitar isso campo a
// campo é o gargalo que a tela existe para eliminar; colar a lista inteira
// resolve em um gesto.
//
// O casamento é pelo NOME do projeto, que nunca vem idêntico ao do CRM ("MA
// Lapa" no Drive, "Mundo Apto Lapa" no cadastro). Regra: nome normalizado
// igual primeiro; depois continência, e SÓ quando um único projeto casa —
// ambiguidade vira "não encontrado" e volta para a pessoa decidir, porque
// escrever o book errado num projeto é pior do que não escrever nada.
// ---------------------------------------------------------------------------

/** Sem acento, sem pontuação, minúsculo — chave de comparação de nomes. */
export function chaveNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type LinhaColada = {
  nome: string;
  book_url: string;
  tabela_precos_url: string;
};

export type ResultadoColagem<T> = {
  /** Projeto casado + os valores a aplicar (só os campos preenchidos na linha). */
  aplicados: Array<{ projeto: T; valores: Partial<MateriaisEdicao> }>;
  /** Linhas sem projeto correspondente (ou ambíguas) — devolvidas para revisão. */
  ignorados: string[];
};

/**
 * Quebra o texto colado em linhas. Aceita TAB (o que sai do Sheets/Excel) ou
 * ponto-e-vírgula; vírgula não serve porque URL costuma ter vírgula em query.
 * Colunas: nome, book, tabela — as duas últimas opcionais.
 */
export function parseColagem(texto: string): LinhaColada[] {
  return texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((linha) => {
      const partes = linha.split(/\t|;/).map((p) => p.trim());
      return {
        nome: partes[0] ?? "",
        book_url: partes[1] ?? "",
        tabela_precos_url: partes[2] ?? "",
      };
    })
    .filter((l) => l.nome.length > 0);
}

/** Casa as linhas coladas com os projetos da tela. */
export function casarColagem<T extends { nome: string }>(
  linhas: LinhaColada[],
  projetos: T[],
): ResultadoColagem<T> {
  const porChave = new Map<string, T[]>();
  for (const p of projetos) {
    const k = chaveNome(p.nome);
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k)!.push(p);
  }

  const aplicados: ResultadoColagem<T>["aplicados"] = [];
  const ignorados: string[] = [];

  for (const linha of linhas) {
    const chave = chaveNome(linha.nome);
    if (!chave) {
      ignorados.push(linha.nome);
      continue;
    }
    let candidatos = porChave.get(chave) ?? [];
    if (candidatos.length === 0) {
      // Continência nos dois sentidos: "MA Lapa" ↔ "Mundo Apto Lapa Residence".
      candidatos = projetos.filter((p) => {
        const k = chaveNome(p.nome);
        return k.includes(chave) || chave.includes(k);
      });
    }
    // Zero casamentos ou mais de um: não adivinha.
    if (candidatos.length !== 1) {
      ignorados.push(linha.nome);
      continue;
    }
    const valores: Partial<MateriaisEdicao> = {};
    if (linha.book_url) valores.book_url = linha.book_url;
    if (linha.tabela_precos_url) valores.tabela_precos_url = linha.tabela_precos_url;
    if (Object.keys(valores).length === 0) {
      ignorados.push(linha.nome);
      continue;
    }
    aplicados.push({ projeto: candidatos[0], valores });
  }

  return { aplicados, ignorados };
}
