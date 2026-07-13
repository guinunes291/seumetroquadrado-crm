// Detalhe leve de um lead para peek/modo foco: a linha completa + histórico
// recente + próximos passos, com prefetch do próximo lead da fila (a troca
// J/K no modo foco fica instantânea).

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { InteracaoDirecao, InteracaoTipo } from "@/lib/interacoes";

export type LeadDetail = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  origem: string;
  status: string;
  temperatura: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  corretor_id: string | null;
  created_at: string;
  ultima_interacao: string | null;
  renda_informada: string | null;
  entrada_disponivel: string | null;
  usa_fgts: boolean | null;
  observacoes: string | null;
};

export type InteracaoResumo = {
  id: string;
  tipo: InteracaoTipo;
  direcao: InteracaoDirecao;
  titulo: string | null;
  conteudo: string;
  ocorreu_em: string;
};

export type TarefaResumo = {
  id: string;
  titulo: string;
  data_vencimento: string | null;
};

const DETAIL_FIELDS =
  "id, nome, telefone, email, origem, status, temperatura, projeto_id, projeto_nome, corretor_id, created_at, ultima_interacao, renda_informada, entrada_disponivel, usa_fgts, observacoes";

async function fetchLead(leadId: string): Promise<LeadDetail> {
  const { data, error } = await supabase
    .from("leads")
    .select(DETAIL_FIELDS)
    .eq("id", leadId)
    .single();
  if (error) throw error;
  return data as unknown as LeadDetail;
}

async function fetchInteracoes(leadId: string): Promise<InteracaoResumo[]> {
  const { data, error } = await supabase
    .from("interacoes")
    .select("id, tipo, direcao, titulo, conteudo, ocorreu_em")
    .eq("lead_id", leadId)
    .order("ocorreu_em", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as InteracaoResumo[];
}

async function fetchTarefas(leadId: string): Promise<TarefaResumo[]> {
  const { data, error } = await supabase
    .from("tarefas")
    .select("id, titulo, data_vencimento")
    .eq("lead_id", leadId)
    .in("status", ["pendente", "em_andamento"])
    .order("data_vencimento", { ascending: true, nullsFirst: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as TarefaResumo[];
}

export function useLeadDetail(leadId: string | null) {
  const lead = useQuery({
    queryKey: ["lead-detail", leadId],
    enabled: !!leadId,
    staleTime: 15_000,
    queryFn: () => fetchLead(leadId!),
  });
  const interacoes = useQuery({
    queryKey: ["lead-detail:interacoes", leadId],
    enabled: !!leadId,
    staleTime: 15_000,
    queryFn: () => fetchInteracoes(leadId!),
  });
  const tarefas = useQuery({
    queryKey: ["lead-detail:tarefas", leadId],
    enabled: !!leadId,
    staleTime: 15_000,
    queryFn: () => fetchTarefas(leadId!),
  });
  return { lead, interacoes, tarefas };
}

/** Aquecedor da fila do modo foco — chame com o PRÓXIMO id ao trocar de lead. */
export function usePrefetchLeadDetail(): (leadId: string) => void {
  const qc = useQueryClient();
  return useCallback(
    (leadId: string) => {
      void qc.prefetchQuery({
        queryKey: ["lead-detail", leadId],
        staleTime: 15_000,
        queryFn: () => fetchLead(leadId),
      });
      void qc.prefetchQuery({
        queryKey: ["lead-detail:interacoes", leadId],
        staleTime: 15_000,
        queryFn: () => fetchInteracoes(leadId),
      });
    },
    [qc],
  );
}
