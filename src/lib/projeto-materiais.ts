// Materiais de venda do empreendimento — regras puras da página de produto
// (docs/portal-empreendimento.md).
//
// Duas fontes convivem: as colunas antigas de `projetos` (book_url e
// tabela_precos_url, que o Materiais em massa e a prateleira continuam
// editando e lendo) e a tabela `projeto_materiais` (N itens tipados, criada em
// 20260913190000). A ficha mostra UMA lista: as colunas antigas entram como
// itens "legados" na frente do seu tipo e um material da tabela com a mesma
// URL não aparece duas vezes. Aqui não há React nem Supabase de propósito —
// tudo é testável sem montar tela.

import type { ProjetoEventoTipo, ProjetoMaterialTipo } from "@/integrations/supabase/pendentes";

export type { ProjetoMaterialTipo };

export type TipoMaterialInfo = {
  tipo: ProjetoMaterialTipo;
  rotulo: string;
  plural: string;
  /** Dica curta para o formulário da gestão. */
  dica: string;
};

/** Ordem de leitura na ficha: o que o corretor mais abre primeiro. */
export const TIPOS_MATERIAL: readonly TipoMaterialInfo[] = [
  { tipo: "book", rotulo: "Book", plural: "Books", dica: "Apresentação completa em PDF" },
  {
    tipo: "tabela",
    rotulo: "Tabela de preços",
    plural: "Tabelas de preços",
    dica: "Tabela vigente com valores e condições",
  },
  {
    tipo: "planta",
    rotulo: "Planta",
    plural: "Plantas",
    dica: "Plantas das tipologias e implantação",
  },
  {
    tipo: "video",
    rotulo: "Vídeo",
    plural: "Vídeos",
    dica: "Institucional, decorado ou andamento da obra",
  },
  {
    tipo: "tour",
    rotulo: "Tour virtual",
    plural: "Tours virtuais",
    dica: "Passeio 360º pelo decorado",
  },
  {
    tipo: "memorial",
    rotulo: "Memorial descritivo",
    plural: "Memoriais descritivos",
    dica: "Acabamentos e especificações técnicas",
  },
  {
    tipo: "apresentacao",
    rotulo: "Apresentação",
    plural: "Apresentações",
    dica: "Treinamento de produto ou slides da construtora",
  },
  {
    tipo: "arte",
    rotulo: "Arte para redes",
    plural: "Artes para redes",
    dica: "Stories, feed e WhatsApp",
  },
  {
    tipo: "outro",
    rotulo: "Outro material",
    plural: "Outros materiais",
    dica: "Qualquer link útil de venda",
  },
];

const INFO_POR_TIPO = new Map(TIPOS_MATERIAL.map((t) => [t.tipo, t]));
const ORDEM_TIPO = new Map(TIPOS_MATERIAL.map((t, i) => [t.tipo, i]));

export function infoDoTipo(tipo: ProjetoMaterialTipo): TipoMaterialInfo {
  return INFO_POR_TIPO.get(tipo) ?? INFO_POR_TIPO.get("outro")!;
}

export function ehTipoMaterial(valor: unknown): valor is ProjetoMaterialTipo {
  return typeof valor === "string" && INFO_POR_TIPO.has(valor as ProjetoMaterialTipo);
}

/** Linha da tabela projeto_materiais — só o que a ficha precisa. */
export type MaterialRow = {
  id: string;
  tipo: ProjetoMaterialTipo;
  titulo: string;
  url: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
};

/** Item já fundido e pronto para a tela. */
export type MaterialProjeto = {
  /** uuid da tabela, ou `legado:book` / `legado:tabela` para as colunas antigas. */
  id: string;
  tipo: ProjetoMaterialTipo;
  titulo: string;
  url: string;
  descricao: string | null;
  /** `projeto` = coluna antiga de projetos; `tabela` = projeto_materiais. */
  origem: "projeto" | "tabela";
};

export const TITULO_BOOK_LEGADO = "Book do empreendimento";
export const TITULO_TABELA_LEGADA = "Tabela de preços vigente";

/**
 * Chave de igualdade de dois links: host sem caixa, sem "www.", sem barra
 * final e sem fragmento. "https://drive.google.com/x/" e
 * "https://DRIVE.google.com/x#p=1" são o mesmo material.
 */
export function chaveDaUrl(url: string): string {
  const limpo = url.trim();
  try {
    const u = new URL(limpo);
    const host = u.host.toLowerCase().replace(/^www\./, "");
    const caminho = u.pathname.replace(/\/+$/, "");
    return `${host}${caminho}${u.search}`;
  } catch {
    return limpo.toLowerCase().replace(/\/+$/, "");
  }
}

function compararMateriais(a: MaterialRow, b: MaterialRow): number {
  const t = (ORDEM_TIPO.get(a.tipo) ?? 99) - (ORDEM_TIPO.get(b.tipo) ?? 99);
  if (t !== 0) return t;
  if (a.ordem !== b.ordem) return a.ordem - b.ordem;
  return a.titulo.localeCompare(b.titulo, "pt-BR");
}

