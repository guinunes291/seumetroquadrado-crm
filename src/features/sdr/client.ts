// Fronteira ÚNICA do cliente para o modelo SDR (migrations 20260904*): as
// leituras degradam para vazio quando a migration ainda não rodou no
// ambiente; as escritas são sempre RPC auditada (nunca UPDATE de posse).
//
// Os tipos das colunas/tabela/RPCs do SDR já estão em
// integrations/supabase/types.ts (mesma forma do codegen) — nada de cast.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/** Códigos de "coluna/relação/função ainda não existe" (migration pendente). */
const FONTE_AUSENTE = new Set(["42703", "42P01", "42883", "PGRST204", "PGRST202", "PGRST205"]);

function erro(e: { message?: string; code?: string } | null, fallback: string): Error {
  return new Error(e?.message || fallback);
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export type LeadSdrRow = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  | "id"
  | "nome"
  | "telefone"
  | "status"
  | "temperatura"
  | "origem"
  | "projeto_nome"
  | "zona"
  | "corretor_id"
  | "sdr_id"
  | "sdr_entregue_em"
  | "sdr_devolvido_em"
  | "sdr_interesse_confirmado"
  | "ultima_interacao"
  | "ultima_atividade_em"
  | "proximo_followup"
  | "created_at"
>;

export type LeadReaquecerRow =
  Database["public"]["Functions"]["sdr_leads_reaquecer"]["Returns"][number];

export type EspelhoRow = Pick<
  Database["public"]["Tables"]["lead_acessos"]["Row"],
  "id" | "lead_id" | "user_id" | "papel" | "motivo" | "concedido_por" | "concedido_em" | "ativo"
>;

export type RaioXSdr = {
  sdr_id: string;
  periodo: { de: string; ate: string };
  base: { total: number; por_status: Record<string, number>; reaquecendo: number };
  contatos: { periodo: number; hoje: number };
  qualificados: number;
  agendamentos: { periodo: number; semana: number };
  visitas: {
    realizadas: number;
    no_show: number;
    pendentes: number;
    comparecimento_pct: number | null;
  };
  entregues: { periodo: number; ativos: number };
  devolvidos: number;
  vendas: { qtd: number; valor: number };
  metas: { contatos_dia: number; agendamentos_semana: number; comparecimento_pct: number };
  comissao_percentual: number;
};

export type EntregaResultado = {
  ok: boolean;
  corretor_id?: string;
  corretor_nome?: string;
  regra?: string;
  roleta?: string;
  agendamento_id?: string;
  motivo?: string;
};

const COLUNAS_LEAD =
  "id, nome, telefone, status, temperatura, origem, projeto_nome, zona, corretor_id, sdr_id, sdr_entregue_em, sdr_devolvido_em, sdr_interesse_confirmado, ultima_interacao, ultima_atividade_em, proximo_followup, created_at";

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------
export async function listarMinhaBase(
  sdrId: string,
  escopo: "base" | "entregues",
): Promise<LeadSdrRow[]> {
  let q = supabase
    .from("leads")
    .select(COLUNAS_LEAD)
    .eq("sdr_id", sdrId)
    .eq("na_lixeira", false)
    .is("deleted_at", null);
  q =
    escopo === "entregues"
      ? q.not("sdr_entregue_em", "is", null).order("sdr_entregue_em", { ascending: false })
      : q
          .is("sdr_entregue_em", null)
          .not("status", "in", "(perdido,contrato_fechado,pos_venda)")
          .order("ultima_atividade_em", { ascending: true, nullsFirst: true });
  const { data, error } = await q.limit(500);
  if (error) {
    if (FONTE_AUSENTE.has(error.code ?? "")) return [];
    throw erro(error, "Não foi possível carregar a base do SDR.");
  }
  return data ?? [];
}

export async function listarReaquecer(limit = 200): Promise<LeadReaquecerRow[]> {
  const { data, error } = await supabase.rpc("sdr_leads_reaquecer", { _limit: limit });
  if (error) {
    if (FONTE_AUSENTE.has(error.code ?? "")) return [];
    throw erro(error, "Não foi possível carregar os leads parados.");
  }
  return data ?? [];
}

export async function carregarRaioX(sdrId?: string | null, de?: string, ate?: string) {
  const { data, error } = await supabase.rpc("sdr_raio_x", {
    ...(sdrId ? { _sdr_id: sdrId } : {}),
    ...(de ? { _de: de } : {}),
    ...(ate ? { _ate: ate } : {}),
  });
  if (error) throw erro(error, "Não foi possível carregar o Raio-X do SDR.");
  // A RPC devolve jsonb com a forma de RaioXSdr (montada no banco).
  return data as RaioXSdr;
}

export async function listarEspelhos(leadId: string): Promise<EspelhoRow[]> {
  const { data, error } = await supabase
    .from("lead_acessos")
    .select("id, lead_id, user_id, papel, motivo, concedido_por, concedido_em, ativo")
    .eq("lead_id", leadId)
    .eq("ativo", true)
    .order("concedido_em", { ascending: true });
  if (error) {
    if (FONTE_AUSENTE.has(error.code ?? "")) return [];
    throw erro(error, "Não foi possível carregar os espelhos do lead.");
  }
  return data ?? [];
}

/** Flag do modelo (distribuicao_settings.sdr_ativo). `null` = desconhecido. */
export async function sdrAtivo(): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("_sdr_ativo");
  if (error) return null;
  return Boolean(data);
}

