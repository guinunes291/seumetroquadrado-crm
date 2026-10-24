// Executor da Sami — movimentos do funil pelas portas oficiais: agendar
// visita, mudar etapa, retorno, perda e troca de vaga.
// Recortado de samiq-executar.server.ts sem mudança de comportamento.

import { followUpParaStatus } from "@/lib/follow-up";
import { transicaoLeadPermitida, type LeadStatus } from "@/lib/leads";
import { fmtDataHoraSP } from "@/lib/samiq-datas";
import { fimDaVisita, mensagemEtapaNaoAplicada, tituloVisita } from "@/lib/samiq-propostas";
import type { Json } from "@/integrations/supabase/types";
import {
  type ResultadoExecucao,
  erroDb,
  rotuloEtapa,
  carregarLead,
  statusAtual,
  auxiliar,
  type AcaoCtx,
  type PayloadDe,
} from "./samiq-executar-base.server";
import {
  garantirFollowUp,
  marcarViaSami,
  registrarContatoOficial,
  anotarFollowUp,
  deduplicarTarefasNoHorario,
  textoLotado,
} from "./samiq-executar-apoio.server";

export async function executarAgendarVisita(
  c: AcaoCtx,
  payload: PayloadDe<"agendar_visita">,
): Promise<ResultadoExecucao> {
  const { supabase, userId, agora } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  const inicio = new Date(payload.inicioEm);
  if (Number.isNaN(inicio.getTime())) throw new Error("Data da visita inválida.");
  if (inicio.getTime() < agora.getTime() - 60_000) {
    throw new Error("A data da visita já passou.");
  }
  const mover = payload.moverParaAgendado !== false && lead.status !== "agendado";
  if (mover && !transicaoLeadPermitida(lead.status, "agendado", false)) {
    throw new Error(
      `O funil não vai de ${rotuloEtapa(lead.status)} para Agendado: registre antes o contato com o cliente.`,
    );
  }
  const { data: criado, error } = await supabase
    .from("agendamentos")
    .insert({
      lead_id: lead.id,
      corretor_id: lead.corretor_id ?? userId,
      criado_por_id: userId,
      tipo: "visita",
      status: "agendado",
      titulo: tituloVisita(payload, lead.nome),
      descricao: "Agendada via Sami",
      local: payload.local?.trim() || null,
      data_inicio: inicio.toISOString(),
      data_fim: fimDaVisita(payload),
      timezone: "America/Sao_Paulo",
      lembrete_minutos: 30,
    })
    .select("id")
    .single();
  if (error) erroDb("Não foi possível agendar a visita", error);
  const resultado: ResultadoExecucao = { agendamento_id: criado.id, lead_id: lead.id };

  // Mesma compensação de lib/agendamentos.ts: se o funil recusar a
  // etapa, a visita não fica órfã — desfaz e falha com o motivo.
  if (mover) {
    const tpl = followUpParaStatus("agendado", {
      nome: lead.nome,
      dataInicio: inicio.toISOString(),
      agora,
    });
    const { error: trErr } = await supabase.rpc("transicionar_lead", {
      p_lead_id: lead.id,
      p_novo_status: "agendado",
      p_proxima_acao: tpl?.titulo ?? undefined,
      p_proximo_followup: tpl?.vencimento ?? undefined,
    });
    if (trErr) {
      await supabase
        .from("agendamentos")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", criado.id);
      erroDb("Visita não agendada: o funil recusou mover para Agendado", trErr);
    }
    resultado.etapa_anterior = lead.status;
    resultado.etapa_nova = "agendado";
    if (tpl) {
      const avisos: string[] = [];
      await auxiliar(avisos, "tarefa de confirmação", async () => {
        const fu = await garantirFollowUp(supabase, {
          leadId: lead.id,
          tipo: tpl.tipo,
          titulo: tpl.titulo,
          prioridade: tpl.prioridade,
          vencimento: tpl.vencimento,
          corretorId: lead.corretor_id ?? userId,
          criadoPorId: userId,
        });
        await anotarFollowUp(supabase, resultado, fu);
      });
      if (avisos.length) resultado.avisos = avisos;
    }
  }
  resultado.efeito = `visita ${fmtDataHoraSP(inicio.toISOString())}${mover ? "; cliente em Agendado" : ""}`;
  return resultado;
}

