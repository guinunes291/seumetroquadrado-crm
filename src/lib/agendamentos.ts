// Criação de agendamento com escrita ordenada e COMPENSAÇÃO.
//
// Problema (A2/A4): o modal de "Agendado" fazia insert do agendamento →
// update do status do lead → follow-up, sem transação. Se o update do lead
// falhasse, sobrava um agendamento órfão com o lead no status antigo. E a
// página /agendamentos criava o agendamento por outro caminho, sem mover o
// lead nem invalidar as queries do detalhe — os dois fluxos divergiam.
//
// Este helper centraliza a criação: insere o agendamento e, se pedido, move
// o lead; se o update do lead falhar, desfaz o agendamento (soft-delete) e
// lança — nada de estado parcial silencioso. O follow-up é best-effort e vira
// aviso, não erro. Google Calendar/invalidação/toast ficam com o chamador.

import { supabase } from "@/integrations/supabase/client";
import { criarFollowUpAutomatico } from "@/lib/follow-up";
import { transicionarLead } from "@/lib/lead-transitions";
import type { LeadStatus } from "@/lib/leads";
import type { QueryClient } from "@tanstack/react-query";

export type CriarAgendamentoInput = {
  leadId: string;
  leadNome?: string;
  corretorId: string | null;
  criadoPorId: string | null;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  /** ISO 8601. */
  dataInicio: string;
  /** ISO 8601. */
  dataFim: string;
  lembreteMinutos?: number;
};

export type CriarAgendamentoOpts = {
  /** Move o lead para este status após criar (null/omitido = não mexe no lead). */
  moverLeadPara?: LeadStatus | null;
  /** Cria a tarefa de follow-up da etapa (só tem efeito com moverLeadPara). */
  criarFollowUp?: boolean;
};

export type CriarAgendamentoResult = {
  agendamentoId: string;
  followUpCriado: boolean;
  /** Falhas não-bloqueantes (ex.: follow-up) para exibir ao usuário. */
  avisos: string[];
};

/** Valida os campos essenciais. Pura — exportada para teste. */
export function validarAgendamento(input: CriarAgendamentoInput): string | null {
  if (!input.titulo.trim()) return "Informe um título";
  const inicio = new Date(input.dataInicio);
  if (Number.isNaN(inicio.getTime())) return "Data de início inválida";
  const fim = new Date(input.dataFim);
  if (Number.isNaN(fim.getTime())) return "Data de fim inválida";
  if (fim <= inicio) return "O fim deve ser depois do início";
  return null;
}

export async function criarAgendamento(
  input: CriarAgendamentoInput,
  opts: CriarAgendamentoOpts = {},
): Promise<CriarAgendamentoResult> {
  const erro = validarAgendamento(input);
  if (erro) throw new Error(erro);

  const inicio = new Date(input.dataInicio);
  const fim = new Date(input.dataFim);
  const avisos: string[] = [];

  // 1) Cria o agendamento.
  const { data: criado, error: insErr } = await supabase
    .from("agendamentos")
    .insert({
      lead_id: input.leadId,
      corretor_id: input.corretorId,
      criado_por_id: input.criadoPorId,
      tipo: input.tipo,
      status: "agendado",
      titulo: input.titulo.trim(),
      descricao: input.descricao?.trim() || null,
      local: input.local?.trim() || null,
      data_inicio: inicio.toISOString(),
      data_fim: fim.toISOString(),
      timezone: "America/Sao_Paulo",
      lembrete_minutos: input.lembreteMinutos ?? 30,
    } as never)
    .select("id")
    .single();
  if (insErr) throw insErr;
  const agendamentoId = (criado as { id: string }).id;

  // 2) Move o lead pela máquina de estados — COM COMPENSAÇÃO. Se a RPC falhar,
  //    desfaz o agendamento
  //    (soft-delete, dentro do que a RLS do corretor permite) e lança, em vez
  //    de deixar um agendamento órfão com o lead no status antigo.
  if (opts.moverLeadPara) {
    try {
      await transicionarLead({
        id: input.leadId,
        nome: input.leadNome,
        status: opts.moverLeadPara,
      });
    } catch (transitionError) {
      const { error: compErr } = await supabase
        .from("agendamentos")
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", agendamentoId);
      if (compErr) {
        console.error("[agendamentos] compensação falhou (agendamento órfão)", compErr);
        throw new Error(
          `Não foi possível mover o lead nem desfazer o agendamento (${agendamentoId}). ` +
            `Verifique a agenda manualmente.`,
        );
      }
      throw transitionError;
    }
  }

  // 3) Follow-up automático (best-effort — vira aviso, nunca derruba o fluxo).
  let followUpCriado = false;
  if (opts.criarFollowUp && opts.moverLeadPara) {
    try {
      followUpCriado = await criarFollowUpAutomatico({
        leadId: input.leadId,
        nome: input.leadNome ?? "",
        corretorId: input.corretorId,
        status: opts.moverLeadPara,
        dataInicio: inicio.toISOString(),
        criadoPorId: input.criadoPorId,
      });
    } catch (e) {
      console.warn("[agendamentos] follow-up automático falhou", e);
      avisos.push("A tarefa de follow-up não pôde ser criada automaticamente.");
    }
  }

  return { agendamentoId, followUpCriado, avisos };
}

/**
 * Invalidação canônica após criar/editar/remover agendamento. Inclui as
 * queries do detalhe do lead (`agendamentos-lead`) — que a página /agendamentos
 * esquecia, deixando a aba do lead desatualizada.
 */
export function invalidateAgendamentoQueries(qc: QueryClient, leadId?: string | null) {
  qc.invalidateQueries({ queryKey: ["agendamentos"] });
  if (leadId) {
    qc.invalidateQueries({ queryKey: ["agendamentos-lead", leadId] });
    qc.invalidateQueries({ queryKey: ["lead", leadId] });
    qc.invalidateQueries({ queryKey: ["interacoes", leadId] });
    qc.invalidateQueries({ queryKey: ["tarefas-lead", leadId] });
  }
  qc.invalidateQueries({ queryKey: ["leads-kanban"] });
  qc.invalidateQueries({ queryKey: ["leads"] });
  qc.invalidateQueries({ queryKey: ["tarefas"] });
}
