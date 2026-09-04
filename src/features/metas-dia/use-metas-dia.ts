// Dados das metas do dia (popup + card). Regra de ouro: o realizado NÃO é um
// contador do cliente — vem sempre das tabelas de origem, com as mesmas regras
// da lógica pura (metas-dia.ts), para que o card, o widget e o gestor batam.

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  contarAgendamentos,
  contarVendasSemana,
  fimSemana,
  inicioSemana,
  limitesDoDia,
  normalizarTaxasRpc,
  type MetaDia,
  type RealizadoDia,
  type TaxasRpc,
} from "@/features/metas-dia/metas-dia";

export const METAS_DIA_KEY = "metas-dia";

const COLUNAS =
  "dia, semana_inicio, meta_agendamentos, meta_documentacoes, meta_vendas_semana, respondido_em";

/** Resposta de HOJE do corretor (null = ainda não respondeu → popup). */
export function useMetaDeHoje(dia: string) {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: [METAS_DIA_KEY, "hoje", uid, dia],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MetaDia | null> => {
      const { data, error } = await supabase
        .from("metas_dia_corretor")
        .select(COLUNAS)
        .eq("corretor_id", uid!)
        .eq("dia", dia)
        .maybeSingle();
      if (error) throw error;
      return (data as MetaDia | null) ?? null;
    },
  });
}

/** Última resposta ANTES de hoje — pré-preenche o popup e alimenta o balanço. */
export function useUltimaMeta(dia: string) {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: [METAS_DIA_KEY, "ultima", uid, dia],
    enabled: !!uid,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<MetaDia | null> => {
      const { data, error } = await supabase
        .from("metas_dia_corretor")
        .select(COLUNAS)
        .eq("corretor_id", uid!)
        .lt("dia", dia)
        .order("dia", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as MetaDia | null) ?? null;
    },
  });
}

/** Sugestão do gestor (metas_diarias) — fallback do pré-preenchimento. */
export function useMetaGestor() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: [METAS_DIA_KEY, "gestor", uid],
    enabled: !!uid,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metas_diarias")
        .select("meta_agendamentos, meta_vendas")
        .eq("corretor_id", uid!)
        .eq("ativo", true)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/** Realizado de um dia (e da semana daquele dia), direto das tabelas de origem. */
async function buscarRealizado(uid: string, dia: string): Promise<RealizadoDia> {
  const { ini, fim } = limitesDoDia(dia);
  const semanaIni = inicioSemana(dia);
  const semanaFim = fimSemana(dia);
  const [agR, docR, venR] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("tipo, status, auto_gerado, deleted_at")
      .eq("corretor_id", uid)
      .gte("created_at", ini)
      .lte("created_at", fim),
    supabase
      .from("lead_status_transitions")
      .select("id", { count: "exact", head: true })
      .eq("corretor_id", uid)
      .eq("para_status", "analise_credito")
      .gte("created_at", ini)
      .lte("created_at", fim),
    supabase
      .from("vendas")
      .select("status_venda, distrato")
      .eq("corretor_id", uid)
      .gte("data_assinatura", semanaIni)
      .lte("data_assinatura", semanaFim),
  ]);
  if (agR.error) throw agR.error;
  if (docR.error) throw docR.error;
  if (venR.error) throw venR.error;
  const vendas = contarVendasSemana(venR.data ?? []);
  return {
    agendamentos: contarAgendamentos(agR.data ?? []),
    documentacoes: docR.count ?? 0,
    vendas_semana: vendas.total,
    vendas_pendentes: vendas.pendentes,
  };
}

/**
 * Realizado de HOJE. Atualiza ao voltar o foco da janela e a cada 2 min; as
 * ações do próprio usuário (agendar, vender, mover etapa) invalidam na hora
 * via useInvalidarMetasDiaAoMudarDados.
 */
export function useRealizadoHoje(dia: string, enabled = true) {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: [METAS_DIA_KEY, "realizado", uid, dia],
    enabled: !!uid && enabled,
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
    refetchOnWindowFocus: true,
    queryFn: () => buscarRealizado(uid!, dia),
  });
}

