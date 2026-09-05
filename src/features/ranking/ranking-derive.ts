// Lógica PURA do hub de Desempenho (/ranking) — sem React, sem banco.
//
// Tudo o que a tela mostra como número passa por aqui, para ser testável em
// tests/ranking-derive.test.ts e para a mesma pergunta ter UMA resposta na
// página inteira (regra da casa em tests/db/kpis-consistencia.test.ts).
//
// Fontes de verdade que este arquivo consome:
//   - RPC ranking_periodo_v2: soma de atividades_diarias por corretor no
//     período (pontuacao_total calculado no banco pelos pesos de
//     configuracao_pontuacao), leads criados e transições no período.
//   - tabela metas (mês/ano): linhas por corretor, por equipe ou globais.
//   - configuracao_pontuacao: pesos vigentes (só para explicar a pontuação —
//     a pontuação oficial continua sendo a do banco).

import { agoraSaoPaulo, diasNoMes, mesRange } from "@/lib/periodo";

export { agoraSaoPaulo };

// ---------------------------------------------------------------------------
// Linhas do ranking
// ---------------------------------------------------------------------------

/** Linha crua como o RPC ranking_periodo_v2 devolve (bigint chega como number ou string). */
export type RankingRpcRow = {
  posicao?: number | string | null;
  corretor_id: string;
  nome: string | null;
  pontuacao: number | string | null;
  ligacoes: number | string | null;
  whatsapps: number | string | null;
  agendamentos: number | string | null;
  visitas: number | string | null;
  documentacoes: number | string | null;
  vendas: number | string | null;
  vgv: number | string | null;
  leads: number | string | null;
  alteracoes: number | string | null;
};

export type RankRow = {
  corretorId: string;
  nome: string;
  foto: string | null;
  equipeId: string | null;
  pontos: number;
  ligacoes: number;
  whatsapp: number;
  agendamentos: number;
  visitas: number;
  documentacoes: number;
  vendas: number;
  vgv: number;
  leads: number;
  alteracoes: number;
};

export type PerfilResumo = { id: string; foto: string | null; equipeId: string | null };

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Converte as linhas do RPC nas linhas da tela, enriquecidas com foto/equipe do perfil. */
export function mapearRanking(
  rows: RankingRpcRow[] | null | undefined,
  perfis: Map<string, PerfilResumo>,
): RankRow[] {
  return (rows ?? []).map((r) => {
    const perfil = perfis.get(r.corretor_id);
    return {
      corretorId: r.corretor_id,
      nome: (r.nome ?? "").trim() || "Sem nome",
      foto: perfil?.foto ?? null,
      equipeId: perfil?.equipeId ?? null,
      pontos: num(r.pontuacao),
      ligacoes: num(r.ligacoes),
      whatsapp: num(r.whatsapps),
      agendamentos: num(r.agendamentos),
      visitas: num(r.visitas),
      documentacoes: num(r.documentacoes),
      vendas: num(r.vendas),
      vgv: num(r.vgv),
      leads: num(r.leads),
      alteracoes: num(r.alteracoes),
    };
  });
}

export type CriterioRanking = "pontos" | "vendas" | "vgv";

/** Critério de ordenação de cada visão. O de pontos espelha o ORDER BY do RPC. */
const CHAVES: Record<CriterioRanking, (r: RankRow) => number[]> = {
  pontos: (r) => [r.pontos, r.vendas, r.vgv],
  vendas: (r) => [r.vendas, r.vgv, r.pontos],
  vgv: (r) => [r.vgv, r.vendas, r.pontos],
};

function comparar(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
}

