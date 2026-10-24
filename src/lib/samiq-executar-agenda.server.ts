// Executor da Sami — tarefas (concluir, reagendar, cancelar) e visitas
// (confirmar, cancelar, remarcar).
// Recortado de samiq-executar.server.ts sem mudança de comportamento.

import { followUpParaStatus } from "@/lib/follow-up";
import { fmtDataHoraSP } from "@/lib/samiq-datas";
import type { Database } from "@/integrations/supabase/types";
import {
  type ResultadoExecucao,
  HORA_MS,
  erroDb,
  auxiliar,
  estadoDepoisDaTarefa,
  type AcaoCtx,
  type PayloadDe,
} from "./samiq-executar-base.server";
import { garantirFollowUp, anotarFollowUp } from "./samiq-executar-apoio.server";

export async function executarTarefa(
  c: AcaoCtx,
  payload: PayloadDe<"concluir_tarefa" | "reagendar_tarefa" | "cancelar_tarefa">,
): Promise<ResultadoExecucao> {
  const { supabase, agora } = c;
  const { data: t, error: tErr } = await supabase
    .from("tarefas")
    .select("id, titulo, status, data_vencimento, data_conclusao, resultado, lead_id")
    .eq("id", payload.tarefaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (tErr) erroDb("Não foi possível ler a tarefa", tErr);
  if (!t) throw new Error("Tarefa não encontrada.");
  if (t.status === "concluida" || t.status === "cancelada") {
    throw new Error(`A tarefa já está ${t.status}.`);
  }
  const anterior = {
    id: t.id,
    status: t.status,
    data_vencimento: t.data_vencimento,
    data_conclusao: t.data_conclusao,
    resultado: t.resultado,
  };
  let patch: Database["public"]["Tables"]["tarefas"]["Update"];
  let efeito: string;
  if (payload.tipo === "concluir_tarefa") {
    patch = {
      status: "concluida",
      data_conclusao: agora.toISOString(),
      resultado: payload.resultado?.trim() || "Concluída via Sami",
    };
    efeito = `concluída: ${t.titulo}`;
  } else if (payload.tipo === "reagendar_tarefa") {
    const nova = new Date(payload.novoVencimentoEm).toISOString();
    patch = { data_vencimento: nova };
    efeito = `${t.titulo}: agora ${fmtDataHoraSP(nova)}`;
  } else {
    patch = { status: "cancelada", resultado: payload.motivo?.trim() || "Cancelada via Sami" };
    efeito = `cancelada: ${t.titulo}`;
  }
  const { error } = await supabase.from("tarefas").update(patch).eq("id", t.id);
  if (error) erroDb("Não foi possível atualizar a tarefa", error);
  return {
    tarefa_atualizada_id: t.id,
    tarefa_anterior: anterior,
    tarefa_depois: await estadoDepoisDaTarefa(supabase, t.id),
    lead_id: t.lead_id,
    efeito,
  };
}

export async function executarConfirmarOuCancelarVisita(
  c: AcaoCtx,
  payload: PayloadDe<"confirmar_visita" | "cancelar_visita">,
): Promise<ResultadoExecucao> {
  const { supabase, agora } = c;
  const { data: a, error: aErr } = await supabase
    .from("agendamentos")
    .select("id, status, motivo_cancelamento, lead_id")
    .eq("id", payload.agendamentoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (aErr) erroDb("Não foi possível ler a visita", aErr);
  if (!a) throw new Error("Visita não encontrada.");
  if (!["agendado", "confirmado"].includes(a.status)) throw new Error(`A visita está ${a.status}.`);
  const confirmar = payload.tipo === "confirmar_visita";
  const { error } = await supabase
    .from("agendamentos")
    .update(
      confirmar
        ? { status: "confirmado" }
        : { status: "cancelado", motivo_cancelamento: payload.motivo.trim() },
    )
    .eq("id", a.id);
  if (error)
    erroDb(
      confirmar ? "Não foi possível confirmar a visita" : "Não foi possível cancelar a visita",
      error,
    );
  const resultado: ResultadoExecucao = {
    agendamento_anterior: {
      id: a.id,
      status: a.status,
      motivo_cancelamento: a.motivo_cancelamento,
    },
    lead_id: a.lead_id,
    efeito: confirmar ? "visita confirmada" : "visita cancelada",
  };
  // A tarefa "Confirmar visita" deixa de fazer sentido nos dois casos
  // (a Agenda do dia faz o mesmo ao confirmar).
  if (a.lead_id) {
    const leadId = a.lead_id;
    const avisos: string[] = [];
    await auxiliar(avisos, "tarefa de confirmação", async () => {
      const { data: tarefas } = await supabase
        .from("tarefas")
        .select("id")
        .eq("lead_id", leadId)
        .in("status", ["pendente", "em_andamento"])
        .is("deleted_at", null)
        .ilike("titulo", "Confirmar visita%")
        .limit(5);
      const ids = (tarefas ?? []).map((x) => x.id);
      if (ids.length) {
        const { error: tErr } = await supabase
          .from("tarefas")
          .update(
            confirmar
              ? {
                  status: "concluida",
                  data_conclusao: agora.toISOString(),
                  resultado: "Visita confirmada",
                }
              : { status: "cancelada", resultado: "Visita cancelada" },
          )
          .in("id", ids);
        if (tErr) erroDb("tarefa", tErr);
        resultado.tarefas_reabrir = ids;
      }
    });
    if (avisos.length) resultado.avisos = avisos;
  }
  return resultado;
}

export async function executarRemarcarVisita(
  c: AcaoCtx,
  payload: PayloadDe<"remarcar_visita">,
): Promise<ResultadoExecucao> {
  const { supabase, userId, agora } = c;
  const { data: a, error: aErr } = await supabase
    .from("agendamentos")
    .select(
      "id, status, lead_id, corretor_id, titulo, descricao, local, tipo, data_inicio, data_fim, lembrete_minutos, lead:leads(id, nome)",
    )
    .eq("id", payload.agendamentoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (aErr) erroDb("Não foi possível ler a visita", aErr);
  if (!a) throw new Error("Visita não encontrada.");
  if (!["agendado", "confirmado"].includes(a.status)) throw new Error(`A visita está ${a.status}.`);
  const inicio = new Date(payload.novoInicioEm);
  if (inicio.getTime() < agora.getTime() - 60_000) throw new Error("A nova data já passou.");
  const duracaoMs = payload.duracaoMin
    ? payload.duracaoMin * 60_000
    : Math.max(Date.parse(a.data_fim) - Date.parse(a.data_inicio), 30 * 60_000) || HORA_MS;
  const { data: nova, error: insErr } = await supabase
    .from("agendamentos")
    .insert({
      lead_id: a.lead_id,
      corretor_id: a.corretor_id ?? userId,
      criado_por_id: userId,
      tipo: a.tipo,
      status: "agendado",
      titulo: a.titulo,
      descricao: "Remarcada via Sami",
      local: a.local,
      data_inicio: inicio.toISOString(),
      data_fim: new Date(inicio.getTime() + duracaoMs).toISOString(),
      timezone: "America/Sao_Paulo",
      lembrete_minutos: a.lembrete_minutos ?? 30,
    })
    .select("id")
    .single();
  if (insErr) erroDb("Não foi possível remarcar a visita", insErr);
  const { error: oldErr } = await supabase
    .from("agendamentos")
    .update({ status: "remarcado" })
    .eq("id", a.id);
  if (oldErr) {
    await supabase
      .from("agendamentos")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", nova.id);
    erroDb("Não foi possível remarcar a visita", oldErr);
  }
  const resultado: ResultadoExecucao = {
    agendamento_novo_id: nova.id,
    agendamento_anterior: { id: a.id, status: a.status },
    lead_id: a.lead_id,
    efeito: `visita remarcada para ${fmtDataHoraSP(inicio.toISOString())}`,
  };
  const lead = a.lead as { id: string; nome: string | null } | null;
  if (a.lead_id) {
    const leadId = a.lead_id;
    const tpl = followUpParaStatus("agendado", {
      nome: lead?.nome ?? undefined,
      dataInicio: inicio.toISOString(),
      agora,
    });
    if (tpl) {
      const avisos: string[] = [];
      await auxiliar(avisos, "tarefa de confirmação", async () => {
        const fu = await garantirFollowUp(supabase, {
          leadId,
          tipo: tpl.tipo,
          titulo: tpl.titulo,
          prioridade: tpl.prioridade,
          vencimento: tpl.vencimento,
          corretorId: a.corretor_id ?? userId,
          criadoPorId: userId,
        });
        await anotarFollowUp(supabase, resultado, fu);
      });
      if (avisos.length) resultado.avisos = avisos;
    }
  }
  return resultado;
}