export async function executarMudarEtapa(
  c: AcaoCtx,
  payload: PayloadDe<"mudar_etapa">,
): Promise<ResultadoExecucao> {
  const { supabase, userId, agora } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  const novo = payload.novoStatus as LeadStatus;
  const tpl = followUpParaStatus(novo, { nome: lead.nome, agora });
  const followup = payload.proximoFollowupEm
    ? new Date(payload.proximoFollowupEm).toISOString()
    : (tpl?.vencimento ?? undefined);
  const { data: transicionado, error } = await supabase.rpc("transicionar_lead", {
    p_lead_id: lead.id,
    p_novo_status: novo,
    p_motivo: payload.motivo?.trim() || undefined,
    p_proxima_acao: payload.proximaAcao?.trim() || tpl?.titulo || undefined,
    p_proximo_followup: followup,
    ...(payload.motivoCategoria ? { p_motivo_categoria: payload.motivoCategoria } : {}),
  });
  if (error) erroDb("O funil recusou a mudança de etapa", error);
  const statusFinal = (transicionado as { status?: string } | null)?.status;
  if (statusFinal && statusFinal !== novo) {
    throw new Error(mensagemEtapaNaoAplicada(novo, statusFinal, lead.corretor_id));
  }
  const resultado: ResultadoExecucao = {
    lead_id: lead.id,
    etapa_anterior: lead.status,
    etapa_nova: novo,
    efeito: `cliente em ${rotuloEtapa(novo)}`,
  };
  if (tpl) {
    const avisos: string[] = [];
    await auxiliar(avisos, "tarefa do próximo passo", async () => {
      const fu = await garantirFollowUp(supabase, {
        leadId: lead.id,
        tipo: tpl.tipo,
        titulo: tpl.titulo,
        prioridade: tpl.prioridade,
        vencimento: followup ?? tpl.vencimento,
        corretorId: lead.corretor_id ?? userId,
        criadoPorId: userId,
      });
      await anotarFollowUp(supabase, resultado, fu);
    });
    if (avisos.length) resultado.avisos = avisos;
  }
  return resultado;
}

