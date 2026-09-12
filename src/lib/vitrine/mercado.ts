// Modelo único do Mapa de Mercado: o catálogo do CRM e a planilha da operação
// vistos como uma lista só de empreendimentos.
//
// Por que duas fontes: o CRM (`projetos`) é a base de trabalho — tem ficha,
// comissão, shortlist e envio no WhatsApp. A planilha é a base viva do mercado,
// atualizada mês a mês, e costuma ter empreendimentos de parceiras que ainda não
// viraram projeto. Mostrar só uma delas esconde estoque; mostrar as duas sem
// mesclar duplica pino. Então: o CRM MANDA no conflito e a planilha entra
// preenchendo buraco (coordenada, preço, book) e trazendo o que só existe nela,
// marcado como "fora do catálogo" — o corretor vê, mas sabe que não dá pra
// operar dali sem cadastrar.

import type { ProjetoRow } from "@/components/projeto-card";
import { deriveSituacao, entregaBadge, type Situacao } from "@/lib/vitrine/vitrine";
import type { PlanilhaEmpreendimento } from "@/lib/vitrine/planilha-mercado";
import {
  alcancavel,
  classificar,
  coberturaPercentual,
  type Enquadramento,
  type PoderDeCompra,
} from "@/lib/vitrine/poder-de-compra";
import { zonaOuSemZona, SEM_ZONA, type ZonaFiltro } from "@/lib/zonas";

export type OrigemMercado = "crm" | "planilha";

export type EmpreendimentoMercado = {
  /** Estável entre renders: "crm:<uuid>" ou "planilha:<chave>". */
  id: string;
  origem: OrigemMercado;
  /** Projeto do CRM quando existe — é o que habilita ficha, comparar e envio. */
  projeto: ProjetoRow | null;
  nome: string;
  construtora: string | null;
  situacao: Situacao;
  /** Rótulo curto de entrega ("Entrega 06/2028", "Pronto"). */
  entrega: string;
  cidade: string | null;
  bairro: string | null;
  zona: ZonaFiltro;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  precoMin: number | null;
  precoMax: number | null;
  m2min: number | null;
  m2max: number | null;
  dormsMin: number | null;
  dormsMax: number | null;
  bookUrl: string | null;
  tabelaUrl: string | null;
  /** Última atualização informada pela planilha (texto livre "dd/mm/aaaa"). */
  atualizadoEm: string | null;
};

const normalizar = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Chave de deduplicação. Nome + construtora é o par confiável; o nome sozinho é
 * o plano B, porque a mesma construtora aparece grafada de jeitos diferentes nas
 * duas bases ("Vibra" x "Vibra Construtora").
 */
export function chaveMercado(nome: string, construtora: string | null | undefined): string {
  const n = normalizar(nome);
  const c = normalizar(construtora);
  return c ? `${n}|${c}` : n;
}

const coord = (v: number | null | undefined): number | null =>
  v != null && Number.isFinite(v) && v !== 0 ? v : null;

/** Empreendimento a partir de um projeto do CRM. */
export function doProjeto(p: ProjetoRow): EmpreendimentoMercado {
  return {
    id: `crm:${p.id}`,
    origem: "crm",
    projeto: p,
    nome: p.nome,
    construtora: p.construtora,
    situacao: deriveSituacao(p),
    entrega: entregaBadge(p),
    cidade: p.cidade,
    bairro: p.bairro,
    zona: zonaOuSemZona(p),
    endereco: p.endereco ?? p.logradouro,
    lat: coord(p.lat),
    lng: coord(p.lng),
    precoMin: p.sob_consulta ? null : (p.preco_a_partir ?? null),
    precoMax: null,
    m2min: p.metragem_min,
    m2max: p.metragem_max,
    dormsMin: p.dorms_min,
    dormsMax: p.dorms_max,
    bookUrl: p.book_url ?? null,
    tabelaUrl: p.tabela_precos_url ?? null,
    atualizadoEm: null,
  };
}

