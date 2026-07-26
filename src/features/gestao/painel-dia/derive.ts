// Lógica pura do Painel do Dia (Tela 1 da camada de gestão).
// Normaliza o jsonb da RPC gestao_painel_dia, monta o feed degradado a partir
// das RPCs antigas (fallback) e resolve o drill-through de cada exceção.

import type { LeadSearchFiltros } from "@/lib/leads-views";
import type { Intent } from "@/lib/status-tones";

export type ExcecaoTipo =
  | "sla_estourado"
  | "parado"
  | "followup_vencido"
  | "visita_sem_confirmacao"
  | "visita_sem_registro"
  | "analise_parada"
  | "sem_corretor";

export type Excecao = {
  tipo: ExcecaoTipo;
  severidade: number;
  lead_id: string;
  lead_nome: string;
  telefone: string | null;
  corretor_id: string | null;
  corretor_nome: string | null;
  etapa: string;
  temperatura: string | null;
  valor_potencial: number | null;
  detalhe: Record<string, unknown>;
};

export type CorretorSemInteracao = { corretor_id: string; nome: string };

export type PainelDiaResumo = {
  por_tipo: Partial<Record<ExcecaoTipo, number>>;
  total: number;
  vgv_em_risco: number;
  corretores_sem_interacao: CorretorSemInteracao[];
};

export type PainelDia = {
  excecoes: Excecao[];
  resumo: PainelDiaResumo;
  atualizado_em: string | null;
  /** True quando montado pelo fallback (RPCs antigas) — cobertura parcial. */
  degradado: boolean;
};

export const TIPO_META: Record<
  ExcecaoTipo,
  { label: string; intent: Intent; descricao: string }
> = {
  sla_estourado: {
    label: "SLA estourado",
    intent: "danger",
    descricao: "Lead novo sem 1º contato dentro do SLA da origem.",
  },
  sem_corretor: {
    label: "Sem corretor",
    intent: "danger",
    descricao: "Lead ativo sem responsável (fila/roleta travada).",
  },
  visita_sem_confirmacao: {
    label: "Visita sem confirmação",
    intent: "warning",
    descricao: "Visita nas próximas 48h ainda não confirmada.",
  },
  visita_sem_registro: {
    label: "Visita sem registro",
    intent: "warning",
    descricao: "Visita passada há mais de 24h sem desfecho registrado.",
  },
  analise_parada: {
    label: "Análise parada",
    intent: "warning",
    descricao: "Pasta em análise de crédito sem movimento — a venda morre aqui.",
  },
  parado: {
    label: "Parados",
    intent: "info",
    descricao: "Sem atividade além do limiar da temperatura (config).",
  },
  followup_vencido: {
    label: "Follow-up vencido",
    intent: "info",
    descricao: "Próximo follow-up combinado já passou.",
  },
};

export const TIPOS_ORDENADOS = Object.keys(TIPO_META) as ExcecaoTipo[];

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function normalizarExcecao(raw: unknown): Excecao | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const tipo = r.tipo as ExcecaoTipo;
  if (!TIPO_META[tipo] || typeof r.lead_id !== "string") return null;
  return {
    tipo,
    severidade: num(r.severidade) || 3,
    lead_id: r.lead_id,
    lead_nome: str(r.lead_nome) ?? "Lead sem nome",
    telefone: str(r.telefone),
    corretor_id: str(r.corretor_id),
    corretor_nome: str(r.corretor_nome),
    etapa: str(r.etapa) ?? "",
    temperatura: str(r.temperatura),
    valor_potencial: typeof r.valor_potencial === "number" ? r.valor_potencial : null,
    detalhe: (r.detalhe && typeof r.detalhe === "object" ? r.detalhe : {}) as Record<
      string,
      unknown
    >,
  };
}

