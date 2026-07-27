// Hooks de dados do hub analítico (/inteligencia — telas Funil, Gargalos e
// Performance). Caminho principal: RPCs gestao_* (schema metrics, Fase A).
// Cada hook degrada via rpcWithFallback para RPCs que já existem em produção,
// então as abas funcionam (com menos riqueza) antes das migrations chegarem.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpcWithFallback } from "@/lib/supabase-errors";

const rpc = (name: string, args: Record<string, unknown>) => (supabase as any).rpc(name, args);

export type FunilCoorteRow = {
  mes_coorte: string;
  leads: number;
  atingiu_atendimento: number;
  atingiu_agendado: number;
  atingiu_visita: number;
  atingiu_analise: number;
  vendas: number;
  perdidos: number;
  cobertura_pct: number | null;
  atualizado_em: string | null;
};

export type FunilSnapshotRow = {
  etapa: string;
  ordem: number;
  quantidade: number;
  vgv: number | null;
  parados: number | null;
  followups_vencidos: number | null;
};

export type TempoEtapaRow = {
  etapa: string;
  ordem: number;
  horas_media: number | null;
  horas_p50: number | null;
  n: number;
  atualizado_em: string | null;
};

export type HeatmapRow = {
  corretor_id: string;
  nome: string;
  etapa: string;
  ordem: number;
  valor: number | null;
  base: number | null;
};

export type MotivoPerdaRow = {
  categoria: string;
  quantidade: number;
  vgv_estimado: number | null;
  atualizado_em: string | null;
};

export type GargaloProblema = {
  tipo: "queda_conversao" | "motivo_perda" | "etapa_lenta";
  etapa?: string;
  categoria?: string;
  taxa_atual_pct?: number;
  taxa_baseline_pct?: number;
  horas_media?: number;
  leads_afetados: number;
  impacto_reais: number | null;
  drill?: Record<string, string>;
};

export type Gargalos = {
  problemas: GargaloProblema[];
  ticket_medio: number;
  periodo: { de: string; ate: string; baseline_de: string; baseline_ate: string } | null;
  atualizado_em: string | null;
};

export type PerformanceRow = {
  corretor_id: string;
  nome: string;
  presente: boolean | null;
  limite_diario_leads: number | null;
  leads_recebidos: number;
  interacoes: number;
  contatos: number;
  agendamentos_criados: number;
  visitas_realizadas: number;
  no_shows: number;
  analises: number;
  tarefas_concluidas: number;
  vendas: number;
  vgv: number;
  primeira_resposta_p50_min: number | null;
  leads_respondidos: number;
  carga_ativa: number;
  capacidade_pct: number | null;
  atualizado_em: string | null;
};

export type PerformanceDrillRow = {
  mes: string;
  leads_recebidos: number;
  interacoes: number;
  contatos: number;
  agendamentos_criados: number;
  visitas_realizadas: number;
  no_shows: number;
  analises: number;
  tarefas_concluidas: number;
  vendas: number;
  vgv: number;
  primeira_resposta_p50_min: number | null;
  atualizado_em: string | null;
};

export type FiltrosInteligencia = { de: string | null; ate: string | null; corretor: string | null };

export function useFunilCoorte(f: FiltrosInteligencia, origem: string | null, enabled = true) {
  return useQuery({
    queryKey: ["intel:funil-coorte", f, origem],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<FunilCoorteRow[] | null> =>
      rpcWithFallback(
        async () => {
          const { data, error } = await rpc("gestao_funil_coorte", {
            _de: f.de,
            _ate: f.ate,
            _corretor: f.corretor,
            _origem: origem,
          });
          if (error) throw error;
          return (data ?? []) as FunilCoorteRow[];
        },
        // Sem a MV não há leitura de coorte honesta — a UI mostra "sem dado
        // suficiente" com o motivo, nunca uma conversão inventada.
        () => null,
      ),
  });
}