/** A planilha usa "Pronto para morar"; o CRM, "Pronto". */
export function situacaoDaPlanilha(status: string | null): Situacao {
  const s = normalizar(status);
  if (!s) return "A confirmar";
  if (s.includes("pronto") || s.includes("entregue")) return "Pronto";
  if (s.includes("lanc")) return "Lançamento";
  if (s.includes("obra") || s.includes("constru")) return "Em obras";
  return "A confirmar";
}

/** Empreendimento a partir de uma linha da planilha (sem par no CRM). */
export function daPlanilha(e: PlanilhaEmpreendimento): EmpreendimentoMercado {
  const situacao = situacaoDaPlanilha(e.status);
  return {
    id: `planilha:${chaveMercado(e.nome, e.construtora)}`,
    origem: "planilha",
    projeto: null,
    nome: e.nome,
    construtora: e.construtora,
    situacao,
    entrega: situacao,
    cidade: e.cidade,
    bairro: e.regiao,
    zona: zonaOuSemZona({ zona_smq: null, regiao: e.regiao, cidade: e.cidade, bairro: e.regiao }),
    endereco: e.endereco,
    lat: coord(e.lat),
    lng: coord(e.lng),
    precoMin: e.precoMin,
    precoMax: e.precoMax,
    m2min: e.m2min,
    m2max: e.m2max,
    dormsMin: null,
    dormsMax: null,
    bookUrl: e.bookUrl,
    tabelaUrl: e.tabelaUrl,
    atualizadoEm: e.atualizadoEm,
  };
}

/**
 * Mescla catálogo e planilha. O item do CRM é sempre o que fica; da planilha
 * aproveitamos só o que falta nele (coordenada, faixa de preço, metragem, links
 * e a data de atualização). O que a planilha tem e o CRM não vira item próprio,
 * com `origem: "planilha"`.
 */
export function mesclarMercado(
  projetos: ProjetoRow[],
  planilha: PlanilhaEmpreendimento[],
): EmpreendimentoMercado[] {
  const doCrm = projetos.map(doProjeto);

  // Dois índices: o preciso (nome+construtora) e o de fallback (só nome).
  const porChave = new Map<string, EmpreendimentoMercado>();
  const porNome = new Map<string, EmpreendimentoMercado>();
  for (const item of doCrm) {
    porChave.set(chaveMercado(item.nome, item.construtora), item);
    const n = normalizar(item.nome);
    if (n && !porNome.has(n)) porNome.set(n, item);
  }

  const extras: EmpreendimentoMercado[] = [];
  const vistos = new Set<string>();
  for (const linha of planilha) {
    const par =
      porChave.get(chaveMercado(linha.nome, linha.construtora)) ??
      porNome.get(normalizar(linha.nome));

    if (par) {
      par.lat = par.lat ?? coord(linha.lat);
      par.lng = par.lng ?? coord(linha.lng);
      par.precoMin = par.precoMin ?? linha.precoMin;
      par.precoMax = par.precoMax ?? linha.precoMax;
      par.m2min = par.m2min ?? linha.m2min;
      par.m2max = par.m2max ?? linha.m2max;
      par.bookUrl = par.bookUrl ?? linha.bookUrl;
      par.tabelaUrl = par.tabelaUrl ?? linha.tabelaUrl;
      par.atualizadoEm = par.atualizadoEm ?? linha.atualizadoEm;
      continue;
    }

    const item = daPlanilha(linha);
    // A própria planilha repete empreendimento entre abas/meses às vezes.
    if (vistos.has(item.id)) continue;
    vistos.add(item.id);
    extras.push(item);
  }

  return [...doCrm, ...extras];
}

// ---------------------------------------------------------------------------
// Filtros da barra (fora do mapa)
// ---------------------------------------------------------------------------

export type DormFiltro = "Todos" | "1 dorm" | "2+ dorms";
export const DORM_FILTROS: DormFiltro[] = ["Todos", "1 dorm", "2+ dorms"];