/** Normaliza o jsonb da RPC — nunca confia no shape, nunca produz NaN. */
export function normalizarPainelDia(raw: unknown): PainelDia {
  const vazio: PainelDia = {
    excecoes: [],
    resumo: { por_tipo: {}, total: 0, vgv_em_risco: 0, corretores_sem_interacao: [] },
    atualizado_em: null,
    degradado: false,
  };
  if (!raw || typeof raw !== "object") return vazio;
  const r = raw as Record<string, unknown>;
  const excecoes = Array.isArray(r.excecoes)
    ? r.excecoes.map(normalizarExcecao).filter((e): e is Excecao => e !== null)
    : [];
  const resumoRaw = (r.resumo ?? {}) as Record<string, unknown>;
  const semInteracao = Array.isArray(resumoRaw.corretores_sem_interacao)
    ? (resumoRaw.corretores_sem_interacao as Array<Record<string, unknown>>)
        .filter((c) => typeof c?.corretor_id === "string")
        .map((c) => ({ corretor_id: c.corretor_id as string, nome: str(c.nome) ?? "—" }))
    : [];
  return {
    excecoes,
    resumo: {
      por_tipo: (resumoRaw.por_tipo ?? {}) as Partial<Record<ExcecaoTipo, number>>,
      total: num(resumoRaw.total),
      vgv_em_risco: num(resumoRaw.vgv_em_risco),
      corretores_sem_interacao: semInteracao,
    },
    atualizado_em: str(r.atualizado_em),
    degradado: false,
  };
}

// ---------------------------------------------------------------------------
// Fallback degradado (RPC nova ausente): compõe o feed com o que já existe em
// produção — leads_sla_pendentes (SLA por origem) + dashboard_leads_urgentes
// (parados 30min+). Cobertura parcial e SEMPRE anunciada como degradada.
// ---------------------------------------------------------------------------

export type SlaFallbackRow = {
  lead_id: string;
  corretor_id: string | null;
  nome: string;
  telefone: string | null;
  status: string;
  sla_minutos: number;
  minutos_decorridos: number;
  sla_status: string;
  temperatura_calc: string;
};

export type UrgenteFallbackRow = {
  lead_id: string;
  nome: string;
  telefone: string;
  corretor_id: string | null;
  corretor_nome: string;
  status: string;
  minutos_parado: number;
};

export function montarPainelDegradado(
  sla: SlaFallbackRow[],
  urgentes: UrgenteFallbackRow[],
): PainelDia {
  const vistos = new Set<string>();
  const excecoes: Excecao[] = [];

  for (const r of sla) {
    if (r.sla_status !== "estourado" || vistos.has(r.lead_id)) continue;
    vistos.add(r.lead_id);
    excecoes.push({
      tipo: "sla_estourado",
      severidade: 1,
      lead_id: r.lead_id,
      lead_nome: r.nome,
      telefone: r.telefone,
      corretor_id: r.corretor_id,
      corretor_nome: null,
      etapa: r.status,
      temperatura: r.temperatura_calc,
      valor_potencial: null,
      detalhe: { minutos: r.minutos_decorridos, sla_minutos: r.sla_minutos },
    });
  }
  for (const r of urgentes) {
    if (vistos.has(r.lead_id)) continue;
    vistos.add(r.lead_id);
    excecoes.push({
      tipo: "parado",
      severidade: 3,
      lead_id: r.lead_id,
      lead_nome: r.nome,
      telefone: r.telefone,
      corretor_id: r.corretor_id,
      corretor_nome: r.corretor_nome,
      etapa: r.status,
      temperatura: null,
      valor_potencial: null,
      detalhe: { minutos: r.minutos_parado },
    });
  }

  excecoes.sort((a, b) => a.severidade - b.severidade);
  const por_tipo: Partial<Record<ExcecaoTipo, number>> = {};
  for (const e of excecoes) por_tipo[e.tipo] = (por_tipo[e.tipo] ?? 0) + 1;
  return {
    excecoes,
    resumo: { por_tipo, total: excecoes.length, vgv_em_risco: 0, corretores_sem_interacao: [] },
    atualizado_em: new Date().toISOString(),
    degradado: true,
  };
}

