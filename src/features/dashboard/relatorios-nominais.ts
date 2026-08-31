// Camada NOMINAL da aba Relatórios: listas com nome do cliente e corretor
// responsável, para o gestor não precisar abrir a base de leads para saber
// de quem o número fala. Todas as consultas respeitam RLS (corretor só vê o
// próprio escopo) e vêm com teto de linhas + total real (count exact) para
// não estourar o payload em meses de importação grande.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { dateKey } from "@/lib/periodo";
import { listComissoes, type ComissaoRow } from "@/lib/comissoes";

type LeadStatusEnum = Database["public"]["Enums"]["lead_status"];

type Range = { di: string | null; df: string | null };

/** Teto por consulta nominal: cobre qualquer mês normal (~1k leads) sem
 *  arriscar payloads de importações de +10k — a UI mostra o total real. */
const TETO_LINHAS = 1000;

export type ComTotal<T> = { rows: T[]; total: number };

export type LeadRef = { id: string; nome: string; telefone: string | null } | null;

// ---------------------------------------------------------------------------
// Corretores (id → nome) — para resolver o responsável em qualquer lista.
// ---------------------------------------------------------------------------

export function useCorretorNomes(enabled = true) {
  return useQuery({
    queryKey: ["rel:corretor-nomes"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.from("profiles").select("id, nome");
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.id, p.nome]));
    },
  });
}

/** Corretores ativos (para a sub-aba Corretores). */
export function useCorretoresAtivos(enabled = true) {
  return useQuery({
    queryKey: ["rel:corretores-ativos"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email, foto_url, avatar_url, cargo")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Vendas do período (nominal) e distratos
// ---------------------------------------------------------------------------

export type VendaNominal = {
  id: string;
  lead_id: string | null;
  corretor_id: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  unidade: string | null;
  valor_venda: number;
  data_assinatura: string;
  status_recebimento: string;
  data_distrato: string | null;
  motivo_distrato: string | null;
  lead: LeadRef;
};

// Literal único de propósito: concatenação vira `string` e o parser de
// types do supabase-js perde a inferência do embed (GenericStringError).
const VENDA_SELECT =
  "id, lead_id, corretor_id, projeto_id, projeto_nome, unidade, valor_venda, data_assinatura, status_recebimento, data_distrato, motivo_distrato, lead:leads(id, nome, telefone)";

/** Vendas APROVADAS e não distratadas, pela data de ASSINATURA (data do
 *  negócio — mesma régua do VGV do hero). */
export function useVendasNominais(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["rel:vendas-nominais", range, corretor],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ComTotal<VendaNominal>> => {
      let q = supabase
        .from("vendas")
        .select(VENDA_SELECT, { count: "exact" })
        .eq("status_venda", "aprovada")
        .eq("distrato", false)
        .order("data_assinatura", { ascending: false })
        .order("id")
        .limit(TETO_LINHAS);
      if (range.di) q = q.gte("data_assinatura", dateKey(new Date(range.di)));
      if (range.df) q = q.lte("data_assinatura", dateKey(new Date(range.df)));
      if (corretor) q = q.eq("corretor_id", corretor);
      const { data, error, count } = await q;
      if (error) throw error;
      const rows: VendaNominal[] = data ?? [];
      return { rows, total: count ?? rows.length };
    },
  });
}

/** Distratos pela data do DISTRATO (o mês em que o negócio caiu). */
export function useDistratosNominais(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["rel:distratos-nominais", range, corretor],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ComTotal<VendaNominal>> => {
      let q = supabase
        .from("vendas")
        .select(VENDA_SELECT, { count: "exact" })
        .eq("distrato", true)
        .order("data_distrato", { ascending: false })
        .order("id")
        .limit(TETO_LINHAS);
      if (range.di) q = q.gte("data_distrato", dateKey(new Date(range.di)));
      if (range.df) q = q.lte("data_distrato", dateKey(new Date(range.df)));
      if (corretor) q = q.eq("corretor_id", corretor);
      const { data, error, count } = await q;
      if (error) throw error;
      const rows: VendaNominal[] = data ?? [];
      return { rows, total: count ?? rows.length };
    },
  });
}

// ---------------------------------------------------------------------------
// Análises de crédito (nominal, todas as situações)
// ---------------------------------------------------------------------------

export type AnaliseNominal = {
  id: string;
  lead_id: string | null;
  corretor_id: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  lead: LeadRef;
};

/** Análises movimentadas no período (pela data da última mudança de status —
 *  mesma régua do KPI "Análises de crédito"). */