/** Realizado de um dia PASSADO (balanço) — não muda mais, cache longo. */
export function useRealizadoDoDia(dia: string | null | undefined, enabled = true) {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: [METAS_DIA_KEY, "realizado-dia", uid, dia],
    enabled: !!uid && !!dia && enabled,
    staleTime: 60 * 60_000,
    queryFn: () => buscarRealizado(uid!, dia!),
  });
}

/**
 * Contagens do funil (contatos → agendamentos → documentações → vendas) dos
 * últimos 30 dias, do corretor e do time (RPC metas_dia_taxas). Falha vira
 * null: o popup e o card seguem sem a sugestão de contatos, nunca travam.
 */
export function useTaxasConversao(enabled = true) {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: [METAS_DIA_KEY, "taxas", uid],
    enabled: !!uid && enabled,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async (): Promise<TaxasRpc | null> => {
      const { data, error } = await supabase.rpc("metas_dia_taxas", { _dias: 30 });
      if (error) {
        console.warn("metas_dia_taxas indisponível:", error.message);
        return null;
      }
      return normalizarTaxasRpc(data);
    },
  });
}

/**
 * Grava o aviso do checkpoint no sino (RPC com dedup por corretor+dia+checkpoint).
 * true = inserido agora; false = já existia (outro aparelho) ou falhou.
 */
export async function registrarAlertaCheckpoint(
  dia: string,
  checkpoint: number,
  titulo: string,
  mensagem: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("metas_dia_alerta_checkpoint", {
    _dia: dia,
    _checkpoint: checkpoint,
    _titulo: titulo,
    _mensagem: mensagem,
  });
  if (error) {
    console.warn("metas_dia_alerta_checkpoint indisponível:", error.message);
    return false;
  }
  return data === true;
}

export type SalvarMetaInput = {
  dia: string;
  meta_agendamentos: number;
  meta_documentacoes: number;
  meta_vendas_semana: number;
};

/** Upsert da resposta do dia (uma linha por corretor por dia). */
export function useSalvarMetaDia() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalvarMetaInput) => {
      if (!user) throw new Error("Sessão expirada. Entre novamente.");
      const { error } = await supabase.from("metas_dia_corretor").upsert(
        {
          corretor_id: user.id,
          dia: input.dia,
          semana_inicio: inicioSemana(input.dia),
          meta_agendamentos: input.meta_agendamentos,
          meta_documentacoes: input.meta_documentacoes,
          meta_vendas_semana: input.meta_vendas_semana,
          respondido_em: new Date().toISOString(),
        },
        { onConflict: "corretor_id,dia" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [METAS_DIA_KEY] });
      // O widget "Metas do dia" da Central de Comando lê a meta declarada.
      void qc.invalidateQueries({ queryKey: ["meu-painel:meta"] });
    },
  });
}

export function invalidarMetasDia(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: [METAS_DIA_KEY, "realizado"] });
}

// Toda ação que mexe no realizado já invalida uma destas famílias de queries
// (agendar → "agendamentos"; vender → "vendas"; mover etapa → "leads"/
// "leads-kanban"/"lead"). Escutar o cache é mais robusto do que caçar cada
// call site — e não cria loop, porque a própria família "metas-dia" é ignorada.
const GATILHOS = new Set(["agendamentos", "vendas", "leads", "leads-kanban", "lead"]);

export function useInvalidarMetasDiaAoMudarDados() {
  const qc = useQueryClient();
  useEffect(() => {
    let agendado: ReturnType<typeof setTimeout> | null = null;
    const unsub = qc.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "invalidate") return;
      const raiz = event.query.queryKey[0];
      if (typeof raiz !== "string" || !GATILHOS.has(raiz)) return;
      // Debounce: uma ação costuma invalidar várias famílias de uma vez.
      if (agendado) clearTimeout(agendado);
      agendado = setTimeout(() => invalidarMetasDia(qc), 300);
    });
    return () => {
      if (agendado) clearTimeout(agendado);
      unsub();
    };
  }, [qc]);
}
