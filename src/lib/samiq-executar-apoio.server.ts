// Executor da Sami — passos de apoio que várias ações repetem: follow-up
// sem duplicar (mesmo horário ou mesmo tipo no dia), objeções, marca "via
// Sami" na interação oficial e a porta oficial do contato.
// Recortado de samiq-executar.server.ts sem mudança de comportamento.

import { SAMIQ_JANELA_MESMA_TAREFA_MS, tarefaNoMesmoHorario } from "@/lib/samiq-propostas";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  type Db,
  type ResultadoExecucao,
  DIA_MS,
  paraJson,
  erroDb,
  type LeadAtual,
  estadoDepoisDaTarefa,
} from "./samiq-executar-base.server";

/**
 * Tarefa aberta do lead no mesmo horário (±2 h), de QUALQUER tipo. Evita que
 * follow-up automático, follow-up do contato e tarefa explícita virem 2 ou 3
 * tarefas para o mesmo compromisso.
 */
export async function tarefaAbertaNoMesmoHorario(
  supabase: Db,
  leadId: string,
  vencimentoIso: string,
): Promise<{
  id: string;
  titulo: string;
  tipo: string;
  prioridade: string;
  data_vencimento: string | null;
} | null> {
  const venc = Date.parse(vencimentoIso);
  if (Number.isNaN(venc)) return null;
  const { data, error } = await supabase
    .from("tarefas")
    .select("id, titulo, tipo, prioridade, data_vencimento")
    .eq("lead_id", leadId)
    .in("status", ["pendente", "em_andamento"])
    .is("deleted_at", null)
    .gte("data_vencimento", new Date(venc - SAMIQ_JANELA_MESMA_TAREFA_MS).toISOString())
    .lte("data_vencimento", new Date(venc + SAMIQ_JANELA_MESMA_TAREFA_MS).toISOString())
    .limit(10);
  if (error) erroDb("Não foi possível conferir as tarefas do cliente", error);
  return tarefaNoMesmoHorario(data ?? [], vencimentoIso);
}

/**
 * Mesma regra de garantirFollowUpAberto (lib/follow-up.ts), com o client do
 * corretor: dedup por horário (±2 h, qualquer tipo) e por (tipo, ±1 dia).
 * Devolve o id e se CRIOU (só a criada o desfazer pode apagar).
 */
export async function garantirFollowUp(
  supabase: Db,
  args: {
    leadId: string;
    tipo: Database["public"]["Enums"]["tarefa_tipo"];
    titulo: string;
    prioridade: Database["public"]["Enums"]["tarefa_prioridade"];
    vencimento: string;
    corretorId: string;
    criadoPorId: string;
  },
): Promise<{ criou: boolean; tarefaId: string | null; anterior?: Json }> {
  const mesmoHorario = await tarefaAbertaNoMesmoHorario(supabase, args.leadId, args.vencimento);
  if (mesmoHorario) {
    if (mesmoHorario.data_vencimento !== args.vencimento) {
      const { error } = await supabase
        .from("tarefas")
        .update({ data_vencimento: args.vencimento })
        .eq("id", mesmoHorario.id);
      if (error) erroDb("Não foi possível atualizar o follow-up", error);
    }
    return { criou: false, tarefaId: mesmoHorario.id, anterior: paraJson(mesmoHorario) };
  }
  const vencMs = Date.parse(args.vencimento);
  const { data: abertas, error: selErr } = await supabase
    .from("tarefas")
    .select("id, titulo, tipo, prioridade, data_vencimento")
    .eq("lead_id", args.leadId)
    .eq("tipo", args.tipo)
    .in("status", ["pendente", "em_andamento"])
    .is("deleted_at", null)
    .gte("data_vencimento", new Date(vencMs - DIA_MS).toISOString())
    .lte("data_vencimento", new Date(vencMs + DIA_MS).toISOString())
    .limit(1);
  if (selErr) erroDb("Não foi possível conferir os follow-ups", selErr);
  if (abertas && abertas.length > 0) {
    const { error } = await supabase
      .from("tarefas")
      .update({
        titulo: args.titulo,
        prioridade: args.prioridade,
        data_vencimento: args.vencimento,
      })
      .eq("id", abertas[0].id);
    if (error) erroDb("Não foi possível atualizar o follow-up", error);
    return { criou: false, tarefaId: abertas[0].id, anterior: paraJson(abertas[0]) };
  }
  const { data, error } = await supabase
    .from("tarefas")
    .insert({
      titulo: args.titulo,
      tipo: args.tipo,
      status: "pendente",
      prioridade: args.prioridade,
      lead_id: args.leadId,
      corretor_id: args.corretorId,
      criado_por: args.criadoPorId,
      data_vencimento: args.vencimento,
      descricao: "Registrado via Sami",
    })
    .select("id")
    .single();
  if (error) erroDb("Não foi possível criar o follow-up", error);
  return { criou: true, tarefaId: data.id };
}

