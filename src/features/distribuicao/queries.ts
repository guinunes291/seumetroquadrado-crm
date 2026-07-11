// Distribuição v3 — camada de dados (React Query) da central de distribuição.
//
// Todos os números vêm do SERVIDOR (RPCs do motor único) — nada de calcular
// "próximo da vez" ou % no relógio/timezone do navegador (bug #8 da auditoria).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

type LeadOrigem = Database["public"]["Enums"]["lead_origem"];

// ---------------------------------------------------------------------------
// Tipos das respostas
// ---------------------------------------------------------------------------
export interface ResumoDistribuicao {
  distribuidos_hoje: number;
  aguardando_distribuicao: number;
  excecoes_pendentes: number;
  aptos_plantao: number;
  aptos_marquinhos: number;
  aptos_landing: number;
  sem_atendimento: number;
  parados_timeout: number;
  pct_medio_trabalhado: number;
  erros_24h: number;
  atualizado_em: string;
}

export interface ElegibilidadeLinha {
  corretor_id: string;
  nome: string;
  apto: boolean;
  motivos: string[];
  pct_trabalhado: number;
  carteira_total: number;
  aguardando: number;
  recebidos_hoje: number;
  recebidos_mes: number;
  limite_diario: number;
  presente: boolean;
  pausado: boolean;
  motivo_pausa: string | null;
  participante_ativo: boolean;
  ultimo_lead_em: string | null;
  incluido_por: string | null;
  incluido_em: string | null;
}

export interface ExcecaoLinha {
  id: string;
  lead_id: string;
  motivo: string;
  detalhe: string | null;
  roleta_slug: string | null;
  status: string;
  tentativas: number;
  ultimo_erro: string | null;
  contexto: Json | null;
  resolvida_por: string | null;
  resolvida_em: string | null;
  resolucao: string | null;
  created_at: string;
  leads: { nome: string; telefone: string; origem: string; status: string } | null;
}

export interface LogLinha {
  id: string;
  lead_id: string;
  corretor_id: string | null;
  tipo: string;
  motivo: string | null;
  roleta_slug: string | null;
  regra_aplicada: string | null;
  resultado: string;
  distribuido_por_id: string | null;
  created_at: string;
  leads: { nome: string } | null;
}

export interface VendaMesAnterior {
  corretor_id: string;
  qtd: number;
  total: number;
}

export interface ParticipanteLogLinha {
  id: string;
  roleta_id: string;
  corretor_id: string;
  acao: string;
  motivo: string | null;
  feito_por: string | null;
  created_at: string;
}

export interface RoletaRow {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  criterio_participacao: string;
  exigir_presenca: boolean;
  horario_inicio: string | null;
  horario_fim: string | null;
  permitir_fora_horario: boolean;
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
export function useDistribuicaoResumo(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:resumo"],
    enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("painel_distribuicao_resumo");
      if (error) throw error;
      return data as unknown as ResumoDistribuicao;
    },
  });
}

export function useElegibilidadeRoleta(slug: string, enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:elegibilidade", slug],
    enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("elegibilidade_roleta", { _slug: slug });
      if (error) throw error;
      return (data ?? []) as ElegibilidadeLinha[];
    },
  });
}

export function useVendasMesAnterior(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:vendas-mes-anterior"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("vendas_mes_anterior");
      if (error) throw error;
      return (data ?? []) as VendaMesAnterior[];
    },
  });
}

export function useMinhaElegibilidade(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:minha-elegibilidade"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("minha_elegibilidade");
      if (error) throw error;
      return (data ?? []) as Array<{
        roleta_slug: string;
        roleta_nome: string;
        participante: boolean;
        apto: boolean;
        motivos: string[];
        pct_trabalhado?: number;
        carteira_total?: number;
        aguardando?: number;
        recebidos_hoje?: number;
        recebidos_mes?: number;
        limite_diario?: number;
        pausado?: boolean;
        motivo_pausa?: string | null;
      }>;
    },
  });
}

