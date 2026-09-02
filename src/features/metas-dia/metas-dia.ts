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

function somarDias(dia: string, n: number): string {
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