// ---------------------------------------------------------------------------
// Drill-through e apresentação
// ---------------------------------------------------------------------------

/** Filtros de /leads equivalentes a um card de tipo (lista aproximada, honesta). */
export function drillSearchDoTipo(tipo: ExcecaoTipo): LeadSearchFiltros {
  switch (tipo) {
    case "sla_estourado":
      return { status: "aguardando_atendimento" };
    case "parado":
      return { contato: "sem_contato_5d" };
    case "followup_vencido":
      return { contato: "com_followup" };
    case "analise_parada":
      return { status: "analise_credito" };
    case "visita_sem_confirmacao":
    case "visita_sem_registro":
      return { status: "agendado" };
    case "sem_corretor":
      return {};
  }
}

/** Descrição curta do detalhe de uma exceção para o feed/export. */
export function detalheLegivel(e: Excecao): string {
  const d = e.detalhe;
  if (typeof d.minutos === "number" && typeof d.sla_minutos === "number") {
    return `${d.minutos} min (SLA ${d.sla_minutos})`;
  }
  if (typeof d.minutos === "number") return `${d.minutos} min parado`;
  if (typeof d.dias_parado === "number") {
    const limiar = typeof d.limiar_dias === "number" ? ` (limiar ${d.limiar_dias}d)` : "";
    return `${d.dias_parado}d parado${limiar}`;
  }
  if (typeof d.vencido_ha_horas === "number") return `vencido há ${d.vencido_ha_horas}h`;
  if (typeof d.data_visita === "string") {
    const dt = new Date(d.data_visita);
    return Number.isNaN(dt.getTime())
      ? ""
      : `visita ${dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (typeof d.dias_desde_criacao === "number") return `criado há ${d.dias_desde_criacao}d`;
  return "";
}

/**
 * Converte o jsonb de gestao_resumo_semanal nas abas do XLSX semanal
 * (Resumo + Por corretor). Puro para ser testável.
 */
export function resumoSemanalParaSheets(
  raw: unknown,
): Array<{ name: string; rows: Array<Record<string, unknown>> }> {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const kpis = (r.kpis ?? {}) as Record<string, unknown>;
  const semana = (r.semana ?? {}) as Record<string, unknown>;
  const kpiRows = [
    { Indicador: "Período", Valor: `${semana.de ?? "?"} a ${semana.ate ?? "?"}` },
    { Indicador: "Leads novos", Valor: num(kpis.leads_novos), "Semana anterior": num(kpis.leads_novos_prev) },
    { Indicador: "Visitas realizadas", Valor: num(kpis.visitas) },
    { Indicador: "Vendas aprovadas", Valor: num(kpis.vendas), "Semana anterior": num(kpis.vendas_prev) },
    { Indicador: "VGV (R$)", Valor: num(kpis.vgv) },
    { Indicador: "Perdidos", Valor: num(kpis.perdidos) },
  ];
  const porCorretor = Array.isArray(r.por_corretor)
    ? (r.por_corretor as Array<Record<string, unknown>>).map((c) => ({
        Corretor: str(c.nome) ?? "—",
        "Leads novos": num(c.leads_novos),
        Interações: num(c.interacoes),
        Visitas: num(c.visitas),
        Vendas: num(c.vendas),
        "VGV (R$)": num(c.vgv),
      }))
    : [];
  return [
    { name: "Resumo", rows: kpiRows },
    { name: "Por corretor", rows: porCorretor },
  ];
}

/** Linhas de export (XLSX) do feed filtrado. */
export function excecoesParaExport(excecoes: Excecao[]): Array<Record<string, unknown>> {
  return excecoes.map((e) => ({
    Tipo: TIPO_META[e.tipo].label,
    Lead: e.lead_nome,
    Telefone: e.telefone ?? "",
    Corretor: e.corretor_nome ?? "",
    Etapa: e.etapa,
    Temperatura: e.temperatura ?? "",
    Detalhe: detalheLegivel(e),
    "Valor potencial (R$)": e.valor_potencial ?? "",
  }));
}
