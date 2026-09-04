// Metas do dia declaradas pelo corretor — lógica pura (sem React, sem banco).
//
// O "dia" da operação é America/Sao_Paulo, o mesmo fuso que os triggers de
// pontuação usam no banco. O relógio do aparelho pode estar em outro fuso
// (viagem, notebook configurado errado): por isso o dia NUNCA vem de
// `new Date().getDate()` e sempre passa por diaSaoPaulo().

export const FUSO_OPERACAO = "America/Sao_Paulo";

// São Paulo não tem horário de verão desde 2019: o deslocamento é fixo em -03:00.
// Usado só para montar os limites ISO do dia/semana nas queries.
const OFFSET_SP = "-03:00";

export type MetaDia = {
  dia: string;
  semana_inicio: string;
  meta_agendamentos: number;
  meta_documentacoes: number;
  meta_vendas_semana: number;
  /** Quando o corretor respondeu/ajustou (ISO). Opcional: linhas antigas/mocks. */
  respondido_em?: string | null;
};

export type RealizadoDia = {
  agendamentos: number;
  documentacoes: number;
  vendas_semana: number;
  /** Vendas da semana que ainda aguardam aprovação da gestão (subconjunto de vendas_semana). */
  vendas_pendentes: number;
};

export type MetaChave = "agendamentos" | "documentacoes" | "vendas_semana";

export const METAS_CHAVES: MetaChave[] = ["agendamentos", "documentacoes", "vendas_semana"];

const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_OPERACAO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia (YYYY-MM-DD) em America/Sao_Paulo para o instante `now`. */
export function diaSaoPaulo(now: Date = new Date()): string {
  return fmtDia.format(now);
}

