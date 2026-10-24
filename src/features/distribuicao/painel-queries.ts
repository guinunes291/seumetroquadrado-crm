// Distribuição v3 — consultas do PAINEL da central: resumo, elegibilidade por
// roleta, minha elegibilidade, vendas do mês anterior, exceções, histórico de
// decisões (com contexto) e recebidos na semana.
// Recortado de queries.ts (que reexporta tudo) sem mudança de conteúdo.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

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

/** Limite de linhas baixadas para a agregação client-side dos recebidos na semana. */
export const LIMITE_RECEBIDOS_SEMANA = 2000;

/** Mapa corretor → recebidos; `truncado` acende quando a semana estourou o
 *  limite de linhas e as contagens podem estar subestimadas. */
export type RecebidosSemana = Map<string, number> & { truncado: boolean };

/** Recebidos na semana (7 dias) por corretor em uma roleta — para a aba Landing. */
export function useRecebidosSemana(slug: string, enabled = true) {
  return useQuery({
    queryKey: ["distribuicao:recebidos-semana", slug],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<RecebidosSemana> => {
      const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("distribution_log")
        .select("corretor_id")
        .eq("roleta_slug", slug)
        .eq("resultado", "sucesso")
        .gte("created_at", desde)
        .limit(LIMITE_RECEBIDOS_SEMANA);
      if (error) throw error;
      const rows = data ?? [];
      const m = new Map<string, number>();
      for (const row of rows) {
        if (row.corretor_id) m.set(row.corretor_id, (m.get(row.corretor_id) ?? 0) + 1);
      }
      // Flag vai junto do Map (compatível: consumidores seguem usando .get()).
      return Object.assign(m, { truncado: rows.length >= LIMITE_RECEBIDOS_SEMANA });
    },
  });
}