export function useExcecoes(status: "abertas" | "todas" = "abertas", enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:excecoes", status],
    enabled,
    staleTime: 10_000,
    // Fallback do realtime: exceção nova precisa aparecer mesmo se o canal cair.
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("distribuicao_excecoes")
        .select("*, leads(nome, telefone, origem, status)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (status === "abertas") q = q.in("status", ["pendente", "em_analise"]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ExcecaoLinha[];
    },
  });
}

export interface FiltrosHistorico {
  roleta?: string | null;
  corretor?: string | null;
  resultado?: string | null;
  tipo?: string | null;
  busca?: string | null;
  dias?: number;
  /** Máximo de linhas trazidas do servidor (default 300). */
  limite?: number;
  /** Só decisões com falha (resultado ≠ sucesso) — filtro no servidor. */
  apenasFalhas?: boolean;
}

export function useHistoricoDistribuicao(filtros: FiltrosHistorico, enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:historico", filtros],
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("distribution_log")
        .select("*, leads(nome)")
        .order("created_at", { ascending: false })
        .limit(filtros.limite ?? 300);
      if (filtros.roleta) q = q.eq("roleta_slug", filtros.roleta);
      if (filtros.corretor) q = q.eq("corretor_id", filtros.corretor);
      if (filtros.resultado) q = q.eq("resultado", filtros.resultado);
      if (filtros.apenasFalhas) q = q.neq("resultado", "sucesso");
      if (filtros.tipo)
        q = q.eq("tipo", filtros.tipo as Database["public"]["Enums"]["distribuicao_tipo"]);
      if (filtros.dias)
        q = q.gte("created_at", new Date(Date.now() - filtros.dias * 86_400_000).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as LogLinha[];
    },
  });
}

/** Contexto completo da decisão (aptos/inaptos) — sob demanda, por linha. */
export function useDecisaoContexto(logId: string | null) {
  return useQuery({
    queryKey: ["distribuicao:contexto", logId],
    enabled: !!logId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuicao_log_contexto")
        .select("contexto")
        .eq("log_id", logId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.contexto ?? null) as Json | null;
    },
  });
}

export function useRoletas(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:roletas"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("roletas").select("*").order("slug");
      if (error) throw error;
      return (data ?? []) as RoletaRow[];
    },
  });
}

export function useParticipantesLog(roletaId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:participantes-log", roletaId],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("roleta_participantes_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (roletaId) q = q.eq("roleta_id", roletaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ParticipanteLogLinha[];
    },
  });
}

export function useDistribuicaoSettings(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:settings"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("distribuicao_settings").select("*");
      if (error) throw error;
      const map: Record<string, { valor: Json; descricao: string | null; updated_at: string }> = {};
      for (const row of data ?? []) {
        map[row.chave] = {
          valor: row.valor,
          descricao: row.descricao,
          updated_at: row.updated_at,
        };
      }
      return map;
    },
  });
}

export function useDistribuicaoConfig(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:config"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribuicao_config")
        .select("*")
        .order("origem");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Recebidos na semana (7 dias) por corretor em uma roleta — para a aba Landing. */
export function useRecebidosSemana(slug: string, enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:recebidos-semana", slug],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("distribution_log")
        .select("corretor_id")
        .eq("roleta_slug", slug)
        .eq("resultado", "sucesso")
        .gte("created_at", desde)
        .limit(2000);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const row of data ?? []) {
        if (row.corretor_id) m.set(row.corretor_id, (m.get(row.corretor_id) ?? 0) + 1);
      }
      return m;
    },
  });
}

/** Corretores ativos (role corretor) — para o dialog de inclusão na roleta. */
export function useCorretoresDisponiveis(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:corretores-disponiveis"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: roles, error: er } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "corretor");
      if (er) throw er;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as Array<{ id: string; nome: string }>;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, ativo")
        .in("id", ids)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((p) => ({ id: p.id, nome: p.nome }));
    },
  });
}

/** Nomes dos corretores/gestores (mapa id → nome) para logs e tabelas. */
export function useNomesPerfis(enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:nomes-perfis"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome");
      if (error) throw error;
      const m = new Map<string, string>();
      for (const p of data ?? []) m.set(p.id, p.nome);
      return m;
    },
  });
}