export async function executarRegistrarRetorno(
  c: AcaoCtx,
  payload: PayloadDe<"registrar_retorno">,
): Promise<ResultadoExecucao> {
  const { supabase, userId, marca } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  const retorno = new Date(payload.retornoEm).toISOString();
  const avisos: string[] = [];
  // 1) O contato que gerou o retorno (sem tarefa: o retorno cria a dele).
  //    Lead em prospecção entra em Em atendimento por consequência, e o
  //    retorno o tira em seguida (como o "Pediu retorno" da Fila do Dia).
  const contato = await registrarContatoOficial(supabase, {
    leadId: lead.id,
    canal: payload.canal ?? "ligacao",
    resultado: "pediu_retorno",
    conteudo:
      payload.nota?.trim() ||
      (payload.desfecho === "esfriou" ? "Cliente esfriou" : "Pediu retorno"),
    proximaAcao: "Retornar como combinado",
    proximoFollowup: retorno,
    criarTarefa: false,
  });
  const resultado: ResultadoExecucao = {
    lead_id: lead.id,
    interacao_id: contato.interacao_id,
    etapa_anterior: lead.status,
  };
  if (contato.interacao_id) {
    const interacaoId = contato.interacao_id;
    await auxiliar(avisos, "marca via Sami", () =>
      marcarViaSami(supabase, interacaoId, marca, {
        origem: "registrar_contato",
        resultado: "pediu_retorno",
      }),
    );
  }
  // 2) O desfecho oficial (até 30 dias: Aguardando retorno com tarefa;
  //    além disso: perda "retorno futuro", menos lead próprio).
  const { data: r, error: rErr } = await supabase.rpc("registrar_retorno_lead", {
    _lead_id: lead.id,
    _tipo: payload.desfecho,
    _data: retorno,
    _nota: payload.nota?.trim() || undefined,
  });
  if (rErr) {
    // Ex.: Em atendimento lotado e o cliente ficou em prospecção, onde o
    // dono não pode mover para Aguardando retorno. O combinado não se perde.
    const fu = await garantirFollowUp(supabase, {
      leadId: lead.id,
      tipo: "follow_up",
      titulo: "Retornar como combinado",
      prioridade: "media",
      vencimento: retorno,
      corretorId: lead.corretor_id ?? userId,
      criadoPorId: userId,
    });
    await anotarFollowUp(supabase, resultado, fu);
    resultado.etapa_nova = (await statusAtual(supabase, lead.id)) ?? lead.status;
    resultado.efeito = `contato gravado e tarefa de retorno ${fmtDataHoraSP(retorno)}; o funil não levou para Aguardando retorno (${(rErr.message ?? "").slice(0, 100)})${
      contato.lotado ? `; ${textoLotado(contato.lotado)}` : ""
    }`;
    return resultado;
  }
  const out = (r ?? {}) as { destino?: string; proprio?: boolean };
  await auxiliar(avisos, "tarefa duplicada", () =>
    deduplicarTarefasNoHorario(supabase, lead.id, retorno),
  );
  resultado.etapa_nova = out.destino === "perdido" ? "perdido" : "aguardando_retorno";
  resultado.efeito =
    out.destino === "perdido"
      ? "retorno a mais de 30 dias: virou perda 'retorno futuro' e volta pela reativação perto da data"
      : `em Aguardando retorno, tarefa ${fmtDataHoraSP(retorno)}${payload.desfecho === "esfriou" ? ", cliente frio" : ""}`;
  if (avisos.length) resultado.avisos = avisos;
  return resultado;
}

export async function executarMarcarPerdido(
  c: AcaoCtx,
  payload: PayloadDe<"marcar_perdido">,
): Promise<ResultadoExecucao> {
  const { supabase } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  const { data: novoCorretor, error } = await supabase.rpc("marcar_lead_perdido_v2", {
    _lead_id: lead.id,
    _categoria: payload.categoria,
    _detalhe: payload.detalhe?.trim() || undefined,
  });
  if (error) erroDb("O CRM recusou a perda", error);
  return {
    lead_id: lead.id,
    etapa_anterior: lead.status,
    etapa_nova: "perdido",
    redistribuido_para: (novoCorretor as string | null) ?? null,
    efeito: novoCorretor
      ? "perdido; o cliente foi redistribuído para outro corretor"
      : "perdido; o cliente saiu da carteira e foi para a base",
  };
}

export async function executarTrocarVaga(
  c: AcaoCtx,
  payload: PayloadDe<"trocar_vaga">,
): Promise<ResultadoExecucao> {
  const { supabase } = c;
  const entra = await carregarLead(supabase, payload.entraLeadId);
  const { data, error } = await supabase.rpc("trocar_vaga_em_atendimento", {
    _entra: entra.id,
    _sai: payload.saiLeadId,
    _desfecho: payload.desfecho,
    _data: payload.retornoEm ? new Date(payload.retornoEm).toISOString() : undefined,
    _categoria: payload.categoria ?? undefined,
    _detalhe: payload.detalhe?.trim() || undefined,
    _proxima_acao: payload.proximoPasso?.trim() || undefined,
    _proximo_followup: payload.proximoFollowupEm
      ? new Date(payload.proximoFollowupEm).toISOString()
      : undefined,
    _contato_tipo: payload.contato ?? undefined,
  });
  if (error) erroDb("O CRM recusou a troca de vaga", error);
  return {
    lead_id: entra.id,
    sai_lead_id: payload.saiLeadId,
    troca: (data ?? null) as Json,
    efeito: `${entra.nome} entrou em Em atendimento; o outro saiu como ${payload.desfecho.replace("_", " ")}`,
  };
}