export function useAnalisesNominais(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["rel:analises-nominais", range, corretor],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ComTotal<AnaliseNominal>> => {
      let q = supabase
        .from("analises_credito")
        .select(
          "id, lead_id, corretor_id, status, observacoes, created_at, updated_at, lead:leads(id, nome, telefone)",
          { count: "exact" },
        )
        .order("updated_at", { ascending: false })
        .order("id")
        .limit(TETO_LINHAS);
      if (range.di) q = q.gte("updated_at", range.di);
      if (range.df) q = q.lte("updated_at", range.df);
      if (corretor) q = q.eq("corretor_id", corretor);
      const { data, error, count } = await q;
      if (error) throw error;
      const rows: AnaliseNominal[] = data ?? [];
      return { rows, total: count ?? rows.length };
    },
  });
}

// ---------------------------------------------------------------------------
// Agendamentos e visitas (nominal)
// ---------------------------------------------------------------------------

export type AgendamentoNominal = {
  id: string;
  lead_id: string | null;
  corretor_id: string;
  tipo: string;
  status: string;
  data_inicio: string;
  created_at: string;
  realizado_em: string | null;
  lead: LeadRef;
};

const AGENDAMENTO_SELECT =
  "id, lead_id, corretor_id, tipo, status, data_inicio, created_at, realizado_em, lead:leads(id, nome, telefone)";

/** Agendamentos CRIADOS no período (mesma régua do KPI "Agendamentos"). */
export function useAgendamentosNominais(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["rel:agendamentos-nominais", range, corretor],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ComTotal<AgendamentoNominal>> => {
      let q = supabase
        .from("agendamentos")
        .select(AGENDAMENTO_SELECT, { count: "exact" })
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(TETO_LINHAS);
      if (range.di) q = q.gte("created_at", range.di);
      if (range.df) q = q.lte("created_at", range.df);
      if (corretor) q = q.eq("corretor_id", corretor);
      const { data, error, count } = await q;
      if (error) throw error;
      const rows: AgendamentoNominal[] = data ?? [];
      return { rows, total: count ?? rows.length };
    },
  });
}

/** Visitas com dia marcado DENTRO do período (pela data da visita, mesma
 *  régua do KPI "Visitas realizadas") — com o status de cada uma. */
export function useVisitasNominais(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["rel:visitas-nominais", range, corretor],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ComTotal<AgendamentoNominal>> => {
      let q = supabase
        .from("agendamentos")
        .select(AGENDAMENTO_SELECT, { count: "exact" })
        .eq("tipo", "visita")
        .is("deleted_at", null)
        .order("data_inicio", { ascending: false })
        .order("id")
        .limit(TETO_LINHAS);
      if (range.di) q = q.gte("data_inicio", range.di);
      if (range.df) q = q.lte("data_inicio", range.df);
      if (corretor) q = q.eq("corretor_id", corretor);
      const { data, error, count } = await q;
      if (error) throw error;
      const rows: AgendamentoNominal[] = data ?? [];
      return { rows, total: count ?? rows.length };
    },
  });
}

// ---------------------------------------------------------------------------
// Perdidos do período (nominal, com motivo)
// ---------------------------------------------------------------------------

export type PerdidoNominal = {
  id: string;
  nome: string;
  telefone: string | null;
  corretor_id: string | null;
  motivo_perda_categoria: string | null;
  motivo_perdido: string | null;
  data_perda: string | null;
  projeto_nome: string | null;
};

export function usePerdidosNominais(range: Range, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["rel:perdidos-nominais", range, corretor],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ComTotal<PerdidoNominal>> => {
      let q = supabase
        .from("leads")
        .select(
          "id, nome, telefone, corretor_id, motivo_perda_categoria, motivo_perdido, data_perda, projeto_nome",
          { count: "exact" },
        )
        .eq("status", "perdido")
        .eq("na_lixeira", false)
        .is("deleted_at", null)
        .order("data_perda", { ascending: false, nullsFirst: false })
        .order("id")
        .limit(TETO_LINHAS);
      if (range.di) q = q.gte("data_perda", range.di);
      if (range.df) q = q.lte("data_perda", range.df);
      if (corretor) q = q.eq("corretor_id", corretor);
      const { data, error, count } = await q;
      if (error) throw error;
      const rows: PerdidoNominal[] = data ?? [];
      return { rows, total: count ?? rows.length };
    },
  });
}

// ---------------------------------------------------------------------------
// Pipeline agora — desdobramento nominal de uma etapa (expansão inline)
// ---------------------------------------------------------------------------

export type LeadEtapaNominal = {
  id: string;
  nome: string;
  telefone: string | null;
  corretor_id: string | null;
  status: string;
  ultima_atividade_em: string;
};

/** Status considerados "carteira ativa" (fora de venda/perda/legados). */
export const STATUS_ATIVOS = [
  "aguardando_atendimento",
  "aguardando_retorno",
  "qualificacao_corretor",
  "em_atendimento",
  "agendado",
  "visita_realizada",
  "analise_credito",
] as const;