export type MercadoSort = "cobertura" | "preco-asc" | "preco-desc" | "az";

export type MercadoFilters = {
  q: string;
  zona: ZonaFiltro | "Todas";
  situacao: Situacao | "Todas";
  dorm: DormFiltro;
  /** Teto de preço que o cliente aceita pagar — independente da simulação. */
  precoAte: number | null;
  /** Com simulação ativa, esconde quem não fecha nem no cenário otimista. */
  soQueFecham: boolean;
  sort: MercadoSort;
};

export const filtrosMercadoVazios: MercadoFilters = {
  q: "",
  zona: "Todas",
  situacao: "Todas",
  dorm: "Todos",
  precoAte: null,
  soQueFecham: true,
  sort: "cobertura",
};

function casaDorm(e: EmpreendimentoMercado, filtro: DormFiltro): boolean {
  if (filtro === "Todos") return true;
  // Sem dado de dorms não deve sumir — o corretor confirma na ficha. Vale para
  // todo item da planilha, que não traz essa coluna.
  if (e.dormsMin == null && e.dormsMax == null) return true;
  const min = e.dormsMin ?? e.dormsMax!;
  const max = e.dormsMax ?? e.dormsMin!;
  return filtro === "1 dorm" ? min <= 1 : max >= 2;
}

/** Aplica os filtros da barra e ordena. `poder` null = simulação desligada. */
export function aplicarFiltrosMercado(
  itens: EmpreendimentoMercado[],
  f: MercadoFilters,
  poder: PoderDeCompra | null,
): EmpreendimentoMercado[] {
  const q = normalizar(f.q);
  const out = itens.filter((e) => {
    if (f.zona !== "Todas" && e.zona !== f.zona) return false;
    if (f.situacao !== "Todas" && e.situacao !== f.situacao) return false;
    if (!casaDorm(e, f.dorm)) return false;
    if (f.precoAte != null && (e.precoMin == null || e.precoMin > f.precoAte)) return false;
    if (poder && f.soQueFecham && !alcancavel(classificar(e.precoMin, poder))) return false;
    if (q) {
      const hay = normalizar(
        [e.nome, e.construtora, e.bairro, e.cidade, e.zona].filter(Boolean).join(" "),
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const SEM_PRECO = Number.POSITIVE_INFINITY;
  if (f.sort === "az") {
    out.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  } else if (f.sort === "cobertura" && poder) {
    // Quem fecha primeiro, depois quem fecha no cenário otimista, e dentro de
    // cada grupo quem os recursos do cliente cobrem mais — é a ordem em que o
    // corretor quer ligar. Sem preço não dá para medir nada, então vai ao fim.
    const peso: Record<Enquadramento, number> = {
      fecha: 3,
      otimista: 2,
      "nao-fecha": 1,
      "sem-preco": 0,
    };
    out.sort((a, b) => {
      const diff = peso[classificar(b.precoMin, poder)] - peso[classificar(a.precoMin, poder)];
      if (diff !== 0) return diff;
      return (
        (coberturaPercentual(b.precoMin, poder) ?? -1) -
        (coberturaPercentual(a.precoMin, poder) ?? -1)
      );
    });
  } else {
    const dir = f.sort === "preco-desc" ? -1 : 1;
    out.sort((a, b) => ((a.precoMin ?? SEM_PRECO) - (b.precoMin ?? SEM_PRECO)) * dir);
  }
  return out;
}

/** Zonas presentes na lista, na ordem dos chips, com "Sem zona" no fim. */
export function zonasDoMercado(itens: EmpreendimentoMercado[]): ZonaFiltro[] {
  const ORDEM: ZonaFiltro[] = ["Norte", "Sul", "Leste", "Oeste", "Centro", "Grande SP", SEM_ZONA];
  const presentes = new Set(itens.map((e) => e.zona));
  return ORDEM.filter((z) => presentes.has(z));
}