/** Interpreta YYYY-MM-DD como data de calendário (meio-dia UTC: sem risco de virar o dia). */
function parseDia(dia: string): Date {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function fmtUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function somarDias(dia: string, n: number): string {
  const d = parseDia(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtUtc(d);
}

/** 1 = segunda … 7 = domingo (ISO), para um dia YYYY-MM-DD. */
export function diaDaSemanaIso(dia: string): number {
  const dow = parseDia(dia).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Segunda-feira da semana de `dia` (a semana da operação é seg–dom). */
export function inicioSemana(dia: string): string {
  return somarDias(dia, -(diaDaSemanaIso(dia) - 1));
}

/** Domingo da semana de `dia`. */
export function fimSemana(dia: string): string {
  return somarDias(inicioSemana(dia), 6);
}

/** Dia útil = segunda a sexta. Feriados não são considerados (o popup fica opcional só no fim de semana). */
export function ehDiaUtil(dia: string): boolean {
  return diaDaSemanaIso(dia) <= 5;
}

/** Limites ISO (com fuso de São Paulo) de um dia — para filtrar created_at nas queries. */
export function limitesDoDia(dia: string): { ini: string; fim: string } {
  return { ini: `${dia}T00:00:00.000${OFFSET_SP}`, fim: `${dia}T23:59:59.999${OFFSET_SP}` };
}

/**
 * Decide se o popup obrigatório deve abrir. Regras:
 *  - só para quem tem o papel corretor;
 *  - só se ainda não há resposta de HOJE (fonte: banco, não localStorage);
 *  - fim de semana: opcional — se o corretor pulou hoje, não insiste.
 */
export function precisaResponder(input: {
  dia: string;
  ehCorretor: boolean;
  respostaHoje: MetaDia | null | undefined;
  puladoHoje: boolean;
}): boolean {
  if (!input.ehCorretor) return false;
  if (input.respostaHoje) return false;
  if (!ehDiaUtil(input.dia) && input.puladoHoje) return false;
  return true;
}

/** No fim de semana o popup pode ser fechado sem responder; em dia útil, não. */
export function popupBloqueante(dia: string): boolean {
  return ehDiaUtil(dia);
}

export type MetaGestor = { meta_agendamentos: number; meta_vendas: number } | null | undefined;

/**
 * Valores pré-preenchidos do popup. Prioridade:
 *  1. a última resposta do corretor (ontem, ou a anterior);
 *  2. a meta sugerida pelo gestor (metas_diarias);
 *  3. zero.
 * A meta semanal de vendas só é herdada da última resposta se ela for da MESMA
 * semana — a semana virou, a meta é outra e vem da sugestão/zero.
 */
export function sugestaoInicial(input: {
  dia: string;
  ultima: MetaDia | null | undefined;
  gestor: MetaGestor;
}): Pick<MetaDia, "meta_agendamentos" | "meta_documentacoes" | "meta_vendas_semana"> {
  const { ultima, gestor } = input;
  const semana = inicioSemana(input.dia);
  const mesmaSemana = !!ultima && ultima.semana_inicio === semana;
  return {
    meta_agendamentos: ultima?.meta_agendamentos ?? gestor?.meta_agendamentos ?? 0,
    meta_documentacoes: ultima?.meta_documentacoes ?? 0,
    meta_vendas_semana: mesmaSemana
      ? ultima!.meta_vendas_semana
      : (ultima?.meta_vendas_semana ?? (gestor?.meta_vendas ? gestor.meta_vendas * 5 : 0)),
  };
}

/** Normaliza o que o usuário digitou: inteiro >= 0 (vazio/NaN → 0). */
export function normalizarMeta(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export type Progresso = { realizado: number; meta: number; pct: number; batida: boolean };

/** % da meta (0–100, nunca NaN). Meta 0 → 0% e nunca "batida". */
export function progresso(realizado: number, meta: number): Progresso {
  const r = Math.max(0, realizado);
  const m = Math.max(0, meta);
  const pct = m > 0 ? Math.min(100, Math.round((r / m) * 100)) : 0;
  return { realizado: r, meta: m, pct, batida: m > 0 && r >= m };
}

export function progressoDasMetas(
  meta: MetaDia,
  realizado: RealizadoDia,
): Record<MetaChave, Progresso> {
  return {
    agendamentos: progresso(realizado.agendamentos, meta.meta_agendamentos),
    documentacoes: progresso(realizado.documentacoes, meta.meta_documentacoes),
    vendas_semana: progresso(realizado.vendas_semana, meta.meta_vendas_semana),
  };
}

/** Metas que acabaram de ser batidas (estavam abaixo e agora estão em 100%). */
export function metasRecemBatidas(
  anterior: Record<MetaChave, Progresso> | null,
  atual: Record<MetaChave, Progresso>,
): MetaChave[] {
  if (!anterior) return [];
  return METAS_CHAVES.filter((k) => atual[k].batida && !anterior[k].batida);
}

// ---------------------------------------------------------------------------
// Contagens do realizado a partir das linhas cruas (o filtro grosso é feito no
// banco; aqui fica a regra de negócio, testável).
// ---------------------------------------------------------------------------

export type AgendamentoRow = {
  tipo: string;
  status: string;
  auto_gerado: boolean;
  deleted_at: string | null;
};

/** Agendamento "feito hoje": visita ou reunião, criado pelo corretor (não automático), não cancelado. */
export function contarAgendamentos(rows: AgendamentoRow[]): number {
  return rows.filter(
    (a) =>
      (a.tipo === "visita" || a.tipo === "reuniao") &&
      !a.auto_gerado &&
      a.deleted_at === null &&
      a.status !== "cancelado",
  ).length;
}

export type VendaRow = { status_venda: string; distrato: boolean };

/** Vendas da semana: pendentes + aprovadas, sem distrato. Rejeitadas/canceladas/rascunho ficam fora. */
export function contarVendasSemana(rows: VendaRow[]): { total: number; pendentes: number } {
  const validas = rows.filter(
    (v) => !v.distrato && (v.status_venda === "pendente" || v.status_venda === "aprovada"),
  );
  return {
    total: validas.length,
    pendentes: validas.filter((v) => v.status_venda === "pendente").length,
  };
}

export const ROTULOS: Record<MetaChave, { pergunta: string; curto: string }> = {
  agendamentos: { pergunta: "Quantos agendamentos farei hoje?", curto: "Agendamentos hoje" },
  documentacoes: {
    pergunta: "Quantas documentações irei recolher hoje?",
    curto: "Documentações hoje",
  },
  vendas_semana: { pergunta: "Minha meta de vendas essa semana?", curto: "Vendas na semana" },
};

// ---------------------------------------------------------------------------
// Fase 2 — conversão do corretor, contatos necessários, balanço e checkpoints.
// ---------------------------------------------------------------------------

export type MetaValores = Pick<
  MetaDia,
  "meta_agendamentos" | "meta_documentacoes" | "meta_vendas_semana"
>;

export type ContagemFunil = {
  contatos: number;
  agendamentos: number;
  documentacoes: number;
  vendas: number;
};

export type TaxasRpc = {
  dias: number;
  minhas: ContagemFunil;
  time: ContagemFunil;
  corretores: number;
};

const numOuZero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function contagem(raw: unknown): ContagemFunil | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    contatos: numOuZero(r.contatos),
    agendamentos: numOuZero(r.agendamentos),
    documentacoes: numOuZero(r.documentacoes),
    vendas: numOuZero(r.vendas),
  };
}

/** Normaliza o jsonb da RPC metas_dia_taxas; null se o shape não for o esperado. */
export function normalizarTaxasRpc(raw: unknown): TaxasRpc | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const minhas = contagem(r.minhas);
  const time = contagem(r.time);
  if (!minhas || !time) return null;
  return { dias: numOuZero(r.dias) || 30, minhas, time, corretores: numOuZero(r.corretores) };
}

/** Abaixo disso a taxa própria é ruído — usa a do time como referência. */
export const MIN_CONTATOS_TAXA_PROPRIA = 20;

export type TaxasFunil = {
  /** "minha" = histórico do próprio corretor; "time" = fallback; null = sem dado. */
  fonte: "minha" | "time" | null;
  dias: number;
  contatos_base: number;
  agendamento_por_contato: number | null;
  documentacao_por_contato: number | null;
  venda_por_contato: number | null;
  minhas: ContagemFunil | null;
  time: ContagemFunil | null;
};

const SEM_TAXAS: TaxasFunil = {
  fonte: null,
  dias: 30,
  contatos_base: 0,
  agendamento_por_contato: null,
  documentacao_por_contato: null,
  venda_por_contato: null,
  minhas: null,
  time: null,
};

/** Taxa = resultado / contatos. null quando não há contatos ou nenhum resultado (não dá para projetar). */
function taxaDe(resultado: number, contatos: number): number | null {
  return contatos > 0 && resultado > 0 ? resultado / contatos : null;
}

/**
 * Escolhe a base das taxas: a do corretor quando ele tem volume mínimo de
 * contatos no período; senão a do time (todos com papel corretor).
 */
export function taxasConversao(r: TaxasRpc | null): TaxasFunil {
  if (!r) return SEM_TAXAS;
  const usarMinha = r.minhas.contatos >= MIN_CONTATOS_TAXA_PROPRIA;
  const base = usarMinha ? r.minhas : r.time;
  const fonte: TaxasFunil["fonte"] = usarMinha ? "minha" : base.contatos > 0 ? "time" : null;
  return {
    fonte,
    dias: r.dias,
    contatos_base: fonte ? base.contatos : 0,
    agendamento_por_contato: fonte ? taxaDe(base.agendamentos, base.contatos) : null,
    documentacao_por_contato: fonte ? taxaDe(base.documentacoes, base.contatos) : null,
    venda_por_contato: fonte ? taxaDe(base.vendas, base.contatos) : null,
    minhas: r.minhas,
    time: r.time,
  };
}

/** "1 a cada N contatos" — N arredondado; null sem taxa. */
export function umACada(taxa: number | null): number | null {
  return taxa === null || taxa <= 0 ? null : Math.max(1, Math.round(1 / taxa));
}

/** Dias úteis que restam na semana INCLUINDO o dia (seg=5 … sex=1; fim de semana=0). */
export function diasUteisRestantesSemana(dia: string): number {
  const d = diaDaSemanaIso(dia);
  return d <= 5 ? 6 - d : 0;
}

export type ContatosNecessarios = {
  agendamentos: number | null;
  documentacoes: number | null;
  /** Por dia útil restante, para as vendas que ainda faltam na semana. */
  vendas: number | null;
  vendas_faltam: number;
  /** O maior entre os três: fazendo esse volume, as três metas ficam cobertas. */
  total: number | null;
};

/**
 * Cálculo reverso: quantos contatos hoje para bater cada meta, pela taxa
 * vigente. Meta zero → 0 contatos; sem taxa → null ("sem dado").
 */
export function contatosNecessarios(
  meta: MetaValores,
  taxas: TaxasFunil,
  vendasFeitasSemana: number,
  dia: string,
): ContatosNecessarios {
  const need = (m: number, t: number | null): number | null =>
    m <= 0 ? 0 : t === null ? null : Math.ceil(m / t);
  const faltam = Math.max(0, meta.meta_vendas_semana - Math.max(0, vendasFeitasSemana));
  const dias = Math.max(1, diasUteisRestantesSemana(dia));
  const vendas =
    faltam <= 0
      ? 0
      : taxas.venda_por_contato === null
        ? null
        : Math.ceil(faltam / taxas.venda_por_contato / dias);
  const agendamentos = need(meta.meta_agendamentos, taxas.agendamento_por_contato);
  const documentacoes = need(meta.meta_documentacoes, taxas.documentacao_por_contato);
  // Só as metas que exigem algo entram no total. Se nenhuma delas tem taxa,
  // o total é "sem dado" (null) — nunca um 0 falso vindo das metas zeradas.
  const relevantes = [
    meta.meta_agendamentos > 0 ? agendamentos : undefined,
    meta.meta_documentacoes > 0 ? documentacoes : undefined,
    faltam > 0 ? vendas : undefined,
  ].filter((v): v is number | null => v !== undefined);
  const validos = relevantes.filter((v): v is number => v !== null);
  const total = relevantes.length === 0 ? 0 : validos.length === 0 ? null : Math.max(...validos);
  return { agendamentos, documentacoes, vendas, vendas_faltam: faltam, total };
}

// ---------- balanço do dia anterior ----------

export type BalancoItem = {
  chave: MetaChave;
  meta: number;
  realizado: number;
  faltou: number;
  batida: boolean;
};

export type Balanco = {
  dia: string;
  /** Metas DIÁRIAS com valor > 0 (agendamentos, documentações). */
  itens: BalancoItem[];
  vendas: BalancoItem & { semana_encerrada: boolean };
  /** Média do % atingido das metas consideradas (diárias + vendas se a semana fechou); null sem metas. */
  pct_geral: number | null;
};

function itemBalanco(chave: MetaChave, meta: number, realizado: number): BalancoItem {
  const m = Math.max(0, meta);
  const r = Math.max(0, realizado);
  return { chave, meta: m, realizado: r, faltou: Math.max(0, m - r), batida: m > 0 && r >= m };
}

export function balancoDoDia(meta: MetaDia, realizado: RealizadoDia, hoje: string): Balanco {
  const itens = [
    itemBalanco("agendamentos", meta.meta_agendamentos, realizado.agendamentos),
    itemBalanco("documentacoes", meta.meta_documentacoes, realizado.documentacoes),
  ].filter((i) => i.meta > 0);
  const vendas = {
    ...itemBalanco("vendas_semana", meta.meta_vendas_semana, realizado.vendas_semana),
    semana_encerrada: meta.semana_inicio !== inicioSemana(hoje),
  };
  const considerados = [...itens, ...(vendas.semana_encerrada && vendas.meta > 0 ? [vendas] : [])];
  const pct_geral = considerados.length
    ? Math.round(
        considerados.reduce((acc, i) => acc + Math.min(100, (i.realizado / i.meta) * 100), 0) /
          considerados.length,
      )
    : null;
  return { dia: meta.dia, itens, vendas, pct_geral };
}

/** "ontem" quando for o dia anterior; senão "sexta-feira (05/09)". */
export function rotuloDoDia(dia: string, hoje: string): string {
  if (dia === somarDias(hoje, -1)) return "ontem";
  const d = parseDia(dia);
  const semana = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(d);
  const [y, m, dd] = dia.split("-");
  void y;
  return `${semana} (${dd}/${m})`;
}

// ---------- checkpoints durante o dia ----------

export const CHECKPOINTS = [12, 15, 17] as const;
export type Checkpoint = (typeof CHECKPOINTS)[number];
/** Jornada considerada para o ritmo esperado (9h–18h). */
export const JORNADA = { inicio: 9, fim: 18 } as const;

const fmtHora = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO_OPERACAO,
  hour: "numeric",
  hourCycle: "h23",
});