/** Mesma régua do banco (`lead_reaquecivel_sdr`): flag ligada, lead de corretor
 * sem SDR, etapa viva, parado há N dias e sem visita futura. É o que decide se
 * o botão "Pegar para reaquecer" pode aparecer — sem isso a RPC falharia com
 * 22023 (ex.: lead agendado com visita marcada). */
export async function leadReaquecivelSdr(leadId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("lead_reaquecivel_sdr", { _lead_id: leadId });
  if (error) throw error;
  return Boolean(data);
}

// ---------------------------------------------------------------------------
// Escritas (sempre RPC)
// ---------------------------------------------------------------------------
export async function agendarVisitaSdr(input: {
  leadId: string;
  dataInicio: string;
  dataFim?: string | null;
  titulo?: string | null;
  local?: string | null;
  descricao?: string | null;
  proximaAcao?: string | null;
}): Promise<EntregaResultado> {
  const { data, error } = await supabase.rpc("agendar_visita_sdr", {
    _lead_id: input.leadId,
    _data_inicio: input.dataInicio,
    ...(input.dataFim ? { _data_fim: input.dataFim } : {}),
    ...(input.titulo ? { _titulo: input.titulo } : {}),
    ...(input.local ? { _local: input.local } : {}),
    ...(input.descricao ? { _descricao: input.descricao } : {}),
    ...(input.proximaAcao ? { _proxima_acao: input.proximaAcao } : {}),
  });
  if (error) throw erro(error, "Não foi possível agendar a visita.");
  return data as EntregaResultado;
}

export async function entregarLeadSdr(leadId: string, motivo: string): Promise<EntregaResultado> {
  const { data, error } = await supabase.rpc("entregar_lead_sdr", {
    _lead_id: leadId,
    _motivo: motivo,
  });
  if (error) throw erro(error, "Não foi possível entregar o lead.");
  return data as EntregaResultado;
}

export async function pegarLeadSdr(leadId: string): Promise<void> {
  const { error } = await supabase.rpc("sdr_pegar_lead", { _lead_id: leadId });
  if (error) throw erro(error, "Não foi possível pegar o lead para reaquecer.");
}

export async function marcarInteresse(leadId: string, confirmado: boolean): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ sdr_interesse_confirmado: confirmado })
    .eq("id", leadId);
  if (error) throw erro(error, "Não foi possível registrar o interesse.");
}

export async function alocarEspelho(input: {
  leadId: string;
  corretorId: string;
  modo: "adicionar" | "substituir";
  motivo: string;
}): Promise<{ ok: boolean; corretor_nome?: string }> {
  const { data, error } = await supabase.rpc("alocar_espelho_lead", {
    _lead_id: input.leadId,
    _corretor_id: input.corretorId,
    _modo: input.modo,
    _motivo: input.motivo,
  });
  if (error) throw erro(error, "Não foi possível alocar o espelho.");
  return data as { ok: boolean; corretor_nome?: string };
}

export async function removerEspelho(leadId: string, corretorId: string, motivo: string) {
  const { error } = await supabase.rpc("remover_espelho_lead", {
    _lead_id: leadId,
    _corretor_id: corretorId,
    _motivo: motivo,
  });
  if (error) throw erro(error, "Não foi possível remover o espelho.");
}

