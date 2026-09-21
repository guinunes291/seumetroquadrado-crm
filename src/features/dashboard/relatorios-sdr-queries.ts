// Consultas do relatório semanal do SDR (folha de sábado). Uma semana de
// operação cabe folgado num payload — por isso tudo aqui é leitura direta via
// PostgREST (RLS de admin), sem RPC nova: o relatório já funciona no ambiente
// em que o CRM roda hoje, sem depender de migration.
//
// A régua de data de cada métrica é a MESMA do resto do CRM
// (`dashboard_atividade_periodo`, migration 20260731122000):
//   agendamento .......... data de CRIAÇÃO do compromisso
//   visita ............... DIA da visita (com o desfecho validado)
//   pasta/análise ........ data da MUDANÇA de status para analise_credito
//   venda ................ data da ASSINATURA
// Assim o número da folha bate com o número que o gestor vê no Dashboard.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dateKey } from "@/lib/periodo";

type Range = { di: string; df: string };

/** Uma semana inteira de operação não chega perto disto; o teto é rede de segurança. */
const TETO_LINHAS = 2000;

export type LeadRefSdr = {
  id: string;
  nome: string;
  telefone: string | null;
  sdr_id: string | null;
} | null;

// ---------------------------------------------------------------------------
// Quem é SDR
// ---------------------------------------------------------------------------

export type SdrPerfil = { id: string; nome: string };

/**
 * SDRs do time (papel `sdr` em user_roles). Só admin enxerga os papéis dos
 * outros — a aba inteira é de admin, pela mesma razão pela qual o hub do SDR
 * é (política do SDR v1, item 1).
 */
export function useSdrsDoTime(enabled = true) {
  return useQuery({
    queryKey: ["rel-sdr:time"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SdrPerfil[]> => {
      const { data: papeis, error: e1 } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "sdr");
      if (e1) throw e1;
      const ids = Array.from(new Set((papeis ?? []).map((p) => p.user_id)));
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((p) => ({ id: p.id, nome: p.nome }));
    },
  });
}

// ---------------------------------------------------------------------------
// Agendamentos e visitas
// ---------------------------------------------------------------------------

export type AgendamentoSdrRow = {
  id: string;
  lead_id: string | null;
  corretor_id: string;
  criado_por_id: string | null;
  status: string;
  data_inicio: string;
  created_at: string;
  lead: LeadRefSdr;
};

// Literal único: concatenar quebra a inferência do embed no supabase-js.
const AGENDAMENTO_SDR_SELECT =
  "id, lead_id, corretor_id, criado_por_id, status, data_inicio, created_at, lead:leads(id, nome, telefone, sdr_id)";

/**
 * Visitas MARCADAS na semana (data de criação do compromisso). `auto_gerado`
 * fica de fora — compromisso que o motor cria sozinho não é produção de
 * ninguém, mesma exclusão que o Raio-X do SDR faz.
 */