export function useFunilSnapshot(corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["intel:funil-snapshot", corretor],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<{ rows: FunilSnapshotRow[]; degradado: boolean }> =>
      rpcWithFallback(
        async (): Promise<{ rows: FunilSnapshotRow[]; degradado: boolean }> => {
          const { data, error } = await rpc("gestao_funil_snapshot", { _corretor: corretor });
          if (error) throw error;
          return { rows: (data ?? []) as FunilSnapshotRow[], degradado: false };
        },
        async () => {
          const { data, error } = await rpc("dashboard_funil", {
            _di: null,
            _df: null,
            _corretor: corretor,
            _campo_data: "criacao",
          });
          if (error) throw error;
          const rows = ((data ?? []) as Array<{ etapa: string; ordem: number; quantidade: number }>).map(
            (r) => ({ ...r, vgv: null, parados: null, followups_vencidos: null }),
          );
          return { rows, degradado: true };
        },
      ),
  });
}

export function useTempoEtapa(f: FiltrosInteligencia, enabled = true) {
  return useQuery({
    queryKey: ["intel:tempo-etapa", f],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TempoEtapaRow[]> =>
      rpcWithFallback(
        async () => {
          const { data, error } = await rpc("gestao_tempo_etapa", {
            _de: f.de,
            _ate: f.ate,
            _corretor: f.corretor,
          });
          if (error) throw error;
          return (data ?? []) as TempoEtapaRow[];
        },
        async () => {
          // RPC órfã que já existe em produção (20260616095924).
          const { data, error } = await rpc("rel_tempo_medio_por_etapa", {
            _di: f.de,
            _df: f.ate,
            _corretor: f.corretor,
          });
          if (error) throw error;
          return ((data ?? []) as Array<{ etapa: string; media_horas: number; p50_horas: number; n: number }>).map(
            (r, i) => ({
              etapa: r.etapa,
              ordem: i,
              horas_media: r.media_horas,
              horas_p50: r.p50_horas,
              n: r.n,
              atualizado_em: null,
            }),
          );
        },
      ),
  });
}

export function useHeatmap(
  metrica: string,
  f: FiltrosInteligencia,
  enabled = true,
) {
  return useQuery({
    queryKey: ["intel:heatmap", metrica, f.de, f.ate],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HeatmapRow[] | null> =>
      rpcWithFallback(
        async () => {
          const { data, error } = await rpc("gestao_heatmap_corretor_etapa", {
            _metrica: metrica,
            _de: f.de,
            _ate: f.ate,
          });
          if (error) throw error;
          return (data ?? []) as HeatmapRow[];
        },
        () => null,
      ),
  });
}

export function useGargalos(f: FiltrosInteligencia, enabled = true) {
  return useQuery({
    queryKey: ["intel:gargalos", f.de, f.ate],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Gargalos | null> =>
      rpcWithFallback(
        async () => {
          const { data, error } = await rpc("gestao_gargalos", { _de: f.de, _ate: f.ate });
          if (error) throw error;
          if (!data || typeof data !== "object") return null;
          const d = data as Record<string, unknown>;
          return {
            problemas: Array.isArray(d.problemas) ? (d.problemas as GargaloProblema[]) : [],
            ticket_medio: Number(d.ticket_medio) || 0,
            periodo: (d.periodo ?? null) as Gargalos["periodo"],
            atualizado_em: typeof d.atualizado_em === "string" ? d.atualizado_em : null,
          };
        },
        () => null,
      ),
  });
}

export function useMotivosPerdaGestao(f: FiltrosInteligencia, enabled = true) {
  return useQuery({
    queryKey: ["intel:motivos-perda", f],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ rows: MotivoPerdaRow[]; degradado: boolean }> =>
      rpcWithFallback(
        async (): Promise<{ rows: MotivoPerdaRow[]; degradado: boolean }> => {
          const { data, error } = await rpc("gestao_motivos_perda", {
            _de: f.de,
            _ate: f.ate,
            _corretor: f.corretor,
          });
          if (error) throw error;
          return { rows: (data ?? []) as MotivoPerdaRow[], degradado: false };
        },
        async () => {
          const { data, error } = await rpc("dashboard_motivos_perda", {
            _di: f.de,
            _df: f.ate,
            _corretor: f.corretor,
            _campo_data: "criacao",
          });
          if (error) throw error;
          const rows = ((data ?? []) as Array<{ motivo: string; quantidade: number }>).map((r) => ({
            categoria: r.motivo,
            quantidade: r.quantidade,
            vgv_estimado: null,
            atualizado_em: null,
          }));
          return { rows, degradado: true };
        },
      ),
  });
}

