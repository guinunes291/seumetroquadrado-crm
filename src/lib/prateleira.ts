// Regras da Prateleira de Empreendimentos (/projetos-foco) — puras e testadas.
//
// A rota só orquestra estado e renderização; tudo que decide O QUE aparece, em
// QUE ORDEM e com QUAIS selos vive aqui. Decisões de 2026-09-02 em
// docs/revisao-projetos-foco.md (§4). Em resumo:
//
//   • Cada projeto passa pelo saneamento (metragem, bairro/cidade), ganha zona
//     (com Grande SP), parceira (pela construtora ou pelo nome), completude e a
//     campanha vigente (início ≤ agora < fim).
//   • Só entra na prateleira quem tem o mínimo (zona + book ou tabela) — ou está
//     em campanha (escolha explícita da gestão). Gestor pode abrir os incompletos.
//   • "Cabe na renda?" usa a estimativa MCMV (PRICE, 30% da prestação total).
//   • Relevância: campanha → ordem das parceiras → completude → demanda → nome.

import type { ProjetoRow } from "@/components/projeto-card";
import { deriveSituacao, type Situacao } from "@/lib/vitrine/vitrine";
import { avaliarRenda, type AvaliacaoRenda } from "@/lib/mcmv-estimativa";
import { chaveConstrutora, parceiraDoProjetoOuNome, type Parceira } from "@/lib/construtoras";
import { completudeProjeto, type Completude } from "@/lib/projetos-completude";
import {
  saneiaLocal,
  saneiaMetragem,
  type LocalSaneado,
  type MetragemSaneada,
} from "@/lib/projetos-saneamento";
import { zonaDoProjeto, type ZonaFiltro, type ZonaProjeto, SEM_ZONA } from "@/lib/zonas";
import {
  logoDaConstrutora,
  logoDoProjeto,
  urlLogo,
  type FundoLogo,
} from "@/lib/logos-construtoras";

/** Linha do catálogo + colunas novas (opcionais: chegam só com a migration). */
export type ProjetoPrateleiraRow = ProjetoRow & {
  created_at?: string | null;
  updated_at?: string | null;
  preco_atualizado_em?: string | null;
  tabela_atualizada_em?: string | null;
};

export type ParceiraPrateleira = Parceira & { logo_url?: string | null };

/** Logo resolvida para o card, o corredor e o banner (decisão 13). */
export type LogoPrateleira = {
  url: string;
  /** Em que fundo a arte é legível — quem manda é o manifesto local. */
  fundo: FundoLogo;
  origem: "parceira" | "local";
};

/**
 * Precedência: logo cadastrada pela gestão na parceira > logo local pela
 * construtora (ou pelo nome do projeto, sem construtora) > logo local pelo
 * nome da parceira casada > null (o card cai nas iniciais). A logo subida
 * pela gestão assume fundo claro: é o padrão de arte colorida sobre branco.
 */
export function logoDoItem(
  projeto: { construtora: string | null | undefined; nome: string | null | undefined },
  parceira: ParceiraPrateleira | null,
): LogoPrateleira | null {
  if (parceira?.logo_url) return { url: parceira.logo_url, fundo: "claro", origem: "parceira" };
  const local = logoDoProjeto(projeto) ?? (parceira ? logoDaConstrutora(parceira.nome) : null);
  return local ? { url: urlLogo(local), fundo: local.fundo, origem: "local" } : null;
}

export type FocoRow = {
  id: string;
  projeto_id: string;
  motivo: string | null;
  inicio: string;
  fim: string | null;
  ativo: boolean;
  arte_url?: string | null;
};

export type FocoVigente = {
  id: string;
  motivo: string | null;
  inicio: string;
  fim: string | null;
  arte_url: string | null;
  /** Dias inteiros até o fim; null quando a campanha não tem fim. */
  diasRestantes: number | null;
};

export type Demanda = {
  leads_30d: number;
  leads_total: number;
  vendas_total: number;
  envios_7d: number;
  envios_30d: number;
  ultimo_envio: string | null;
};