export function useAgendamentosSemanaSdr(range: Range, enabled = true) {
  return useQuery({
    queryKey: ["rel-sdr:agendamentos", range],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<AgendamentoSdrRow[]> => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select(AGENDAMENTO_SDR_SELECT)
        .eq("tipo", "visita")
        .eq("auto_gerado", false)
        .is("deleted_at", null)
        .gte("created_at", range.di)
        .lte("created_at", range.df)
        .order("created_at", { ascending: false })
        .limit(TETO_LINHAS);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Visitas cujo DIA caiu dentro da semana — realizadas, no-show e as que ainda
 *  não tiveram desfecho validado (essas não entram na folha). */
export function useVisitasSemanaSdr(range: Range, enabled = true) {
  return useQuery({
    queryKey: ["rel-sdr:visitas", range],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<AgendamentoSdrRow[]> => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select(AGENDAMENTO_SDR_SELECT)
        .eq("tipo", "visita")
        .eq("auto_gerado", false)
        .is("deleted_at", null)
        .gte("data_inicio", range.di)
        .lte("data_inicio", range.df)
        .order("data_inicio", { ascending: true })
        .limit(TETO_LINHAS);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Pastas (entrada em análise de crédito)
// ---------------------------------------------------------------------------

export type PastaSdrRow = {
  id: string;
  lead_id: string;
  corretor_id: string | null;
  alterado_por: string | null;
  created_at: string;
  lead: LeadRefSdr;
};

/**
 * Pastas que ENTRARAM em análise de crédito na semana — a régua é a mudança
 * de status, não a tabela `analises_credito`: é a transição que marca "pasta
 * enviada", acontece por qualquer caminho (3 documentos carimbam a pasta e
 * movem o lead sozinhos) e é a mesma régua do KPI de análises do Dashboard.
 * O lead conta UMA vez por semana mesmo se entrar, sair e voltar.
 */
export function usePastasSemanaSdr(range: Range, enabled = true) {
  return useQuery({
    queryKey: ["rel-sdr:pastas", range],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<PastaSdrRow[]> => {
      const { data, error } = await supabase
        .from("lead_status_transitions")
        .select(
          "id, lead_id, corretor_id, alterado_por, created_at, lead:leads(id, nome, telefone, sdr_id)",
        )
        .eq("para_status", "analise_credito")
        .gte("created_at", range.di)
        .lte("created_at", range.df)
        .order("created_at", { ascending: false })
        .limit(TETO_LINHAS);
      if (error) throw error;
      const vistos = new Set<string>();
      const linhas: PastaSdrRow[] = [];
      for (const t of data ?? []) {
        if (vistos.has(t.lead_id)) continue;
        vistos.add(t.lead_id);
        linhas.push(t);
      }
      return linhas;
    },
  });
}

// ---------------------------------------------------------------------------
// Vendas
// ---------------------------------------------------------------------------

export type VendaSdrRow = {
  id: string;
  lead_id: string | null;
  corretor_id: string | null;
  projeto_nome: string | null;
  unidade: string | null;
  valor_venda: number;
  data_assinatura: string;
  data_recebimento: string | null;
  status_recebimento: string;
  lead: LeadRefSdr;
};

const VENDA_SDR_SELECT =
  "id, lead_id, corretor_id, projeto_nome, unidade, valor_venda, data_assinatura, data_recebimento, status_recebimento, lead:leads(id, nome, telefone, sdr_id)";

/** Vendas aprovadas, sem distrato, ASSINADAS dentro da semana. */
export function useVendasSemanaSdr(range: Range, enabled = true) {
  return useQuery({
    queryKey: ["rel-sdr:vendas", range],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<VendaSdrRow[]> => {
      const { data, error } = await supabase
        .from("vendas")
        .select(VENDA_SDR_SELECT)
        .eq("status_venda", "aprovada")
        .eq("distrato", false)
        .gte("data_assinatura", dateKey(new Date(range.di)))
        .lte("data_assinatura", dateKey(new Date(range.df)))
        .order("data_assinatura", { ascending: false })
        .limit(TETO_LINHAS);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Vendas cujo valor a imobiliária RECEBEU dentro da semana — de qualquer mês
 * de assinatura. É o gatilho do pagamento da venda ao SDR ("venda só é paga no
 * recebimento"), e quase nunca é a venda assinada na mesma semana.
 */
export function useVendasRecebidasSemanaSdr(range: Range, enabled = true) {
  return useQuery({
    queryKey: ["rel-sdr:vendas-recebidas", range],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<VendaSdrRow[]> => {
      const { data, error } = await supabase
        .from("vendas")
        .select(VENDA_SDR_SELECT)
        .eq("status_venda", "aprovada")
        .eq("distrato", false)
        .not("data_recebimento", "is", null)
        .gte("data_recebimento", dateKey(new Date(range.di)))
        .lte("data_recebimento", dateKey(new Date(range.df)))
        .order("data_recebimento", { ascending: false })
        .limit(TETO_LINHAS);
      if (error) throw error;
      return data ?? [];
    },
  });
}