/** Hora cheia (0–23) em America/Sao_Paulo. */
export function horaSaoPaulo(now: Date = new Date()): number {
  const h = Number.parseInt(fmtHora.format(now), 10);
  return Number.isFinite(h) ? h % 24 : 0;
}

/** Fração da jornada já transcorrida (0–1) — o que se espera da meta a essa hora. */
export function ritmoEsperado(hora: number): number {
  const f = (hora - JORNADA.inicio) / (JORNADA.fim - JORNADA.inicio);
  return Math.min(1, Math.max(0, f));
}

/**
 * Qual checkpoint disparar agora: o ÚLTIMO já passado que ainda não foi
 * disparado e é posterior à hora em que a meta foi declarada (quem declara às
 * 16h não recebe o aviso das 12h e das 15h). Um por vez.
 */
export function checkpointDevido(
  hora: number,
  disparados: readonly number[],
  horaDeclaracao: number | null,
): Checkpoint | null {
  const candidatos = CHECKPOINTS.filter(
    (c) => c <= hora && !disparados.includes(c) && (horaDeclaracao === null || c > horaDeclaracao),
  );
  return candidatos.length ? (Math.max(...candidatos) as Checkpoint) : null;
}

export type AvaliacaoItem = {
  chave: MetaChave;
  meta: number;
  realizado: number;
  /** Quanto já deveria estar feito a essa hora (arredondado para cima). */
  esperado: number;
  faltam: number;
  atrasada: boolean;
};