export function usePerformanceCorretores(mes: string | null, enabled = true) {
  return useQuery({
    queryKey: ["intel:performance", mes],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<{ rows: PerformanceRow[]; degradado: boolean }> =>
      rpcWithFallback(
        async (): Promise<{ rows: PerformanceRow[]; degradado: boolean }> => {
          const { data, error } = await rpc("gestao_performance_corretores", { _mes: mes });
          if (error) throw error;
          return { rows: (data ?? []) as PerformanceRow[], degradado: false };
        },
        async () => {
          // Fallback: métricas por corretor que o dashboard já usa hoje.
          const { data, error } = await rpc("dashboard_metricas_por_corretor", {
            _di: mes,
            _df: null,
            _campo_data: "criacao",
          });
          if (error) throw error;
          const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
            corretor_id: String(r.corretor_id),
            nome: String(r.nome ?? "—"),
            presente: null,
            limite_diario_leads: null,
            leads_recebidos: Number(r.leads) || 0,
            interacoes: 0,
            contatos: 0,
            agendamentos_criados: Number(r.agendamentos) || 0,
            visitas_realizadas: Number(r.visitas) || 0,
            no_shows: 0,
            analises: Number(r.analise) || 0,
            tarefas_concluidas: 0,
            vendas: Number(r.fechados) || 0,
            vgv: 0,
            primeira_resposta_p50_min: null,
            leads_respondidos: 0,
            carga_ativa: 0,
            capacidade_pct: null,
            atualizado_em: null,
          }));
          return { rows, degradado: true };
        },
      ),
  });
}

/**
 * Performance por corretor agregada na janela [de, ate] (meses-calendário —
 * grão da MV). Mesmo shape da versão mensal para reaproveitar compararComTime.
 * Sem a RPC de janela em produção, degrada para o mês corrente com aviso.
 */
export function usePerformanceJanela(f: FiltrosInteligencia, enabled = true) {
  return useQuery({
    queryKey: ["intel:performance-janela", f.de, f.ate],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<{ rows: PerformanceRow[]; degradado: boolean }> =>
      rpcWithFallback(
        async (): Promise<{ rows: PerformanceRow[]; degradado: boolean }> => {
          const { data, error } = await rpc("gestao_performance_corretores_janela", {
            _de: f.de,
            _ate: f.ate,
          });
          if (error) throw error;
          return { rows: (data ?? []) as PerformanceRow[], degradado: false };
        },
        async () => {
          const { data, error } = await rpc("gestao_performance_corretores", { _mes: null });
          if (error) throw error;
          return { rows: (data ?? []) as PerformanceRow[], degradado: true };
        },
      ),
  });
}

export function usePerformanceDrill(corretorId: string | null, meses = 6) {
  return useQuery({
    queryKey: ["intel:performance-drill", corretorId, meses],
    enabled: !!corretorId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PerformanceDrillRow[] | null> =>
      rpcWithFallback(
        async () => {
          const { data, error } = await rpc("gestao_performance_corretor_drill", {
            _corretor: corretorId,
            _meses: meses,
          });
          if (error) throw error;
          return (data ?? []) as PerformanceDrillRow[];
        },
        () => null,
      ),
  });
}

/** Limiar de cobertura para "sem dado suficiente" (gestao_config; default 60). */
export function useCoberturaMinima() {
  return useQuery({
    queryKey: ["gestao:config", "cobertura_transicoes_minima_pct"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("gestao_config" as never)
        .select("valor")
        .eq("chave", "cobertura_transicoes_minima_pct")
        .maybeSingle();
      if (error) return 60;
      const v = Number((data as { valor?: unknown } | null)?.valor);
      return Number.isFinite(v) && v > 0 ? v : 60;
    },
  });
}
