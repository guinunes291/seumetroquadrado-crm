import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { dateKey } from "@/lib/periodo";
import { flattenDashboardKpis, type DashboardKpisFlat } from "@/features/dashboard/derive";

/**
 * Não existe mais "data de registro × data do evento": cada métrica tem UMA
 * data canônica, sempre a data do fato, aplicada dentro das RPCs —
 *   lead ......... criação do lead
 *   agendamento .. criação do agendamento
 *   visita ....... dia da visita agendada, por agendamento validado
 *   pasta ........ dia em que a pasta ficou montada
 *   análise ...... dia da mudança de status
 *   venda/VGV .... dia da ASSINATURA (sem assinatura não conta em período)
 */
type Range = { di: string | null; df: string | null };

// Fronteira única para RPCs fora dos types gerados — reutilizada pelo Meu
// Raio-X para não multiplicar escapes de tipo (budget em CI).
export const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase as any).rpc(name, args);

export function useDashboardKpis(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dash:kpis", range, corretor],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<DashboardKpisFlat> => {
      const { data, error } = await rpc("dashboard_kpis", {
        _di: range.di,
        _df: range.df,
        _corretor: corretor,
      });
      if (error) throw error;
      // A RPC atual retorna {pipeline, periodo, prev}; versões antigas, um
      // objeto plano. O flatten normaliza os dois para o shape da tela.
      return flattenDashboardKpis(data);
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
  /** Minutos inteiros; null = nenhum lead respondido no período (pendente). */
  tempo_medio_min: number | null;
  tempo_mediana_min: number | null;
  /** Leads com saída registrada ANTES da criação (timestamp invertido). */
  leads_dado_sujo?: number;
};

/** Tempo de 1º contato humano por corretor (KPI histórico). Degrada para [] se
 *  a função ainda não foi aplicada no banco, para não quebrar o Painel do Gestor. */
export function useTempoPrimeiraResposta(range: Range, enabled = true) {
  return useQuery({
    queryKey: ["dash:tempoResposta", range],
    enabled: enabled && !!range.di && !!range.df,
    staleTime: 60_000,
    queryFn: async (): Promise<TempoPrimeiraResposta[]> => {
      // A RPC recebe DATAS (dias no calendário de America/Sao_Paulo), não
      // instantes: converter o instante ISO do range para o DIA LOCAL evita o
      // deslocamento de janela que existia quando o texto ISO era truncado
      // para data em UTC pelo banco.
      const { data, error } = await rpc("tempo_primeira_resposta", {
        _di: dateKey(new Date(range.di as string)),
        _df: dateKey(new Date(range.df as string)),
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

export type OrigemRow = {
  origem: string;
  leads: number;
  vendas: number;
  conv_pct: number | null;
  cobertura_pct: number | null;
  atualizado_em: string | null;
};

/**
 * Origem que vende (Relatórios): leads × vendas × conversão por origem na
 * leitura de coorte (gestao_origens sobre a MV). Fallback: rel_origem_efetiva
 * (já em produção; conta por STATUS ATUAL, sem coorte — degradado=true para a
 * UI avisar a diferença de régua).
 */
export function useOrigens(range: Range, enabled = true) {
  return useQuery({
    queryKey: ["dash:origens", range.di, range.df],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ rows: OrigemRow[]; degradado: boolean }> =>
      rpcWithFallback(
        async (): Promise<{ rows: OrigemRow[]; degradado: boolean }> => {
          const { data, error } = await rpc("gestao_origens", {
            _de: range.di,
            _ate: range.df,
          });
          if (error) throw error;
          return { rows: (data ?? []) as OrigemRow[], degradado: false };
        },
        async () => {
          const { data, error } = await rpc("rel_origem_efetiva", {
            _di: range.di,
            _df: range.df,
            _corretor: null,
          });
          if (error) throw error;
          const rows = (
            (data ?? []) as Array<{
              origem: string;
              leads: number;
              fechados: number;
              conv_pct: number;
            }>
          ).map((r) => ({
            origem: r.origem,
            leads: r.leads,
            vendas: r.fechados,
            conv_pct: r.conv_pct,
            cobertura_pct: null,
            atualizado_em: null,
          }));
          return { rows, degradado: true };
        },
      ),
  });
}

/**
 * Vendas aprovadas (não distratadas) dos últimos N meses, direto da tabela —
 * RLS já limita ao escopo do papel e o volume é pequeno. Base da evolução
 * mensal de VGV e do top de empreendimentos (agregação pura no front).
 */
export function useVendasAprovadas(meses = 6, enabled = true) {
  return useQuery({
    queryKey: ["dash:vendas-aprovadas", meses],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const inicio = new Date();
      inicio.setMonth(inicio.getMonth() - (meses - 1), 1);
      inicio.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("vendas")
        .select("valor_venda, projeto_nome, data_assinatura")
        .eq("status_venda", "aprovada")
        .eq("distrato", false)
        // Janela pela data de assinatura (data do negócio), não pelo registro:
        // uma venda assinada em julho conta em julho mesmo se aprovada depois.
        // Venda sem assinatura não entra — é pendência, não resultado do mês.
        .gte("data_assinatura", inicio.toISOString().slice(0, 10));
      if (error) throw error;
      return (data ?? []) as Array<{
        valor_venda: number | string | null;
        projeto_nome: string | null;
        data_assinatura: string | null;
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