/** Ordena decrescente pelo critério, com desempate estável pelo nome. */
export function ordenar(rows: RankRow[], criterio: CriterioRanking): RankRow[] {
  const chave = CHAVES[criterio];
  return [...rows].sort(
    (a, b) => comparar(chave(a), chave(b)) || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

export type RankRowPosicionada = RankRow & { pos: number };

/**
 * Posição com EMPATE (dense rank): dois corretores com os mesmos números
 * dividem a posição, como o dense_rank() do RPC — o próximo fica em pos+1.
 * Recebe as linhas JÁ ordenadas pelo mesmo critério.
 */
export function posicionar(
  rowsOrdenadas: RankRow[],
  criterio: CriterioRanking,
): RankRowPosicionada[] {
  const chave = CHAVES[criterio];
  let pos = 0;
  let anterior: number[] | null = null;
  return rowsOrdenadas.map((r) => {
    const k = chave(r);
    if (!anterior || comparar(anterior, k) !== 0) pos += 1;
    anterior = k;
    return { ...r, pos };
  });
}

/** Atalho: filtra quem tem valor no critério, ordena e posiciona. */
export function classificar(rows: RankRow[], criterio: CriterioRanking): RankRowPosicionada[] {
  const chave = CHAVES[criterio];
  return posicionar(
    ordenar(
      rows.filter((r) => chave(r)[0] > 0),
      criterio,
    ),
    criterio,
  );
}

// ---------------------------------------------------------------------------
// Totais
// ---------------------------------------------------------------------------

export type Totais = {
  vendas: number;
  vgv: number;
  visitas: number;
  agendamentos: number;
  documentacoes: number;
  leads: number;
  ligacoes: number;
  whatsapp: number;
  pontos: number;
  /** Corretores com qualquer atividade pontuada no período. */
  corretoresAtivos: number;
  /** Corretores com pelo menos uma venda no período. */
  corretoresComVenda: number;
  /** VGV ÷ vendas (0 sem vendas). */
  ticketMedio: number;
};

export function somarTotais(rows: RankRow[]): Totais {
  const t: Totais = {
    vendas: 0,
    vgv: 0,
    visitas: 0,
    agendamentos: 0,
    documentacoes: 0,
    leads: 0,
    ligacoes: 0,
    whatsapp: 0,
    pontos: 0,
    corretoresAtivos: 0,
    corretoresComVenda: 0,
    ticketMedio: 0,
  };
  for (const r of rows) {
    t.vendas += r.vendas;
    t.vgv += r.vgv;
    t.visitas += r.visitas;
    t.agendamentos += r.agendamentos;
    t.documentacoes += r.documentacoes;
    t.leads += r.leads;
    t.ligacoes += r.ligacoes;
    t.whatsapp += r.whatsapp;
    t.pontos += r.pontos;
    if (r.pontos > 0) t.corretoresAtivos += 1;
    if (r.vendas > 0) t.corretoresComVenda += 1;
  }
  t.ticketMedio = t.vendas > 0 ? t.vgv / t.vendas : 0;
  return t;
}

// ---------------------------------------------------------------------------
// Metas do mês
// ---------------------------------------------------------------------------

export type MetaRow = {
  corretor_id: string | null;
  equipe_id: string | null;
  meta_vendas: number | null;
  meta_visitas: number | null;
  meta_leads_atendidos: number | null;
  meta_gmv: number | string | null;
};

export type NivelMeta = "corretor" | "equipe" | "global";

export type MetaTotais = {
  vendas: number;
  visitas: number;
  leadsAtendidos: number;
  vgv: number;
  /** De onde saiu o total (null = nenhuma meta cadastrada para o escopo). */
  nivel: NivelMeta | null;
  linhas: number;
};

/** Escopo do ranking: quem o chamador enxerga (o RPC já recorta por papel). */
export type EscopoRanking = {
  corretorIds: Set<string>;
  equipeIds: Set<string>;
  /** admin/superintendente: vê a operação inteira — metas globais valem. */
  completo: boolean;
  /** Escopo de TIME (gestão): as metas de equipe/global fazem sentido como
   *  denominador. Um corretor vê só a própria linha e só a própria meta. */
  time: boolean;
};

export function escopoDe(rows: RankRow[], completo: boolean, time = true): EscopoRanking {
  const corretorIds = new Set<string>();
  const equipeIds = new Set<string>();
  for (const r of rows) {
    corretorIds.add(r.corretorId);
    if (r.equipeId) equipeIds.add(r.equipeId);
  }
  return { corretorIds, equipeIds, completo, time };
}

const META_ZERO: MetaTotais = {
  vendas: 0,
  visitas: 0,
  leadsAtendidos: 0,
  vgv: 0,
  nivel: null,
  linhas: 0,
};

function somarMetas(rows: MetaRow[], nivel: NivelMeta): MetaTotais {
  const t = { ...META_ZERO, nivel, linhas: rows.length };
  for (const m of rows) {
    t.vendas += num(m.meta_vendas);
    t.visitas += num(m.meta_visitas);
    t.leadsAtendidos += num(m.meta_leads_atendidos);
    t.vgv += num(m.meta_gmv);
  }
  return t;
}

/**
 * Meta do time no mês, SEM dupla contagem.
 *
 * A tabela `metas` aceita três níveis (corretor, equipe, global) e o antigo
 * painel somava todas as linhas — uma meta de equipe de 10 mais metas
 * individuais de 3+3+4 viravam "meta 20". A regra aqui é a mesma do painel
 * Metas & Ritmo (RPC gestao_pacing): a meta do time é a soma das metas
 * INDIVIDUAIS dos corretores do escopo. Só quando não há meta individual
 * cadastrada caímos para a meta de equipe (das equipes do escopo) e, por fim,
 * para a meta global (só para quem vê a operação inteira).
 */
export function agregarMetas(rows: MetaRow[], escopo: EscopoRanking): MetaTotais {
  const porCorretor = rows.filter((m) => m.corretor_id && escopo.corretorIds.has(m.corretor_id));
  if (porCorretor.length > 0) return somarMetas(porCorretor, "corretor");
  // Corretor sozinho não compara o próprio realizado com a meta do time.
  if (!escopo.time) return { ...META_ZERO };
  const porEquipe = rows.filter(
    (m) => !m.corretor_id && m.equipe_id && escopo.equipeIds.has(m.equipe_id),
  );
  if (porEquipe.length > 0) return somarMetas(porEquipe, "equipe");
  if (escopo.completo) {
    const globais = rows.filter((m) => !m.corretor_id && !m.equipe_id);
    if (globais.length > 0) return somarMetas(globais, "global");
  }
  return { ...META_ZERO };
}

export const NIVEL_META_LABEL: Record<NivelMeta, string> = {
  corretor: "soma das metas individuais",
  equipe: "meta da equipe",
  global: "meta global da operação",
};

export type MetaCorretor = { vendas: number; visitas: number; vgv: number };

/** Meta individual por corretor (soma se houver mais de uma linha). */
export function metasPorCorretor(rows: MetaRow[]): Map<string, MetaCorretor> {
  const out = new Map<string, MetaCorretor>();
  for (const m of rows) {
    if (!m.corretor_id) continue;
    const atual = out.get(m.corretor_id) ?? { vendas: 0, visitas: 0, vgv: 0 };
    atual.vendas += num(m.meta_vendas);
    atual.visitas += num(m.meta_visitas);
    atual.vgv += num(m.meta_gmv);
    out.set(m.corretor_id, atual);
  }
  return out;
}

export type MetaVgv = { valor: number; origem: "meta_gmv" | "ticket_medio" | null };

/**
 * Meta de VGV de um corretor: a cadastrada (meta_gmv) quando existe; senão a
 * meta de vendas convertida pelo ticket médio do mês (proxy, rotulado como tal).
 */
export function metaVgvCorretor(meta: MetaCorretor | undefined, ticketMedio: number): MetaVgv {
  if (!meta) return { valor: 0, origem: null };
  if (meta.vgv > 0) return { valor: meta.vgv, origem: "meta_gmv" };
  if (meta.vendas > 0 && ticketMedio > 0) {
    return { valor: meta.vendas * ticketMedio, origem: "ticket_medio" };
  }
  return { valor: 0, origem: null };
}

export type MetaPrincipal = {
  /** Sem meta em quantidade mas com meta de VGV: a régua principal é o VGV. */
  usaVgv: boolean;
  definida: boolean;
  realizado: number;
  meta: number;
  gap: number;
  pct: number;
};

/**
 * A meta que manda na tela: a de vendas quando existe; senão a de VGV. Anel,
 * barra, gap, projeção e celebração usam ESTA decisão — nunca uma resposta
 * diferente por bloco.
 */
export function metaPrincipal(totais: Totais, metas: MetaTotais): MetaPrincipal {
  const usaVgv = metas.vendas <= 0 && metas.vgv > 0;
  const realizado = usaVgv ? totais.vgv : totais.vendas;
  const meta = usaVgv ? metas.vgv : metas.vendas;
  return {
    usaVgv,
    definida: meta > 0,
    realizado,
    meta,
    gap: meta - realizado,
    pct: pctMeta(realizado, meta),
  };
}

/** % de atingimento (sem teto — a barra é quem grampeia). 0 sem meta. */
export function pctMeta(realizado: number, meta: number): number {
  if (meta <= 0) return 0;
  return (realizado / meta) * 100;
}

// ---------------------------------------------------------------------------
// Calendário: dias úteis, projeção e janela comparável
// ---------------------------------------------------------------------------

/**
 * Calendário de dias úteis — o MESMO do painel Metas & Ritmo (RPC
 * gestao_pacing lê gestao_config 'pacing': dias_uteis em ISO dow, 1=segunda …
 * 7=domingo, sábado útil por padrão; feriados como "YYYY-MM-DD"). A página
 * lê a config pela RPC gestao_config_valor e cai no padrão se ela faltar,
 * para a projeção do Desempenho bater com a do pacing.
 */
export type CalendarioPacing = { diasUteis: number[]; feriados: string[] };

export const CALENDARIO_PADRAO: CalendarioPacing = {
  diasUteis: [1, 2, 3, 4, 5, 6],
  feriados: [],
};

/** Normaliza o jsonb de gestao_config 'pacing'; shape inválido → padrão. */
export function normalizarCalendarioPacing(raw: unknown): CalendarioPacing {
  if (!raw || typeof raw !== "object") return CALENDARIO_PADRAO;
  const r = raw as Record<string, unknown>;
  const dias = Array.isArray(r.dias_uteis)
    ? r.dias_uteis.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    : [];
  const feriados = Array.isArray(r.feriados)
    ? r.feriados.filter((f): f is string => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f))
    : [];
  return { diasUteis: dias.length > 0 ? dias : CALENDARIO_PADRAO.diasUteis, feriados };
}

function ehDiaUtil(ano: number, mes: number, dia: number, cal: CalendarioPacing): boolean {
  const dow = new Date(ano, mes - 1, dia).getDay();
  const iso = dow === 0 ? 7 : dow;
  if (!cal.diasUteis.includes(iso)) return false;
  const chave = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return !cal.feriados.includes(chave);
}

/** Dias úteis do mês pelo calendário do pacing. */
export function diasUteisNoMes(
  ano: number,
  mes: number,
  cal: CalendarioPacing = CALENDARIO_PADRAO,
): number {
  return diasUteisAte(ano, mes, diasNoMes(ano, mes), cal);
}

/** Dias úteis do dia 1 até `dia` (inclusive). */
export function diasUteisAte(
  ano: number,
  mes: number,
  dia: number,
  cal: CalendarioPacing = CALENDARIO_PADRAO,
): number {
  const fim = Math.min(Math.max(dia, 0), diasNoMes(ano, mes));
  let n = 0;
  for (let d = 1; d <= fim; d++) if (ehDiaUtil(ano, mes, d, cal)) n += 1;
  return n;
}

export type PosicaoNoMes = "passado" | "atual" | "futuro";

export function posicaoDoMes(ano: number, mes: number, hoje: Date): PosicaoNoMes {
  const a = hoje.getFullYear();
  const m = hoje.getMonth() + 1;
  if (ano < a || (ano === a && mes < m)) return "passado";
  if (ano === a && mes === m) return "atual";
  return "futuro";
}

export type Projecao = {
  /** Realizado projetado até o fim do mês (null = sem ritmo ainda / mês futuro). */
  valor: number | null;
  /** Projeção em % da meta (null sem meta ou sem projeção). */
  pctMeta: number | null;
  diasUteis: number;
  diasUteisPassados: number;
  posicao: PosicaoNoMes;
};

/**
 * Projeção linear por DIA ÚTIL (calendário do pacing): realizado ÷ dias úteis
 * passados × dias úteis do mês. Mês fechado projeta o próprio realizado; mês
 * futuro não projeta. Dias corridos (a régua antiga) faziam a tendência
 * despencar toda segunda-feira e inflar na sexta.
 */
export function projetarMes(args: {
  realizado: number;
  meta: number;
  ano: number;
  mes: number;
  hoje: Date;
  calendario?: CalendarioPacing;
}): Projecao {
  const { realizado, meta, ano, mes, hoje } = args;
  const cal = args.calendario ?? CALENDARIO_PADRAO;
  const diasUteis = diasUteisNoMes(ano, mes, cal);
  const posicao = posicaoDoMes(ano, mes, hoje);
  const diasUteisPassados =
    posicao === "passado"
      ? diasUteis
      : posicao === "atual"
        ? diasUteisAte(ano, mes, hoje.getDate(), cal)
        : 0;
  let valor: number | null = null;
  if (posicao === "passado") valor = realizado;
  else if (posicao === "atual" && diasUteisPassados > 0 && diasUteis > 0) {
    valor = Math.round((realizado / diasUteisPassados) * diasUteis * 100) / 100;
  }
  return {
    valor,
    pctMeta: valor === null || meta <= 0 ? null : Math.round((valor / meta) * 1000) / 10,
    diasUteis,
    diasUteisPassados,
    posicao,
  };
}

export type JanelaComparavel = { from: Date; to: Date; parcial: boolean; ano: number; mes: number };

/**
 * Janela do mês anterior COMPARÁVEL ao mês selecionado: quando o mês
 * selecionado é o corrente, corta o mês anterior no mesmo dia do mês (dia 1
 * até hoje) — comparar 5 dias de setembro com agosto inteiro sempre dava
 * "queda". Mês fechado compara com o mês anterior inteiro.
 */
export function janelaMesAnteriorComparavel(
  ano: number,
  mes: number,
  hoje: Date,
): JanelaComparavel {
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const cheio = mesRange(anoAnt, mesAnt);
  if (posicaoDoMes(ano, mes, hoje) !== "atual") {
    return { ...cheio, parcial: false, ano: anoAnt, mes: mesAnt };
  }
  const dia = Math.min(hoje.getDate(), diasNoMes(anoAnt, mesAnt));
  const to = new Date(anoAnt, mesAnt - 1, dia, 23, 59, 59, 999);
  return { from: cheio.from, to, parcial: true, ano: anoAnt, mes: mesAnt };
}

export const MESES_CURTOS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export const MESES_LONGOS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export type OpcaoMes = { ano: number; mes: number; label: string };

/** Últimos `quantidade` meses (do atual para trás) para o seletor de mês. */
export function opcoesDeMes(hoje: Date, quantidade = 24): OpcaoMes[] {
  const out: OpcaoMes[] = [];
  let ano = hoje.getFullYear();
  let mes = hoje.getMonth() + 1;
  for (let i = 0; i < quantidade; i++) {
    out.push({ ano, mes, label: `${MESES_CURTOS[mes - 1]} ${ano}` });
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pontuação: pesos e decomposição
// ---------------------------------------------------------------------------

export type ChavePeso =
  | "ligacao"
  | "whatsapp"
  | "agendamento"
  | "visita"
  | "documentacao"
  | "venda";

export type Pesos = Record<ChavePeso, number>;

export const CHAVES_PESO: ChavePeso[] = [
  "ligacao",
  "whatsapp",
  "agendamento",
  "visita",
  "documentacao",
  "venda",
];

export const PESO_LABEL: Record<ChavePeso, string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  agendamento: "Agendamento",
  visita: "Visita realizada",
  documentacao: "Documentação",
  venda: "Venda aprovada",
};

export type ConfigPontoRow = { chave: string; pontos: number | null; ativo: boolean | null };

/**
 * Pesos vigentes a partir de configuracao_pontuacao. Espelha pontos_de() do
 * banco: chave inativa ou ausente vale 0. Sem nenhuma linha (consulta vazia)
 * devolve null — a legenda some em vez de mentir "tudo vale zero".
 */
export function pesosDeConfig(rows: ConfigPontoRow[] | null | undefined): Pesos | null {
  if (!rows || rows.length === 0) return null;
  const pesos: Pesos = {
    ligacao: 0,
    whatsapp: 0,
    agendamento: 0,
    visita: 0,
    documentacao: 0,
    venda: 0,
  };
  for (const r of rows) {
    if (!(CHAVES_PESO as string[]).includes(r.chave)) continue;
    pesos[r.chave as ChavePeso] = r.ativo === false ? 0 : num(r.pontos);
  }
  return pesos;
}

const QUANTIDADE_POR_PESO: Record<ChavePeso, (r: RankRow) => number> = {
  ligacao: (r) => r.ligacoes,
  whatsapp: (r) => r.whatsapp,
  agendamento: (r) => r.agendamentos,
  visita: (r) => r.visitas,
  documentacao: (r) => r.documentacoes,
  venda: (r) => r.vendas,
};

export type ParcelaPontos = {
  chave: ChavePeso;
  label: string;
  quantidade: number;
  peso: number;
  pontos: number;
};

/** Quantos pontos cada atividade rendeu (quantidade × peso vigente). */
export function decomporPontos(row: RankRow, pesos: Pesos): ParcelaPontos[] {
  return CHAVES_PESO.map((chave) => {
    const quantidade = QUANTIDADE_POR_PESO[chave](row);
    const peso = pesos[chave];
    return { chave, label: PESO_LABEL[chave], quantidade, peso, pontos: quantidade * peso };
  });
}

/**
 * Pontuação recalculada com os pesos vigentes. O banco recalcula o histórico
 * sempre que um peso muda, então em regime isto é igual à oficial (row.pontos,
 * gravada dia a dia); uma diferença indica leitura desatualizada (a
 * invalidação realtime ainda não chegou) ou histórico não recalculado — a UI
 * avisa em vez de esconder.
 */
export function pontosPelosPesos(row: RankRow, pesos: Pesos): number {
  return decomporPontos(row, pesos).reduce((s, p) => s + p.pontos, 0);
}

export function pesosDivergem(rows: RankRow[], pesos: Pesos | null): boolean {
  if (!pesos) return false;
  return rows.some((r) => pontosPelosPesos(r, pesos) !== r.pontos);
}

// ---------------------------------------------------------------------------
// Heatmap, funil, ticker, posições
// ---------------------------------------------------------------------------

export type Heat = "zero" | "baixo" | "medio" | "alto";

/**
 * Escala relativa por quartis dos valores POSITIVOS da coluna: ≥ Q3 alto,
 * ≥ mediana médio, abaixo baixo, zero à parte. Devolve o classificador.
 */
export function escalaHeat(values: number[]): (v: number) => Heat {
  const positivos = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (positivos.length === 0) return (v) => (v > 0 ? "alto" : "zero");
  const mediana = positivos[Math.floor(positivos.length * 0.5)];
  const q3 = positivos[Math.floor(positivos.length * 0.75)];
  return (v) => {
    if (v <= 0) return "zero";
    if (v >= q3) return "alto";
    if (v >= mediana) return "medio";
    return "baixo";
  };
}

export type EtapaFunil = {
  chave: "leads" | "agendamentos" | "visitas" | "vendas";
  label: string;
  valor: number;
  /** % em relação à etapa anterior (null na primeira ou sem base). */
  taxa: number | null;
  /** Largura relativa ao topo do funil (4–100). */
  largura: number;
};

/**
 * Funil do período: cada etapa é um EVENTO contado na janela (lead criado,
 * agendamento criado, visita validada, venda aprovada) — não uma coorte. A
 * taxa é etapa ÷ etapa anterior, por isso pode passar de 100% (visitas de
 * leads antigos num mês com poucos leads novos).
 */
export function funilConversao(t: {
  leads: number;
  agendamentos: number;
  visitas: number;
  vendas: number;
}): EtapaFunil[] {
  const etapas: Array<Pick<EtapaFunil, "chave" | "label" | "valor">> = [
    { chave: "leads", label: "Leads recebidos", valor: t.leads },
    { chave: "agendamentos", label: "Agendamentos", valor: t.agendamentos },
    { chave: "visitas", label: "Visitas realizadas", valor: t.visitas },
    { chave: "vendas", label: "Vendas aprovadas", valor: t.vendas },
  ];
  const topo = Math.max(...etapas.map((e) => e.valor), 1);
  return etapas.map((e, i) => {
    const anterior = i === 0 ? null : etapas[i - 1].valor;
    const taxa =
      anterior === null ? null : anterior > 0 ? Math.round((e.valor / anterior) * 100) : null;
    return { ...e, taxa, largura: Math.max((e.valor / topo) * 100, 4) };
  });
}

export function intentDaTaxa(taxa: number | null): "success" | "warning" | "danger" | "neutral" {
  if (taxa === null) return "neutral";
  if (taxa >= 60) return "success";
  if (taxa >= 30) return "warning";
  return "danger";
}

/** Frases do letreiro (ticker) — quem vendeu no mês, pela ordem de vendas. */
export function itensTicker(rows: RankRow[]): string[] {
  return ordenar(
    rows.filter((r) => r.vendas > 0),
    "vendas",
  ).map(
    (r) =>
      `${primeiroNome(r.nome)} — ${r.vendas} ${r.vendas === 1 ? "venda" : "vendas"} · ${fmtBRL(r.vgv)}`,
  );
}

/**
 * Mudança de posição entre duas leituras do MESMO período (positivo = subiu).
 * Trocar o filtro de período não é mudança de posição — quem chama zera o
 * mapa anterior quando a chave do período muda.
 */
export function mudancasDePosicao(
  anterior: Map<string, number>,
  atual: Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  if (anterior.size === 0) return out;
  atual.forEach((pos, id) => {
    const prev = anterior.get(id);
    if (prev !== undefined && prev !== pos) out.set(id, prev - pos);
  });
  return out;
}

export function mapaDePosicoes(rows: RankRowPosicionada[]): Map<string, number> {
  return new Map(rows.map((r) => [r.corretorId, r.pos]));
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

export function formatNum(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

export function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

/** R$ compacto para TV: R$ 1,2 mi · R$ 850 mil · R$ 900. A unidade é escolhida
 *  DEPOIS do arredondamento (999.600 é "R$ 1 mi", nunca "R$ 1.000 mil"). */
export function fmtBRLCompacto(n: number): string {
  const abs = Math.abs(n);
  const sinal = n < 0 ? "-" : "";
  const fmt = (v: number, casas: number) =>
    v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
  const bi = Math.round((abs / 1_000_000_000) * 10) / 10;
  if (bi >= 1) return `${sinal}R$ ${fmt(bi, 1)} bi`;
  const mi = Math.round((abs / 1_000_000) * 10) / 10;
  if (mi >= 1) return `${sinal}R$ ${fmt(mi, 1)} mi`;
  // Abaixo de R$ 999,50 fica em reais inteiros: arredondar 999,4 para "1 mil"
  // mentiria por quase R$ 1 em cima de um valor que cabe inteiro na tela.
  if (Math.round(abs) >= 1000) return `${sinal}R$ ${fmt(Math.round(abs / 1_000), 0)} mil`;
  return `${sinal}R$ ${fmt(abs, 0)}`;
}

export function fmtPct(n: number, casas = 0): string {
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

export function iniciais(nome: string | null | undefined): string {
  if (!nome) return "?";
  return nome
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${formatNum(n)} ${n === 1 ? singular : pluralForm}`;
}

/** Variação % entre dois valores (undefined sem base — o StatTile esconde o delta). */
export function variacaoPct(atual: number, anterior: number): number | undefined {
  if (anterior <= 0) return undefined;
  return Math.round(((atual - anterior) / anterior) * 100);
}