export type AvaliacaoCheckpoint = {
  hora: number;
  esperado_pct: number;
  itens: AvaliacaoItem[];
  atrasadas: number;
};

/** Compara o realizado das metas DIÁRIAS com o ritmo esperado para a hora. */
export function avaliarCheckpoint(
  meta: MetaValores,
  realizado: RealizadoDia,
  hora: number,
): AvaliacaoCheckpoint {
  const f = ritmoEsperado(hora);
  const item = (chave: MetaChave, m: number, r: number): AvaliacaoItem => {
    const esperado = Math.ceil(m * f);
    return {
      chave,
      meta: m,
      realizado: r,
      esperado,
      faltam: Math.max(0, m - r),
      atrasada: r < esperado,
    };
  };
  const itens = [
    item("agendamentos", meta.meta_agendamentos, realizado.agendamentos),
    item("documentacoes", meta.meta_documentacoes, realizado.documentacoes),
  ].filter((i) => i.meta > 0);
  return {
    hora,
    esperado_pct: Math.round(f * 100),
    itens,
    atrasadas: itens.filter((i) => i.atrasada).length,
  };
}

const NOME: Record<MetaChave, [string, string]> = {
  agendamentos: ["agendamento", "agendamentos"],
  documentacoes: ["documentação", "documentações"],
  vendas_semana: ["venda", "vendas"],
};