// ---------------------------------------------------------------------------
// Chaves invalidadas em toda mutação da distribuição
// ---------------------------------------------------------------------------
export const DISTRIBUICAO_KEYS = [
  ["distribuicao:resumo"],
  ["distribuicao:elegibilidade"],
  ["distribuicao:excecoes"],
  ["distribuicao:historico"],
  ["distribuicao:participantes-log"],
  ["distribuicao:roletas"],
  ["distribuicao:settings"],
  ["distribuicao:config"],
  ["distribuicao:minha-elegibilidade"],
  ["distribuicao:recebidos-semana"],
  ["distribuicao:vendas-mes-anterior"],
] as const;

function useInvalidateDistribuicao() {
  const qc = useQueryClient();
  return () => {
    for (const key of DISTRIBUICAO_KEYS) qc.invalidateQueries({ queryKey: [...key] });
  };
}

// ---------------------------------------------------------------------------
// Mutações (todas via RPC SECURITY DEFINER — a auditoria é atômica no banco)
// ---------------------------------------------------------------------------
export function useGerenciarParticipante() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: {
      slug: string;
      corretorId: string;
      acao: "incluir" | "remover" | "pausar" | "reativar" | "limite";
      motivo?: string;
      limite?: number | null;
      pausadoAte?: string;
    }) => {
      const { data, error } = await supabase.rpc("gerenciar_participante_roleta", {
        _slug: args.slug,
        _corretor_id: args.corretorId,
        _acao: args.acao,
        _motivo: args.motivo,
        _limite: args.limite ?? undefined,
        _pausado_ate: args.pausadoAte,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(`Falha na ação: ${e.message}`),
  });
}

/** Notifica o corretor via WhatsApp (edge fn) — paridade com as demais
 *  atribuições manuais do CRM; falha nunca bloqueia a ação. */
async function notificarCorretorTransferencia(leadId: string, corretorId: string) {
  try {
    await supabase.functions.invoke("notify-lead-transfer", {
      body: { lead_id: leadId, corretor_id: corretorId },
    });
  } catch (e) {
    console.warn("[distribuicao] notificação WhatsApp falhou:", e);
  }
}

export function useResolverExcecao() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: {
      excecaoId: string;
      leadId: string;
      acao: string;
      params?: Json;
    }) => {
      const { data, error } = await supabase.rpc("resolver_excecao", {
        _excecao_id: args.excecaoId,
        _acao: args.acao,
        _params: args.params ?? {},
      });
      if (error) throw error;
      return data as {
        ok?: boolean;
        motivo?: string;
        corretor_id?: string;
        corretor_nome?: string;
      } | null;
    },
    onSuccess: (res, args) => {
      invalidate();
      if (res && res.ok === false) {
        toast.warning(
          `Ainda sem corretor apto${res.motivo ? ` (${res.motivo})` : ""} — exceção mantida.`,
        );
      } else if (res?.ok && res.corretor_id) {
        void notificarCorretorTransferencia(args.leadId, res.corretor_id);
      }
    },
    onError: (e: Error) => toast.error(`Falha ao resolver exceção: ${e.message}`),
  });
}

export function useDistribuirManual() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: {
      leadId: string;
      corretorId?: string;
      roletaSlug?: string;
      gatilho?: string;
    }) => {
      const { data, error } = await supabase.rpc("distribuir_lead_v3", {
        _lead_id: args.leadId,
        _tipo: args.corretorId ? "manual" : "automatica",
        _roleta_slug: args.roletaSlug,
        _corretor_id: args.corretorId,
        _gatilho: args.gatilho ?? "manual",
      });
      if (error) throw error;
      return data as {
        ok?: boolean;
        corretor_id?: string;
        corretor_nome?: string;
        motivo?: string;
      } | null;
    },
    onSuccess: (res, args) => {
      invalidate();
      if (res?.ok) {
        toast.success(`Lead distribuído para ${res.corretor_nome ?? "corretor"}.`);
        if (res.corretor_id) void notificarCorretorTransferencia(args.leadId, res.corretor_id);
      } else {
        toast.warning(`Sem corretor apto (${res?.motivo ?? "?"}) — lead na fila de exceções.`);
      }
    },
    onError: (e: Error) => toast.error(`Falha na distribuição: ${e.message}`),
  });
}

