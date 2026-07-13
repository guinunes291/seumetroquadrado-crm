import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpcWithFallback } from "@/lib/supabase-errors";

type Range = { di: string | null; df: string | null };

const rpc = (name: string, args: Record<string, unknown>) => (supabase as any).rpc(name, args);

export function useDashboardKpis(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dash:kpis", range, corretor],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("dashboard_kpis", {
        _di: range.di,
        _df: range.df,
        _corretor: corretor,
      });
      if (error) throw error;
      return data as Record<string, number>;
    },
  });
}

export function useDashboardSerie(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dash:serie", range, corretor],
    enabled: enabled && !!range.di && !!range.df,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("dashboard_serie_diaria", {
        _di: range.di,
        _df: range.df,
        _corretor: corretor,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        dia: string;
        leads: number;
        agendamentos: number;
        visitas: number;
        vendas: number;
      }>;
    },
  });
}

export function useDashboardFunil(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dash:funil", range, corretor],
    enabled: enabled && !!range.di && !!range.df,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("dashboard_funil", {
        _di: range.di,
        _df: range.df,
        _corretor: corretor,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ etapa: string; ordem: number; quantidade: number }>;
    },
  });
}

export function useDashboardPorCorretor(range: Range, enabled = true) {
  return useQuery({
    queryKey: ["dash:porCorretor", range],
    enabled: enabled && !!range.di && !!range.df,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("dashboard_metricas_por_corretor", {
        _di: range.di,
        _df: range.df,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        corretor_id: string;
        nome: string;
        leads: number;
        agendamentos: number;
        visitas: number;
        analise: number;
        fechados: number;
        perdidos: number;
        conversao: number;
      }>;
    },
  });
}

export function useDashboardMotivosPerda(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dash:motivos", range, corretor],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("dashboard_motivos_perda", {
        _di: range.di,
        _df: range.df,
        _corretor: corretor,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ motivo: string; quantidade: number }>;
    },
  });
}

export function useDashboardLeadsUrgentes(corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dash:urgentes", corretor],
    enabled,
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("dashboard_leads_urgentes", {
        _corretor: corretor,
        _min_minutos: 30,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        lead_id: string;
        nome: string;
        telefone: string;
        corretor_id: string | null;
        corretor_nome: string;
        status: string;
        minutos_parado: number;
      }>;
    },
  });
}

export type SlaRow = {
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

/** SLA por origem (RPC leads_com_sla): usado no "Meu Dia" para listar leads com
 *  SLA estourado respeitando o tempo configurado por origem (ex.: Facebook 5min). */
export function useLeadsComSla(corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["sla:leads", corretor],
    enabled,
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("leads_com_sla", { _corretor: corretor });
      if (error) throw error;
      return (data ?? []) as SlaRow[];
    },
  });
}

const SLA_STATUS_PENDENTES = new Set(["novo", "aguardando_atendimento"]);

/**
 * SLA apenas dos leads PENDENTES de 1º atendimento (novo/aguardando) — o único
 * recorte que a fila da home e o badge do Kanban usam. A RPC estreita
 * (leads_sla_pendentes) devolve dezenas de linhas em vez de todos os leads
 * ativos da organização; foi a varredura completa que estourou statement
 * timeout (57014) em produção. Sem a migration aplicada, cai para a
 * leads_com_sla antiga filtrando no cliente — nada quebra.
 */
export function useLeadsSlaPendentes(corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["sla:pendentes", corretor],
    enabled,
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
    queryFn: async () =>
      rpcWithFallback(
        async () => {
          const { data, error } = await rpc("leads_sla_pendentes", { _corretor: corretor });
          if (error) throw error;
          return (data ?? []) as SlaRow[];
        },
        async () => {
          const { data, error } = await rpc("leads_com_sla", { _corretor: corretor });
          if (error) throw error;
          return ((data ?? []) as SlaRow[]).filter((r) => SLA_STATUS_PENDENTES.has(r.status));
        },
      ),
  });
}

export type TempoPrimeiraResposta = {
  corretor_id: string;
  leads_no_periodo: number;
  leads_respondidos: number;
  tempo_medio_min: number;
  tempo_mediana_min: number;
};

/** Tempo de 1ª resposta por corretor (KPI histórico). Degrada para [] se a
 *  função ainda não foi aplicada no banco, para não quebrar o Painel do Gestor. */
export function useTempoPrimeiraResposta(range: Range, enabled = true) {
  return useQuery({
    queryKey: ["dash:tempoResposta", range],
    enabled: enabled && !!range.di && !!range.df,
    staleTime: 60_000,
    queryFn: async (): Promise<TempoPrimeiraResposta[]> => {
      const { data, error } = await rpc("tempo_primeira_resposta", {
        _di: range.di,
        _df: range.df,
        _corretor: null,
      });
      if (error) {
        // Função ausente (migration ainda não aplicada): degrada em vez de quebrar.
        return [];
      }
      return (data ?? []) as TempoPrimeiraResposta[];
    },
  });
}

export function useDashboardRedistribuicoes(range: Range, enabled = true) {
  return useQuery({
    queryKey: ["dash:redist", range],
    enabled: enabled && !!range.di && !!range.df,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("dashboard_redistribuicoes", {
        _di: range.di,
        _df: range.df,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        quando: string;
        lead_id: string;
        lead_nome: string;
        corretor_id: string;
        corretor_nome: string;
        tipo: string;
        motivo: string;
      }>;
    },
  });
}