export async function devolverAoSdr(leadId: string, motivo: string) {
  const { error } = await supabase.rpc("devolver_lead_ao_sdr", {
    _lead_id: leadId,
    _motivo: motivo,
  });
  if (error) throw erro(error, "Não foi possível devolver o lead ao SDR.");
}

/** WhatsApp ao corretor (Z-API) via edge function — best-effort, nunca
 *  bloqueia a entrega (a decisão já foi gravada pela RPC). */
export async function notificarCorretorSdr(leadId: string, corretorId: string) {
  try {
    await supabase.functions.invoke("notify-lead-transfer", {
      body: { lead_id: leadId, corretor_id: corretorId, contexto: "sdr" },
    });
  } catch {
    // silencioso: o push e o handoff n8n já saíram do banco
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
export const SDR_KEYS = {
  base: (sdrId: string | undefined) => ["sdr:base", sdrId] as const,
  entregues: (sdrId: string | undefined) => ["sdr:entregues", sdrId] as const,
  reaquecer: ["sdr:reaquecer"] as const,
  raioX: (sdrId: string | null | undefined, de?: string, ate?: string) =>
    ["sdr:raio-x", sdrId ?? "eu", de ?? "", ate ?? ""] as const,
  espelhos: (leadId: string) => ["sdr:espelhos", leadId] as const,
  reaquecivel: (leadId: string) => ["sdr:reaquecivel", leadId] as const,
};

export function useMinhaBase(sdrId: string | undefined, escopo: "base" | "entregues") {
  return useQuery({
    queryKey: escopo === "base" ? SDR_KEYS.base(sdrId) : SDR_KEYS.entregues(sdrId),
    enabled: !!sdrId,
    queryFn: () => listarMinhaBase(sdrId!, escopo),
  });
}

export function useReaquecer(enabled = true) {
  return useQuery({ queryKey: SDR_KEYS.reaquecer, enabled, queryFn: () => listarReaquecer() });
}

export function useRaioXSdr(sdrId?: string | null, de?: string, ate?: string, enabled = true) {
  return useQuery({
    queryKey: SDR_KEYS.raioX(sdrId, de, ate),
    enabled,
    queryFn: () => carregarRaioX(sdrId, de, ate),
  });
}

export function useEspelhos(leadId: string, enabled = true) {
  return useQuery({
    queryKey: SDR_KEYS.espelhos(leadId),
    enabled,
    queryFn: () => listarEspelhos(leadId),
  });
}

/** Invalida tudo que muda quando um lead do SDR muda de mão. */
export function useInvalidarSdr() {
  const qc = useQueryClient();
  return (leadId?: string) => {
    void qc.invalidateQueries({ queryKey: ["sdr:base"] });
    void qc.invalidateQueries({ queryKey: ["sdr:entregues"] });
    void qc.invalidateQueries({ queryKey: SDR_KEYS.reaquecer });
    void qc.invalidateQueries({ queryKey: ["sdr:raio-x"] });
    void qc.invalidateQueries({ queryKey: ["leads"] });
    void qc.invalidateQueries({ queryKey: ["leads-kanban"] });
    if (leadId) {
      void qc.invalidateQueries({ queryKey: ["lead", leadId] });
      void qc.invalidateQueries({ queryKey: SDR_KEYS.reaquecivel(leadId) });
      void qc.invalidateQueries({ queryKey: ["interacoes", leadId] });
      void qc.invalidateQueries({ queryKey: ["agendamentos-lead", leadId] });
      void qc.invalidateQueries({ queryKey: ["tarefas-lead", leadId] });
      void qc.invalidateQueries({ queryKey: SDR_KEYS.espelhos(leadId) });
    }
  };
}

export function useLeadReaquecivel(leadId: string, enabled = true) {
  return useQuery({
    queryKey: SDR_KEYS.reaquecivel(leadId),
    enabled,
    staleTime: 30_000,
    queryFn: () => leadReaquecivelSdr(leadId),
  });
}

export function usePegarLead() {
  const invalidar = useInvalidarSdr();
  return useMutation({
    mutationFn: (leadId: string) => pegarLeadSdr(leadId),
    onSuccess: (_d, leadId) => invalidar(leadId),
  });
}

export function useMarcarInteresse(leadId: string) {
  const invalidar = useInvalidarSdr();
  return useMutation({
    mutationFn: (confirmado: boolean) => marcarInteresse(leadId, confirmado),
    onSuccess: () => invalidar(leadId),
  });
}