/** Gestor marca presença de outro corretor (capacidade da página antiga). */
export function useMarcarPresencaAdmin() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: { corretorId: string; presente: boolean }) => {
      const { error } = await supabase.rpc("marcar_presenca_admin", {
        _corretor_id: args.corretorId,
        _presente: args.presente,
      });
      if (error) throw error;
    },
    onSuccess: (_res, args) => {
      invalidate();
      toast.success(args.presente ? "Presença marcada." : "Presença removida.");
    },
    onError: (e: Error) => toast.error(`Falha ao marcar presença: ${e.message}`),
  });
}

export function useRodarDistribuicao() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("processar_distribuicao_automatica");
      if (error) throw error;
      return data as {
        distribuidos?: number;
        sem_corretor?: number;
        repassados_sla?: number;
        redistribuidos?: number;
      } | null;
    },
    onSuccess: (res) => {
      invalidate();
      toast.success(
        `Rodada concluída: ${res?.distribuidos ?? 0} distribuídos · ` +
          `${res?.sem_corretor ?? 0} sem corretor · ${res?.repassados_sla ?? 0} repasses SLA · ` +
          `${res?.redistribuidos ?? 0} redistribuídos.`,
      );
    },
    onError: (e: Error) => toast.error(`Falha ao rodar distribuição: ${e.message}`),
  });
}

export function useAtualizarSetting() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: { chave: string; valor: Json }) => {
      const { data, error } = await supabase.rpc("atualizar_distribuicao_setting", {
        _chave: args.chave,
        _valor: args.valor,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Configuração atualizada.");
    },
    onError: (e: Error) => toast.error(`Falha ao salvar configuração: ${e.message}`),
  });
}

/** Configuração por origem (mapeamento de roleta + tempos) — RPC admin. */
export function useAtualizarConfigOrigem() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: {
      origem: LeadOrigem;
      /** null = desvincular de roleta (leads vão para exceção); undefined = manter. */
      roletaSlug?: string | null;
      timeoutHoras?: number;
      /** null = origem sem repasse por minutos; undefined = manter. */
      timeoutMinutos?: number | null;
      slaMinutos?: number;
    }) => {
      const { data, error } = await (supabase.rpc as CallableFunction)(
        "atualizar_distribuicao_config",
        {
          _origem: args.origem,
          _roleta_slug: args.roletaSlug ?? undefined,
          _limpar_roleta: args.roletaSlug === null,
          _timeout_horas: args.timeoutHoras,
          _timeout_minutos: args.timeoutMinutos ?? undefined,
          _limpar_timeout_minutos: args.timeoutMinutos === null,
          _sla_minutos: args.slaMinutos,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Origem atualizada.");
    },
    onError: (e: Error) => toast.error(`Falha ao salvar origem: ${e.message}`),
  });
}

/** Configuração da própria roleta (horários, presença, ativo) — RPC admin. */
export function useAtualizarRoleta() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: {
      slug: string;
      ativo?: boolean;
      exigirPresenca?: boolean;
      horarioInicio?: string | null;
      horarioFim?: string | null;
      permitirForaHorario?: boolean;
    }) => {
      const { data, error } = await (supabase.rpc as CallableFunction)("atualizar_roleta", {
        _slug: args.slug,
        _ativo: args.ativo,
        _exigir_presenca: args.exigirPresenca,
        _horario_inicio: args.horarioInicio,
        _horario_fim: args.horarioFim,
        _permitir_fora_horario: args.permitirForaHorario,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Roleta atualizada.");
    },
    onError: (e: Error) => toast.error(`Falha ao salvar roleta: ${e.message}`),
  });
}
