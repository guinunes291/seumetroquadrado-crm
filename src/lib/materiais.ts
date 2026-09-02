// Regras do material do empreendimento (book, tabela de preços, capa e preço).
//
// Puro de propósito: a tela de preenchimento em massa é grande, mas o que
// decide o que vai para o banco cabe aqui e é testado sem montar React.
//
// 2026-09-02 (decisões 3 e 23, docs/revisao-projetos-foco.md): a tela ganhou
// CAPA e PREÇO. Cury e Mundo Apto estavam sem preço por falta de preenchimento,
// e a prateleira image-first nasceria sem foto. Os dois campos entram como
// opcionais na edição para os consumidores antigos (só book/tabela) seguirem
// válidos.

/** Campos de material que a tela edita. */
export type MateriaisProjeto = {
  book_url: string | null;
  tabela_precos_url: string | null;
  capa_url?: string | null;
  preco_a_partir?: number | null;
};

/** O mesmo conjunto, como texto de formulário. */
export type MateriaisEdicao = {
  book_url: string;
  tabela_precos_url: string;
  capa_url?: string;
  /** Texto livre ("250.000", "R$ 250 mil"); vira número em precoOuNulo. */
  preco_a_partir?: string;
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
 * Preço digitado ou colado → número em reais. Aceita "250000", "250.000",
 * "R$ 250.000,00", "250 mil" e "1,2 mi". Vazio → null (apagar é legítimo).
 * Texto que não vira número → NaN, e precoValido recusa.
 */
export function precoOuNulo(valor: string): number | null {
  const limpo = valor.trim().toLowerCase();
  if (!limpo) return null;
  const mil = /\bmil\b/.test(limpo);
  const mi = /\b(mi|milh[oõ]es?|milhao)\b/.test(limpo);
  let s = limpo
    .replace(/r\$/g, "")
    .replace(/\b(mil|mi|milh[oõ]es?|milhao)\b/g, "")
    .replace(/\s/g, "");
  s = s.replace(/[^\d.,-]/g, "");
  if (!s) return Number.NaN;
  const virgulas = (s.match(/,/g) ?? []).length;
  const pontos = (s.match(/\./g) ?? []).length;
  let normalizado: string;
  if (virgulas > 0 && pontos > 0) {
    normalizado =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (virgulas > 0) {
    const partes = s.split(",");
    // "250,000" é milhar; "1,2" ou "250,00" é decimal.
    normalizado =
      virgulas === 1 && partes[1].length === 3
        ? partes.join("")
        : partes.join("").replace(/^(.*)(\d{1,2})$/, (_m, a, b) => `${a}.${b}`);
    if (virgulas === 1 && partes[1].length !== 3) normalizado = `${partes[0]}.${partes[1]}`;
  } else if (pontos > 0) {
    const partes = s.split(".");
    normalizado = partes[partes.length - 1].length === 3 ? partes.join("") : s;
  } else {
    normalizado = s;
  }
  let n = Number(normalizado);
  if (!Number.isFinite(n)) return Number.NaN;
  if (mil) n *= 1_000;
  if (mi) n *= 1_000_000;
  return Math.round(n);
}

/** Preço aceitável: vazio, ou número positivo. */
export function precoValido(valor: string): boolean {
  const n = precoOuNulo(valor);
  return n === null || (Number.isFinite(n) && n > 0);
}

/** Valor inicial da edição a partir do que está gravado. */
export function edicaoInicial(projeto: MateriaisProjeto): MateriaisEdicao {
  return {
    book_url: projeto.book_url ?? "",
    tabela_precos_url: projeto.tabela_precos_url ?? "",
    capa_url: projeto.capa_url ?? "",
    preco_a_partir: projeto.preco_a_partir != null ? String(projeto.preco_a_partir) : "",
  };
}

/**
 * O que mudou de fato — comparação contra o valor gravado, já normalizada.
 * Devolve objeto vazio quando não há o que salvar, e é isso que decide se a
 * linha entra no lote do "Salvar". Campo ausente na edição não é comparado.
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
  if (edicao.capa_url !== undefined) {
    const capa = urlOuNulo(edicao.capa_url);
    if (capa !== (projeto.capa_url ?? null)) mudancas.capa_url = capa;
  }
  if (edicao.preco_a_partir !== undefined) {
    const preco = precoOuNulo(edicao.preco_a_partir);
    if (preco !== null && !Number.isFinite(preco)) return mudancas; // inválido: não salva preço
    if (preco !== (projeto.preco_a_partir ?? null)) mudancas.preco_a_partir = preco;
  }
  return mudancas;
}

// ---------------------------------------------------------------------------
// Colar em lote
//
// Os materiais chegam do Drive como uma lista "projeto / book / tabela [/ capa
// / preço]" — vinda de planilha ou de um levantamento feito fora do CRM.
// Digitar isso campo a campo é o gargalo que a tela existe para eliminar; colar
// a lista inteira resolve em um gesto.
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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type LinhaColada = {
  nome: string;
  book_url: string;
  tabela_precos_url: string;
  /** Presentes só quando a linha trouxe a 4ª/5ª coluna. */
  capa_url?: string;
  preco?: string;
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
 * Colunas: nome, book, tabela, capa, preço — as quatro últimas opcionais.
 */
export function parseColagem(texto: string): LinhaColada[] {
  return texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((linha) => {
      const partes = linha.split(/\t|;/).map((p) => p.trim());
      const l: LinhaColada = {
        nome: partes[0] ?? "",
        book_url: partes[1] ?? "",
        tabela_precos_url: partes[2] ?? "",
      };
      if (partes[3]) l.capa_url = partes[3];
      if (partes[4]) l.preco = partes[4];
      return l;
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
    if (linha.capa_url) valores.capa_url = linha.capa_url;
    if (linha.preco) valores.preco_a_partir = linha.preco;
    if (Object.keys(valores).length === 0) {
      ignorados.push(linha.nome);
      continue;
    }
    aplicados.push({ projeto: candidatos[0], valores });
  }

  return { aplicados, ignorados };
}