export type ItemPrateleira = ProjetoPrateleiraRow & {
  zona: ZonaProjeto | null;
  local: LocalSaneado;
  metragem: MetragemSaneada;
  parceira: ParceiraPrateleira | null;
  parceiraInferida: boolean;
  /** Logo da construtora já resolvida (parceira > local > null). */
  logo: LogoPrateleira | null;
  foco: FocoVigente | null;
  completude: Completude;
  situacao: Situacao;
  /** Preço ou tabela mudaram nos últimos 7 dias (badge da decisão 20). */
  atualizadoRecentemente: boolean;
  demanda: Demanda | null;
};

export const DIAS_ATUALIZADO_RECENTE = 7;
const MS_DIA = 86_400_000;

/** Foco vale enquanto ativo, já iniciado e com fim no futuro (ou aberto). */
export function focoVigente(
  f: { ativo: boolean; inicio: string; fim: string | null },
  agora: number,
): boolean {
  if (!f.ativo) return false;
  if (new Date(f.inicio).getTime() > agora) return false;
  return f.fim == null || new Date(f.fim).getTime() > agora;
}

/** Foco programado: ativo, ainda não começou. A prateleira não mostra; a gestão vê. */
export function focoProgramado(f: { ativo: boolean; inicio: string }, agora: number): boolean {
  return f.ativo && new Date(f.inicio).getTime() > agora;
}

export function diasRestantes(fim: string | null, agora: number): number | null {
  if (!fim) return null;
  const diff = new Date(fim).getTime() - agora;
  return Math.max(0, Math.ceil(diff / MS_DIA));
}

/** Rótulo curto da urgência: "termina hoje", "termina em 5 dias", null sem fim. */
export function rotuloUrgencia(dias: number | null): string | null {
  if (dias == null) return null;
  if (dias <= 0) return "termina hoje";
  if (dias === 1) return "termina amanhã";
  return `termina em ${dias} dias`;
}