/**
 * Funde as colunas antigas do projeto com a tabela de materiais. Os legados
 * entram primeiro no próprio tipo; um material da tabela com a mesma URL de um
 * legado é descartado (o legado é o que a prateleira e o Materiais em massa
 * enxergam — se os dois divergissem, o corretor veria dois "books" iguais).
 * Materiais inativos nunca chegam à ficha, mesmo que a gestão os receba do
 * banco (a RLS deixa gestor/admin lê-los).
 */
export function materiaisDoProjeto(
  projeto: { book_url?: string | null; tabela_precos_url?: string | null },
  linhas: readonly MaterialRow[],
): MaterialProjeto[] {
  const vistos = new Set<string>();
  const saida: MaterialProjeto[] = [];

  const legados: Array<{ id: string; tipo: ProjetoMaterialTipo; titulo: string; url: string }> = [];
  if (projeto.book_url?.trim()) {
    legados.push({
      id: "legado:book",
      tipo: "book",
      titulo: TITULO_BOOK_LEGADO,
      url: projeto.book_url.trim(),
    });
  }
  if (projeto.tabela_precos_url?.trim()) {
    legados.push({
      id: "legado:tabela",
      tipo: "tabela",
      titulo: TITULO_TABELA_LEGADA,
      url: projeto.tabela_precos_url.trim(),
    });
  }
  for (const l of legados) {
    const chave = chaveDaUrl(l.url);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ ...l, descricao: null, origem: "projeto" });
  }

  const ativos = linhas.filter((m) => m.ativo).sort(compararMateriais);
  for (const m of ativos) {
    const chave = chaveDaUrl(m.url);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({
      id: m.id,
      tipo: m.tipo,
      titulo: m.titulo,
      url: m.url,
      descricao: m.descricao,
      origem: "tabela",
    });
  }

  // Ordem final: tipo (leitura da ficha) → legado antes da tabela → título.
  return saida.sort((a, b) => {
    const t = (ORDEM_TIPO.get(a.tipo) ?? 99) - (ORDEM_TIPO.get(b.tipo) ?? 99);
    if (t !== 0) return t;
    if (a.origem !== b.origem) return a.origem === "projeto" ? -1 : 1;
    return 0; // estável: preserva a ordem da gestão dentro do tipo
  });
}

export type GrupoMateriais = {
  tipo: ProjetoMaterialTipo;
  rotulo: string;
  plural: string;
  itens: MaterialProjeto[];
};

/** Agrupa por tipo na ordem de TIPOS_MATERIAL, pulando tipos vazios. */
export function agruparMateriais(lista: readonly MaterialProjeto[]): GrupoMateriais[] {
  const grupos: GrupoMateriais[] = [];
  for (const info of TIPOS_MATERIAL) {
    const itens = lista.filter((m) => m.tipo === info.tipo);
    if (itens.length === 0) continue;
    grupos.push({ tipo: info.tipo, rotulo: info.rotulo, plural: info.plural, itens });
  }
  return grupos;
}

/**
 * Palpite de tipo a partir do link, para o formulário da gestão pré-selecionar
 * (a pessoa pode trocar). Host decide antes do caminho: um vídeo do YouTube
 * chamado "book-tour.mp4" continua sendo vídeo.
 */
export function inferirTipoPelaUrl(url: string): ProjetoMaterialTipo | null {
  const limpo = url.trim().toLowerCase();
  if (!limpo) return null;
  let host = "";
  let caminho = limpo;
  try {
    const u = new URL(limpo);
    host = u.host.replace(/^www\./, "");
    caminho = decodeURIComponent(u.pathname + u.search);
  } catch {
    // texto solto: só o caminho conta
  }
  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(host)) return "video";
  if (/(^|\.)(matterport\.com|kuula\.co|tour360|360tour)/.test(host)) return "tour";
  if (/(^|\.)canva\.com$/.test(host)) return "arte";
  if (/\b(tour|360)\b/.test(caminho)) return "tour";
  if (/planta|implanta[cç][aã]o|floor[-_ ]?plan/.test(caminho)) return "planta";
  if (/tabela|pre[cç]o|price/.test(caminho)) return "tabela";
  if (/memorial/.test(caminho)) return "memorial";
  if (/apresenta[cç][aã]o|treinamento|slides?/.test(caminho)) return "apresentacao";
  // "Book_Residencial.pdf": o "_" é caractere de palavra, então \b não serve.
  if (/(^|[^a-z])book(?![a-z])|folder|cat[aá]logo/.test(caminho)) return "book";
  if (/\.(mp4|mov|webm)(\?|$)/.test(caminho)) return "video";
  if (/\.(png|jpe?g|webp)(\?|$)/.test(caminho)) return "arte";
  return null;
}

const HOSTS_CONHECIDOS: ReadonlyArray<[RegExp, string]> = [
  [/(^|\.)drive\.google\.com$/, "Google Drive"],
  [/(^|\.)docs\.google\.com$/, "Google Docs"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)vimeo\.com$/, "Vimeo"],
  [/(^|\.)dropbox\.com$/, "Dropbox"],
  [/(^|\.)canva\.com$/, "Canva"],
  [/(^|\.)matterport\.com$/, "Matterport"],
  [/(^|\.)wetransfer\.com$/, "WeTransfer"],
  [/(^|\.)onedrive\.live\.com$/, "OneDrive"],
  [/(^|\.)supabase\.co$/, "Arquivo do CRM"],
];

