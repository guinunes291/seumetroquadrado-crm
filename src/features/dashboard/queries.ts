import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Range = { di: string | null; df: string | null };

// Cast `as never` (idioma do projeto p/ RPCs fora do types.ts gerado): as
// funções novas do dashboard ainda não constam nos tipos gerados.
const rpc = (name: string, args: Record<string, unknown>) =>
  supabase.rpc(name as never, args as never);

// ---------------------------------------------------------------------------
// KPIs v2 — {pipeline, periodo, prev}. Degrada para o shape antigo (flat)
// enquanto a migration dashboard_analytics_v2 não for aplicada no banco.
// ---------------------------------------------------------------------------

export type KpisAtividade = {
  leads_novos: number;
  agendamentos: number;
  visitas: number;
  perdidos: number;
  vendas: number;
  vgv: number;
};

export type KpisPipeline = {
  novo: number;
  aguardando_atendimento: number;
  aguardando_retorno: number;
  em_atendimento: number;
  agendado: number;
  visita_realizada: number;
  analise_credito: number;
  em_aberto: number;
  sem_corretor: number;
};

export type KpisV2 = {
  /** false = banco ainda com as funções antigas (aplicar a migration). */
  v2: boolean;
  pipeline: KpisPipeline | null;
  periodo: KpisAtividade | null;
  prev: KpisAtividade | null;
  /** Shape antigo (flat), para degradação enquanto o SQL não é aplicado. */
  legado: Record<string, number> | null;
};

export function useDashboardKpis(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dash:kpis", range, corretor],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<KpisV2> => {
      const { data, error } = await rpc("dashboard_kpis", {
        _di: range.di,
        _df: range.df,
        _corretor: corretor,
      });
      if (error) throw error;
      const d = (data ?? {}) as Record<string, unknown>;
      if (d.pipeline) {
        return {
          v2: true,
          pipeline: d.pipeline as KpisPipeline,
          periodo: (d.periodo ?? null) as KpisAtividade | null,
          prev: (d.prev ?? null) as KpisAtividade | null,
          legado: null,
        };
      }
      return {
        v2: false,
        pipeline: null,
        periodo: null,
        prev: null,
        legado: d as Record<string, number>,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Série diária (fuso America/Sao_Paulo no SQL v2). Range nulo é suportado:
// o banco devolve os últimos 90 dias.
// ---------------------------------------------------------------------------

export type SerieDia = {
  dia: string;
  leads: number;
  agendamentos: number;
  visitas: number;
  vendas: number;
};

export function useDashboardSerie(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dash:serie", range, corretor],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<SerieDia[]> => {
      const { data, error } = await rpc("dashboard_serie_diaria", {
        _di: range.di,
        _df: range.df,
        _corretor: corretor,
      });
      if (error) throw error;
      return (data ?? []) as SerieDia[];
    },
  });
}

export function useDashboardFunil(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dash:funil", range, corretor],
    enabled,
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
    enabled,
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

// No SQL v2 o `motivo` vem como a categoria padronizada (motivo_perda_categoria);
// o texto livre legado passa como veio. O rótulo é resolvido na view.
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

export type LeadUrgente = {
  lead_id: string;
  nome: string;
  telefone: string;
  corretor_id: string | null;
  corretor_nome: string;
  status: string;
  minutos_parado: number;
  /** Campos novos do SQL v2 (ausentes enquanto a migration não é aplicada). */
  distribuido?: boolean;
  total_count?: number;
};

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
      return (data ?? []) as LeadUrgente[];
    },
  });
}

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
      return (data ?? []) as Array<{
        lead_id: string;
        nome: string;
        telefone: string | null;
        status: string;
        sla_minutos: number;
        minutos_decorridos: number;
        sla_status: string;
        temperatura_calc: string;
      }>;
    },
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
 *  função ainda não foi aplicada no banco, para não quebrar a tela. */
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

// ---------------------------------------------------------------------------
// NOVAS RPCs (dashboard_analytics_v2). Todas degradam para `null` enquanto a
// migration não for aplicada — a view mostra o aviso "aplicar atualização SQL".
// ---------------------------------------------------------------------------

export type ReceitaBloco = {
  vendas: number;
  vgv: number;
  ticket_medio: number;
  comissao_prevista: number;
  comissao_recebida: number;
};

export type ReceitaMeta = {
  mes: number;
  ano: number;
  meta_gmv: number;
  meta_vendas: number;
  meta_visitas: number;
  meta_leads: number;
  realizado_gmv: number;
  realizado_vendas: number;
  realizado_visitas: number;
  realizado_leads: number;
};

export type ReceitaV2 = {
  periodo: ReceitaBloco;
  prev: ReceitaBloco | null;
  meta: ReceitaMeta | null;
};

export function useDashboardReceita(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dash:receita", range, corretor],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ReceitaV2 | null> => {
      const { data, error } = await rpc("dashboard_receita", {
        _di: range.di,
        _df: range.df,
        _corretor: corretor,
      });
      if (error) return null; // função ainda não aplicada no banco
      return (data ?? null) as ReceitaV2 | null;
    },
  });
}

export type OrigemRow = {
  nivel: "origem" | "campanha";
  chave: string;
  leads: number;
  vendas: number;
  conv_pct: number;
};

export function useDashboardOrigem(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dash:origem", range, corretor],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OrigemRow[] | null> => {
      const { data, error } = await rpc("dashboard_origem", {
        _di: range.di,
        _df: range.df,
        _corretor: corretor,
      });
      if (error) return null; // função ainda não aplicada no banco
      return (data ?? []) as OrigemRow[];
    },
  });
}

export type TempoEtapaRow = {
  etapa: string;
  media_horas: number;
  p50_horas: number;
  n: number;
};

/** Tempo médio em cada etapa do funil (RPC rel_tempo_medio_por_etapa — antes
 *  órfã no banco, agora ligada à UI). */
export function useTempoMedioPorEtapa(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dash:tempoEtapa", range, corretor],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TempoEtapaRow[] | null> => {
      const { data, error } = await rpc("rel_tempo_medio_por_etapa", {
        _di: range.di,
        _df: range.df,
        _corretor: corretor,
      });
      if (error) return null; // função ainda não aplicada no banco
      return (data ?? []) as TempoEtapaRow[];
    },
  });
}