export function plural(n: number, chave: MetaChave): string {
  return `${n} ${NOME[chave][n === 1 ? 0 : 1]}`;
}

function listar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

export type MensagemCheckpoint = { titulo: string; mensagem: string; tom: "ok" | "atencao" };

/** Texto do aviso do checkpoint. null quando não há meta diária acima de zero. */
export function mensagemCheckpoint(
  av: AvaliacaoCheckpoint,
  taxas?: TaxasFunil,
): MensagemCheckpoint | null {
  if (av.itens.length === 0) return null;
  const hora = `${av.hora}h`;
  const status = listar(av.itens.map((i) => `${i.realizado}/${plural(i.meta, i.chave)}`));
  if (av.atrasadas === 0) {
    const fechou = av.itens.every((i) => i.faltam === 0);
    return {
      tom: "ok",
      titulo: fechou ? `Metas de hoje batidas às ${hora}` : `No ritmo às ${hora}`,
      mensagem: fechou
        ? `Você já fechou ${status}. Dia ganho — o que vier agora é bônus.`
        : `Você está com ${status}, dentro do esperado para ${av.esperado_pct}% do dia. Segue assim.`,
    };
  }
  const atrasadas = av.itens.filter((i) => i.atrasada);
  const faltam = listar(atrasadas.map((i) => plural(i.faltam, i.chave)));
  const esperado = listar(atrasadas.map((i) => `${plural(i.esperado, i.chave)}`));
  let sugestao = "";
  if (taxas && taxas.fonte) {
    const need = atrasadas
      .map((i) => {
        const t =
          i.chave === "agendamentos"
            ? taxas.agendamento_por_contato
            : taxas.documentacao_por_contato;
        return t === null ? null : Math.ceil(i.faltam / t);
      })
      .filter((v): v is number => v !== null);
    if (need.length) sugestao = ` Pela sua conversão, isso são ≈ ${Math.max(...need)} contatos.`;
  }
  return {
    tom: "atencao",
    titulo: `Ritmo abaixo da meta às ${hora}`,
    mensagem: `Faltam ${faltam}. Com ${av.esperado_pct}% do dia passado, o esperado era já ter ${esperado}.${sugestao}`,
  };
}