export async function unirObjecoes(
  supabase: Db,
  lead: LeadAtual,
  novas: string[],
): Promise<{ anterior: string[]; alterou: boolean }> {
  const limpas = novas.map((o) => o.trim()).filter(Boolean);
  const atuais = lead.objecoes;
  const faltam = limpas.filter(
    (o) => !atuais.some((a) => a.trim().toLowerCase() === o.toLowerCase()),
  );
  if (faltam.length === 0) return { anterior: atuais, alterou: false };
  const { error } = await supabase
    .from("leads")
    .update({ objecoes: [...atuais, ...faltam].slice(0, 30) })
    .eq("id", lead.id);
  if (error) erroDb("Não foi possível gravar as objeções", error);
  return { anterior: atuais, alterou: true };
}

/**
 * A interação criada por uma RPC oficial (registrar_contato_lead) já tem a
 * origem dela; aqui só acrescenta a marca "via Sami" (timeline e auditoria),
 * sem apagar a origem oficial que métricas e telas leem.
 */
export async function marcarViaSami(
  supabase: Db,
  interacaoId: string,
  marca: Record<string, Json>,
  oficial: Record<string, Json>,
): Promise<void> {
  const { error } = await supabase
    .from("interacoes")
    .update({ metadata: { ...oficial, via: "samiq", ...marca, origem: oficial.origem ?? "samiq" } })
    .eq("id", interacaoId);
  if (error) erroDb("marca via Sami", error);
}

export type ContatoRpc = {
  interacao_id?: string;
  tarefa_id?: string | null;
  respondeu?: boolean;
  entrou?: boolean;
  moveu?: boolean;
  via?: string | null;
  status?: string;
  lotado?: { em_atendimento?: number; teto?: number } | null;
};

/** registrar_contato_lead com a sessão do corretor (a porta oficial do contato). */
export async function registrarContatoOficial(
  supabase: Db,
  args: {
    leadId: string;
    canal: string;
    resultado: string;
    conteudo?: string | null;
    proximaAcao?: string | null;
    proximoFollowup?: string | null;
    criarTarefa: boolean;
  },
): Promise<ContatoRpc> {
  const { data, error } = await supabase.rpc("registrar_contato_lead", {
    _lead_id: args.leadId,
    _tipo: args.canal,
    _resultado: args.resultado,
    _conteudo: args.conteudo?.trim() || undefined,
    _proxima_acao: args.proximaAcao?.trim() || undefined,
    _proximo_followup: args.proximoFollowup ?? undefined,
    _criar_tarefa: args.criarTarefa,
  });
  if (error) erroDb("O CRM recusou o registro do contato", error);
  return (data ?? {}) as ContatoRpc;
}

/**
 * Follow-up garantido por uma ação: o criado o desfazer apaga; o que já
 * existia (e a Sami só mudou) volta ao que era, se ninguém mexeu depois.
 */
export async function anotarFollowUp(
  supabase: Db,
  resultado: ResultadoExecucao,
  fu: { criou: boolean; tarefaId: string | null; anterior?: Json },
): Promise<void> {
  if (!fu.tarefaId) return;
  if (fu.criou) {
    resultado.tarefa_id = fu.tarefaId;
    return;
  }
  if (fu.anterior && !resultado.tarefa_atualizada_id) {
    resultado.tarefa_atualizada_id = fu.tarefaId;
    resultado.tarefa_anterior = fu.anterior;
    resultado.tarefa_depois = await estadoDepoisDaTarefa(supabase, fu.tarefaId);
  }
}

/** Duas tarefas abertas no mesmo horário exato (cadência + retorno): fica a mais nova. */
export async function deduplicarTarefasNoHorario(
  supabase: Db,
  leadId: string,
  iso: string,
): Promise<void> {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return;
  const { data } = await supabase
    .from("tarefas")
    .select("id, created_at")
    .eq("lead_id", leadId)
    .in("status", ["pendente", "em_andamento"])
    .is("deleted_at", null)
    .gte("data_vencimento", new Date(t - 60_000).toISOString())
    .lte("data_vencimento", new Date(t + 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(5);
  const sobras = (data ?? []).slice(1).map((r) => r.id);
  if (sobras.length > 0) {
    await supabase
      .from("tarefas")
      .update({ status: "cancelada", resultado: "Duplicada (mesmo horário), cancelada pela Sami" })
      .in("id", sobras);
  }
}

export function textoLotado(l: ContatoRpc["lotado"]): string {
  const ocupa = l?.em_atendimento;
  const teto = l?.teto;
  return `Em atendimento lotado${ocupa != null && teto != null ? ` (${ocupa} de ${teto})` : ""}: o contato ficou gravado mas o cliente não entrou; para colocar, troque a vaga com alguém (trocar_vaga)`;
}
