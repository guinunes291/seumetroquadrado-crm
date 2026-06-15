import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Range = { di: string | null; df: string | null };

const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase as any).rpc(name, args);

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