/**
 * Quem está numa etapa AGORA (foto de hoje). `status === "sem_corretor"` é o
 * card especial: leads ativos sem responsável. Limite de 50 — o card mostra o
 * total e o link "abrir na base" cobre o resto.
 */
export function usePipelineEtapaNominal(
  status: string | null,
  corretor: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ["rel:pipeline-etapa", status, corretor],
    enabled: enabled && !!status,
    staleTime: 60_000,
    queryFn: async (): Promise<ComTotal<LeadEtapaNominal>> => {
      let q = supabase
        .from("leads")
        .select("id, nome, telefone, corretor_id, status, ultima_atividade_em", {
          count: "exact",
        })
        .eq("na_lixeira", false)
        .is("deleted_at", null)
        .order("ultima_atividade_em", { ascending: true })
        .order("id")
        .limit(50);
      if (status === "sem_corretor") {
        q = q.is("corretor_id", null).in("status", [...STATUS_ATIVOS]);
      } else {
        q = q.eq("status", (status ?? "novo") as LeadStatusEnum);
        if (corretor) q = q.eq("corretor_id", corretor);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      const rows: LeadEtapaNominal[] = data ?? [];
      return { rows, total: count ?? rows.length };
    },
  });
}

// ---------------------------------------------------------------------------
// Leads esquecidos (sem atividade há N dias, carteira ativa)
// ---------------------------------------------------------------------------

export function useLeadsEsquecidos(dias: number, corretor: string | null, enabled = true) {
  return useQuery({
    queryKey: ["rel:leads-esquecidos", dias, corretor],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ComTotal<LeadEtapaNominal>> => {
      const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
      let q = supabase
        .from("leads")
        .select("id, nome, telefone, corretor_id, status, ultima_atividade_em", {
          count: "exact",
        })
        .in("status", [...STATUS_ATIVOS])
        .eq("na_lixeira", false)
        .is("deleted_at", null)
        .not("corretor_id", "is", null)
        .lt("ultima_atividade_em", corte)
        .order("ultima_atividade_em", { ascending: true })
        .order("id")
        .limit(TETO_LINHAS);
      if (corretor) q = q.eq("corretor_id", corretor);
      const { data, error, count } = await q;
      if (error) throw error;
      const rows: LeadEtapaNominal[] = data ?? [];
      return { rows, total: count ?? rows.length };
    },
  });
}

// ---------------------------------------------------------------------------
// Leads por empreendimento (conversão por produto)
// ---------------------------------------------------------------------------

export type LeadsProjetoRow = { projeto_id: string | null; nome: string; leads: number };

/**
 * Contagem de leads criados no período por empreendimento — via HEAD count
 * por projeto (payload zero), porque o PostgREST não agrega. Projetos sem
 * lead no período saem com 0 e são filtrados na composição com as vendas.
 */
export function useLeadsPorProjeto(range: Range, enabled = true) {
  return useQuery({
    queryKey: ["rel:leads-por-projeto", range],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LeadsProjetoRow[]> => {
      const { data: projetos, error } = await supabase
        .from("projetos")
        .select("id, nome")
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      const contar = async (projetoId: string | null): Promise<number> => {
        let q = supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("na_lixeira", false)
          .is("deleted_at", null);
        q = projetoId === null ? q.is("projeto_id", null) : q.eq("projeto_id", projetoId);
        if (range.di) q = q.gte("created_at", range.di);
        if (range.df) q = q.lte("created_at", range.df);
        const { count, error: err } = await q;
        if (err) throw err;
        return count ?? 0;
      };
      const linhas: LeadsProjetoRow[] = await Promise.all(
        (projetos ?? []).map(async (p) => ({
          projeto_id: p.id as string,
          nome: p.nome as string,
          leads: await contar(p.id as string),
        })),
      );
      const semProjeto = await contar(null);
      if (semProjeto > 0) linhas.push({ projeto_id: null, nome: "Sem projeto", leads: semProjeto });
      return linhas;
    },
  });
}

// ---------------------------------------------------------------------------
// Comissões do período (ledger oficial, por beneficiário)
// ---------------------------------------------------------------------------

/** Comissões cujas vendas foram assinadas dentro do período. */
export function useComissoesPeriodo(range: Range, enabled = true) {
  return useQuery({
    queryKey: ["rel:comissoes-periodo", range],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ComissaoRow[]> => {
      if (!range.di || !range.df) return listComissoes({});
      // listComissoes filtra por [ini, fim) sobre a data de assinatura — o
      // fim precisa ser o dia SEGUINTE ao último dia do período.
      const fim = new Date(range.df);
      fim.setDate(fim.getDate() + 1);
      return listComissoes({ mes: { ini: dateKey(new Date(range.di)), fim: dateKey(fim) } });
    },
  });
}
