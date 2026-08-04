/**
 * Normalização do contrato da RPC `dashboard_kpis`.
 *
 * Desde a migration 20260719130000 a RPC retorna
 * `{ pipeline: {...estoque atual por status}, periodo: {...fluxo do período}, prev }`,
 * mas versões anteriores retornavam um objeto plano. O flatten aceita os dois
 * shapes para que a tela funcione contra qualquer versão aplicada no banco.
 */

type Num = number | null | undefined;

export type DashboardKpisRaw =
  | {
      pipeline?: Record<string, Num> | null;
      periodo?: Record<string, Num> | null;
      prev?: Record<string, Num> | null;
    }
  | Record<string, Num>
  | null
  | undefined;

export type DashboardKpisFlat = {
  /** Estoque atual (foto de agora, independe do filtro de período). */
  novo: number;
  aguardando: number;
  aguardando_retorno: number;
  em_atendimento: number;
  agendado: number;
  visita_realizada: number;
  analise_credito: number;
  analise_aprovada: number;
  analise_reprovada: number;
  em_aberto: number;
  sem_corretor: number;
  /** Fluxo do período filtrado, cada um na sua data canônica. */
  total: number;
  agendamentos_periodo: number;
  /** Visitas validadas, contadas no dia em que a visita estava marcada. */
  visitas_periodo: number;
  /** Agendamentos de visita do período em que o cliente não compareceu. */
  no_shows_periodo: number;
  /** Visitas marcadas para o período (base do comparecimento). */
  visitas_agendadas_periodo: number;
  /** Pastas montadas (3+ documentos recebidos) no período. */
  pastas_periodo: number;
  /** Leads que entraram em análise de crédito no período (1x por lead). */
  analises_periodo: number;
  contrato_fechado: number;
  perdido: number;
  vgv: number;
  /** Variação % vs. período anterior de mesma duração (null = sem base de comparação). */
  deltas: {
    total: number | null;
    contrato_fechado: number | null;
    perdido: number | null;
    vgv: number | null;
  };
};

const n = (v: Num): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Variação percentual (inteiro) de `atual` sobre `anterior`; null sem base. */
export function pctDelta(atual: Num, anterior: Num): number | null {
  if (typeof anterior !== "number" || !Number.isFinite(anterior) || anterior === 0) return null;
  return Math.round(((n(atual) - anterior) / anterior) * 100);
}

function isNested(raw: DashboardKpisRaw): raw is {
  pipeline?: Record<string, Num> | null;
  periodo?: Record<string, Num> | null;
  prev?: Record<string, Num> | null;
} {
  return !!raw && typeof raw === "object" && ("pipeline" in raw || "periodo" in raw);
}

export function flattenDashboardKpis(raw: DashboardKpisRaw): DashboardKpisFlat {
  const vazio: DashboardKpisFlat = {
    novo: 0,
    aguardando: 0,
    aguardando_retorno: 0,
    em_atendimento: 0,
    agendado: 0,
    visita_realizada: 0,
    analise_credito: 0,
    analise_aprovada: 0,
    analise_reprovada: 0,
    em_aberto: 0,
    sem_corretor: 0,
    total: 0,
    agendamentos_periodo: 0,
    visitas_periodo: 0,
    no_shows_periodo: 0,
    visitas_agendadas_periodo: 0,
    pastas_periodo: 0,
    analises_periodo: 0,
    contrato_fechado: 0,
    perdido: 0,
    vgv: 0,
    deltas: { total: null, contrato_fechado: null, perdido: null, vgv: null },
  };
  if (!raw || typeof raw !== "object") return vazio;

  if (isNested(raw)) {
    const p = raw.pipeline ?? {};
    const per = raw.periodo ?? {};
    const prev = raw.prev ?? null;
    return {
      novo: n(p.novo),
      aguardando: n(p.aguardando_atendimento),
      aguardando_retorno: n(p.aguardando_retorno),
      em_atendimento: n(p.em_atendimento),
      agendado: n(p.agendado),
      visita_realizada: n(p.visita_realizada),
      analise_credito: n(p.analise_credito),
      analise_aprovada: n(p.analise_aprovada),
      analise_reprovada: n(p.analise_reprovada),
      em_aberto: n(p.em_aberto),
      sem_corretor: n(p.sem_corretor),
      total: n(per.leads_novos),
      agendamentos_periodo: n(per.agendamentos),
      visitas_periodo: n(per.visitas),
      no_shows_periodo: n(per.no_shows),
      visitas_agendadas_periodo: n(per.visitas_agendadas),
      pastas_periodo: n(per.pastas),
      analises_periodo: n(per.analises),
      contrato_fechado: n(per.vendas),
      perdido: n(per.perdidos),
      vgv: n(per.vgv),
      deltas: {
        total: pctDelta(per.leads_novos, prev?.leads_novos),
        contrato_fechado: pctDelta(per.vendas, prev?.vendas),
        perdido: pctDelta(per.perdidos, prev?.perdidos),
        vgv: pctDelta(per.vgv, prev?.vgv),
      },
    };
  }

  // Shape plano legado: repassa as chaves que a tela sempre usou.
  const flat = raw as Record<string, Num>;
  return {
    ...vazio,
    novo: n(flat.novo),
    aguardando: n(flat.aguardando),
    aguardando_retorno: n(flat.aguardando_retorno),
    em_atendimento: n(flat.em_atendimento),
    agendado: n(flat.agendado),
    visita_realizada: n(flat.visita_realizada),
    analise_credito: n(flat.analise_credito),
    analise_aprovada: n(flat.analise_aprovada),
    analise_reprovada: n(flat.analise_reprovada),
    em_aberto: n(flat.em_aberto),
    sem_corretor: n(flat.sem_corretor),
    total: n(flat.total),
    contrato_fechado: n(flat.contrato_fechado),
    perdido: n(flat.perdido),
    vgv: n(flat.vgv),
  };
}