/** "Google Drive", "YouTube"… ou o domínio sem "www." — para o corretor saber
 *  onde o link vai abrir antes de clicar. */
export function hostLegivel(url: string): string {
  try {
    const host = new URL(url.trim()).host.toLowerCase().replace(/^www\./, "");
    for (const [re, nome] of HOSTS_CONHECIDOS) if (re.test(host)) return nome;
    return host;
  } catch {
    return "link";
  }
}

/** Qual evento da prateleira o clique num material gera. Book e tabela mantêm
 *  os tipos históricos (as métricas da decisão 28 não mudam de significado). */
export function eventoDeAbertura(tipo: ProjetoMaterialTipo): ProjetoEventoTipo {
  if (tipo === "book") return "book_abrir";
  if (tipo === "tabela") return "tabela_abrir";
  return "material_abrir";
}

export type MaterialEntrada = {
  tipo: string;
  titulo: string;
  url: string;
  descricao?: string;
};

export type MaterialValido = {
  tipo: ProjetoMaterialTipo;
  titulo: string;
  url: string;
  descricao: string | null;
};

export type ResultadoValidacao = { ok: true; valor: MaterialValido } | { ok: false; erro: string };

/** Mesmas regras do CHECK da tabela, para o erro aparecer no formulário e não
 *  como 23514 cru do Postgres. */
export function validarMaterial(entrada: MaterialEntrada): ResultadoValidacao {
  if (!ehTipoMaterial(entrada.tipo)) return { ok: false, erro: "Escolha o tipo do material." };
  const titulo = entrada.titulo.trim();
  if (titulo.length === 0) return { ok: false, erro: "Dê um título ao material." };
  if (titulo.length > 120) return { ok: false, erro: "Título com no máximo 120 caracteres." };
  const url = entrada.url.trim();
  if (url.length === 0) return { ok: false, erro: "Cole o link do material." };
  if (url.length > 2048) return { ok: false, erro: "Link longo demais (máximo 2048 caracteres)." };
  let protocoloOk = false;
  try {
    const u = new URL(url);
    protocoloOk = u.protocol === "http:" || u.protocol === "https:";
  } catch {
    protocoloOk = false;
  }
  if (!protocoloOk) return { ok: false, erro: "O link precisa começar com http:// ou https://." };
  const descricao = (entrada.descricao ?? "").trim();
  if (descricao.length > 300) {
    return { ok: false, erro: "Descrição com no máximo 300 caracteres." };
  }
  return {
    ok: true,
    valor: { tipo: entrada.tipo, titulo, url, descricao: descricao.length > 0 ? descricao : null },
  };
}

/**
 * Texto pronto para o WhatsApp com todos os links da ficha — o corretor manda
 * "o pacote" de uma vez em vez de copiar link por link.
 */
export function textoMateriaisParaWhatsApp(
  nomeProjeto: string,
  lista: readonly MaterialProjeto[],
): string {
  const linhas = [`📎 *Materiais — ${nomeProjeto}*`];
  for (const grupo of agruparMateriais(lista)) {
    for (const m of grupo.itens) {
      const titulo = grupo.itens.length === 1 ? grupo.rotulo : m.titulo;
      linhas.push(`• ${titulo}: ${m.url}`);
    }
  }
  return linhas.join("\n");
}

/**
 * Reordena um material dentro do seu tipo e devolve os pares (id, ordem) que
 * mudaram. A gestão vê a lista por tipo; subir/descer só faz sentido entre
 * vizinhos do mesmo tipo. Ordens são renumeradas de 10 em 10 para futuras
 * inserções caberem no meio sem renumerar tudo.
 */
export function moverMaterial(
  linhas: readonly MaterialRow[],
  id: string,
  direcao: "cima" | "baixo",
): Array<{ id: string; ordem: number }> {
  const alvo = linhas.find((m) => m.id === id);
  if (!alvo) return [];
  const irmaos = linhas.filter((m) => m.tipo === alvo.tipo).sort(compararMateriais);
  const i = irmaos.findIndex((m) => m.id === id);
  const j = direcao === "cima" ? i - 1 : i + 1;
  if (j < 0 || j >= irmaos.length) return [];
  const nova = [...irmaos];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  const mudancas: Array<{ id: string; ordem: number }> = [];
  nova.forEach((m, k) => {
    const ordem = (k + 1) * 10;
    if (m.ordem !== ordem) mudancas.push({ id: m.id, ordem });
  });
  return mudancas;
}

/** Ordem para um material novo: depois do último do mesmo tipo. */
export function proximaOrdem(linhas: readonly MaterialRow[], tipo: ProjetoMaterialTipo): number {
  const ordens = linhas.filter((m) => m.tipo === tipo).map((m) => m.ordem);
  return ordens.length === 0 ? 10 : Math.max(...ordens) + 10;
}