/** A campanha vigente mais recente por projeto. */
export function focosPorProjeto(focos: FocoRow[], agora: number): Map<string, FocoVigente> {
  const map = new Map<string, FocoVigente>();
  const ordenados = [...focos].sort(
    (a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime(),
  );
  for (const f of ordenados) {
    if (!focoVigente(f, agora) || map.has(f.projeto_id)) continue;
    map.set(f.projeto_id, {
      id: f.id,
      motivo: f.motivo,
      inicio: f.inicio,
      fim: f.fim,
      arte_url: f.arte_url ?? null,
      diasRestantes: diasRestantes(f.fim, agora),
    });
  }
  return map;
}

const recente = (iso: string | null | undefined, agora: number, dias: number): boolean =>
  !!iso && agora - new Date(iso).getTime() <= dias * MS_DIA;

/** Monta o item da prateleira a partir da linha do banco e dos contextos. */
export function montarItem(
  p: ProjetoPrateleiraRow,
  ctx: {
    parceiras: readonly ParceiraPrateleira[];
    focos: Map<string, FocoVigente>;
    demanda?: Map<string, Demanda>;
    agora: number;
  },
): ItemPrateleira {
  const local = saneiaLocal(p.bairro, p.cidade);
  const metragem = saneiaMetragem(p.metragem_min, p.metragem_max, p.preco_a_partir);
  const zona = zonaDoProjeto({
    zona_smq: p.zona_smq,
    regiao: p.regiao,
    cidade: local.cidade,
    bairro: local.bairro,
  });
  const { parceira, inferidaPeloNome } = parceiraDoProjetoOuNome(
    { construtora: p.construtora, nome: p.nome },
    ctx.parceiras,
  );
  return {
    ...p,
    zona,
    local,
    metragem,
    parceira,
    parceiraInferida: inferidaPeloNome,
    logo: logoDoItem({ construtora: p.construtora, nome: p.nome }, parceira),
    foco: ctx.focos.get(p.id) ?? null,
    completude: completudeProjeto(
      {
        ...p,
        metragem_min: metragem.metragem_min,
        metragem_max: metragem.metragem_max,
      },
      zona,
    ),
    situacao: deriveSituacao(p),
    atualizadoRecentemente:
      recente(p.preco_atualizado_em, ctx.agora, DIAS_ATUALIZADO_RECENTE) ||
      recente(p.tabela_atualizada_em, ctx.agora, DIAS_ATUALIZADO_RECENTE),
    demanda: ctx.demanda?.get(p.id) ?? null,
  };
}

/** Nome da construtora para exibição/agrupamento: parceira vence; vazio vira rótulo fixo. */
export const SEM_CONSTRUTORA = "Sem construtora informada";

export function construtoraExibida(item: ItemPrateleira): string {
  if (item.parceira) return item.parceira.nome;
  return item.construtora?.trim() || SEM_CONSTRUTORA;
}

/** Chave estável de agrupamento por construtora (parceira por id; outras por nome normalizado). */
export function construtoraChave(item: ItemPrateleira): string {
  if (item.parceira) return `p:${item.parceira.id}`;
  const k = chaveConstrutora(item.construtora);
  return k ? `c:${k}` : "c:";
}

// ---------------------------------------------------------------------------
// Filtros e ordenação
// ---------------------------------------------------------------------------

export type DormsFiltro = "1" | "2" | "3+";

export type FiltrosPrateleira = {
  busca: string;
  zona: ZonaFiltro | null;
  /** construtoraChave do corredor escolhido. */
  construtora: string | null;
  precoMax: number | null;
  dorms: DormsFiltro | null;
  situacao: Situacao | null;
  comMaterial: boolean;
  soFavoritos: boolean;
  /** Renda do cliente (R$/mês); liga o "cabe na renda". */
  renda: number | null;
  /** Com renda informada, esconde o que não cabe. */
  soQueCabe: boolean;
  /** Gestor: mostra também quem não atingiu o mínimo. */
  mostrarIncompletos: boolean;
};

export const FILTROS_VAZIOS: FiltrosPrateleira = {
  busca: "",
  zona: null,
  construtora: null,
  precoMax: null,
  dorms: null,
  situacao: null,
  comMaterial: false,
  soFavoritos: false,
  renda: null,
  soQueCabe: false,
  mostrarIncompletos: false,
};

export type OrdenacaoPrateleira =
  | "relevancia"
  | "preco-asc"
  | "preco-desc"
  | "entrega"
  | "novos"
  | "enviados";

export const ORDENACOES: Array<{ valor: OrdenacaoPrateleira; rotulo: string }> = [
  { valor: "relevancia", rotulo: "Relevância" },
  { valor: "preco-asc", rotulo: "Menor preço" },
  { valor: "preco-desc", rotulo: "Maior preço" },
  { valor: "entrega", rotulo: "Entrega mais próxima" },
  { valor: "novos", rotulo: "Mais novos" },
  { valor: "enviados", rotulo: "Mais enviados" },
];

export function normalizarBusca(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function casaDorms(item: ItemPrateleira, f: DormsFiltro): boolean {
  const min = item.dorms_min ?? item.dorms_max;
  const max = item.dorms_max ?? item.dorms_min;
  // Sem dado de dormitório não some: o corretor confirma na ficha.
  if (min == null || max == null) return true;
  if (f === "1") return min <= 1;
  if (f === "2") return min <= 2 && max >= 2;
  return max >= 3;
}

/** Avaliação MCMV do item para uma renda; null sem renda ou sem preço. */
export function avaliacaoDoItem(item: ItemPrateleira, renda: number | null): AvaliacaoRenda | null {
  if (renda == null || renda <= 0) return null;
  if (item.sob_consulta || item.preco_a_partir == null) return null;
  return avaliarRenda(renda, item.preco_a_partir);
}

/**
 * "Cabe na renda?" com as duas fontes: renda mínima cadastrada pela gestão
 * (quando existe) e a estimativa pelo preço. null quando não dá para dizer.
 */
export function cabeNaRenda(item: ItemPrateleira, renda: number | null): boolean | null {
  if (renda == null || renda <= 0) return null;
  if (item.renda_minima != null) return renda >= item.renda_minima;
  const av = avaliacaoDoItem(item, renda);
  return av ? av.cabe : null;
}

export function visivelNaPrateleira(item: ItemPrateleira, mostrarIncompletos: boolean): boolean {
  if (item.foco) return true;
  if (mostrarIncompletos) return true;
  return item.completude.prontoParaPrateleira;
}

export function aplicarFiltros(
  itens: ItemPrateleira[],
  f: FiltrosPrateleira,
  favoritos: ReadonlySet<string> = new Set(),
): ItemPrateleira[] {
  const termo = normalizarBusca(f.busca);
  return itens.filter((item) => {
    if (!visivelNaPrateleira(item, f.mostrarIncompletos)) return false;
    if (f.zona && (item.zona ?? SEM_ZONA) !== f.zona) return false;
    if (f.construtora && construtoraChave(item) !== f.construtora) return false;
    if (f.precoMax != null) {
      // Sem preço não some do filtro de preço (é "sob consulta"), acima some.
      if (item.preco_a_partir != null && !item.sob_consulta && item.preco_a_partir > f.precoMax)
        return false;
    }
    if (f.dorms && !casaDorms(item, f.dorms)) return false;
    if (f.situacao && item.situacao !== f.situacao) return false;
    if (f.comMaterial && !item.book_url && !item.tabela_precos_url) return false;
    if (f.soFavoritos && !favoritos.has(item.id)) return false;
    if (f.soQueCabe && f.renda != null && cabeNaRenda(item, f.renda) === false) return false;
    if (termo) {
      const texto = normalizarBusca(
        [
          item.nome,
          item.construtora,
          item.parceira?.nome,
          item.local.bairro,
          item.local.cidade,
          item.regiao,
          item.zona_smq,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (!texto.includes(termo)) return false;
    }
    return true;
  });
}

const precoOrdenavel = (item: ItemPrateleira): number =>
  item.sob_consulta || item.preco_a_partir == null ? Number.POSITIVE_INFINITY : item.preco_a_partir;

const entregaOrdenavel = (item: ItemPrateleira): number => {
  if (item.situacao === "Pronto") return 0;
  if (item.ano_entrega == null) return Number.POSITIVE_INFINITY;
  return item.ano_entrega * 12 + (item.mes_entrega ?? 12);
};

const criadoEm = (item: ItemPrateleira): number =>
  item.created_at ? new Date(item.created_at).getTime() : 0;

/** Ordena a lista inteira; a relevância respeita a ordem de leitura da operação. */
export function ordenar(
  itens: ItemPrateleira[],
  ordem: OrdenacaoPrateleira,
  parceiras: readonly ParceiraPrateleira[],
): ItemPrateleira[] {
  const indiceParceira = new Map(parceiras.map((p, i) => [p.id, i]));
  const porNome = (a: ItemPrateleira, b: ItemPrateleira) => a.nome.localeCompare(b.nome, "pt-BR");
  const relevancia = (a: ItemPrateleira, b: ItemPrateleira) => {
    const fa = a.foco ? 0 : 1;
    const fb = b.foco ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const pa = a.parceira ? (indiceParceira.get(a.parceira.id) ?? 0) : Number.POSITIVE_INFINITY;
    const pb = b.parceira ? (indiceParceira.get(b.parceira.id) ?? 0) : Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    if (a.completude.score !== b.completude.score) return b.completude.score - a.completude.score;
    const da = a.demanda?.leads_30d ?? 0;
    const db = b.demanda?.leads_30d ?? 0;
    if (da !== db) return db - da;
    return porNome(a, b);
  };
  const cmp: Record<OrdenacaoPrateleira, (a: ItemPrateleira, b: ItemPrateleira) => number> = {
    relevancia,
    "preco-asc": (a, b) => precoOrdenavel(a) - precoOrdenavel(b) || relevancia(a, b),
    "preco-desc": (a, b) => {
      const pa = precoOrdenavel(a);
      const pb = precoOrdenavel(b);
      // Sem preço vai para o fim também na ordem decrescente.
      if (pa === Number.POSITIVE_INFINITY || pb === Number.POSITIVE_INFINITY)
        return pa - pb || relevancia(a, b);
      return pb - pa || relevancia(a, b);
    },
    entrega: (a, b) => entregaOrdenavel(a) - entregaOrdenavel(b) || relevancia(a, b),
    novos: (a, b) => criadoEm(b) - criadoEm(a) || relevancia(a, b),
    enviados: (a, b) =>
      (b.demanda?.envios_30d ?? 0) - (a.demanda?.envios_30d ?? 0) || relevancia(a, b),
  };
  return [...itens].sort(cmp[ordem]);
}

// ---------------------------------------------------------------------------
// Corredores
// ---------------------------------------------------------------------------

export type Corredor = {
  chave: string;
  titulo: string;
  parceira: ParceiraPrateleira | null;
  logo: LogoPrateleira | null;
  itens: ItemPrateleira[];
};

export type Prateleira = {
  emFoco: ItemPrateleira[];
  parceiras: Corredor[];
  outras: ItemPrateleira[];
};

/**
 * Três leituras: campanhas, um corredor por parceira (na ordem da gestão) e o
 * resto numa grade única (agrupar centenas de construtoras viraria uma parede
 * de cabeçalhos). Um item em foco aparece no topo E no seu corredor.
 */
export function montarPrateleira(
  itens: ItemPrateleira[],
  parceiras: readonly ParceiraPrateleira[],
): Prateleira {
  const emFoco = itens.filter((i) => i.foco);
  const porParceira = new Map<string, ItemPrateleira[]>();
  const outras: ItemPrateleira[] = [];
  for (const item of itens) {
    if (item.parceira) {
      const lista = porParceira.get(item.parceira.id) ?? [];
      lista.push(item);
      porParceira.set(item.parceira.id, lista);
    } else {
      outras.push(item);
    }
  }
  return {
    emFoco,
    parceiras: parceiras
      .filter((p) => (porParceira.get(p.id)?.length ?? 0) > 0)
      .map((p) => ({
        chave: `p:${p.id}`,
        titulo: p.nome,
        parceira: p,
        logo: logoDoItem({ construtora: p.nome, nome: null }, p),
        itens: porParceira.get(p.id)!,
      })),
    outras,
  };
}

/** Contagem por construtora para o seletor: parceiras primeiro, depois por volume. */
export function contarPorConstrutora(
  itens: ItemPrateleira[],
  parceiras: readonly ParceiraPrateleira[],
): Array<{ chave: string; titulo: string; total: number; parceira: boolean }> {
  const map = new Map<string, { titulo: string; total: number; parceira: boolean }>();
  for (const item of itens) {
    const chave = construtoraChave(item);
    const atual = map.get(chave);
    map.set(chave, {
      titulo: construtoraExibida(item),
      total: (atual?.total ?? 0) + 1,
      parceira: item.parceira != null,
    });
  }
  const indice = new Map(parceiras.map((p, i) => [`p:${p.id}`, i]));
  return Array.from(map.entries())
    .map(([chave, v]) => ({ chave, ...v }))
    .sort((a, b) => {
      const ia = indice.get(a.chave) ?? Number.POSITIVE_INFINITY;
      const ib = indice.get(b.chave) ?? Number.POSITIVE_INFINITY;
      if (ia !== ib) return ia - ib;
      return b.total - a.total || a.titulo.localeCompare(b.titulo, "pt-BR");
    });
}

/** Presets de renda do topo (R$/mês) — faixas MCMV que a operação mais atende. */
export const RENDAS_RAPIDAS: readonly number[] = [3_000, 4_000, 5_000, 7_000, 10_000] as const;

/** Iniciais para o placeholder sem foto: "MA" para Mundo Apto, "C" para Cury. */
export function iniciais(nome: string | null | undefined): string {
  const palavras = (nome ?? "")
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (palavras.length === 0) return "•";
  if (palavras.length === 1) return palavras[0].slice(0, 2).toUpperCase();
  return (palavras[0][0] + palavras[1][0]).toUpperCase();
}
