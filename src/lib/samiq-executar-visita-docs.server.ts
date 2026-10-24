// Executor da Sami — resultado da visita (Modo Visita) e documentação:
// checklist, status do documento e anexo vindo do WhatsApp.
// Recortado de samiq-executar.server.ts sem mudança de comportamento.

import { followUpParaStatus } from "@/lib/follow-up";
import { transicaoLeadPermitida, type LeadStatus } from "@/lib/leads";
import { checklistPorPerfil, docLabel, type PerfilRenda } from "@/lib/documentacao-checklist";
import { fmtDataHoraSP } from "@/lib/samiq-datas";
import { anexarArquivoDoWhatsApp } from "./samiq-anexos.server";
import {
  type ResultadoExecucao,
  DIA_MS,
  HORA_MS,
  erroDb,
  rotuloEtapa,
  carregarLead,
  statusAtual,
  auxiliar,
  type AcaoCtx,
  type PayloadDe,
} from "./samiq-executar-base.server";
import { garantirFollowUp, anotarFollowUp } from "./samiq-executar-apoio.server";

export async function executarRegistrarVisita(
  c: AcaoCtx,
  payload: PayloadDe<"registrar_visita">,
): Promise<ResultadoExecucao> {
  const { supabase, userId, agora } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  const avisos: string[] = [];
  let agendamentoId = payload.agendamentoId ?? null;
  let autoGerado: string | null = null;
  if (!agendamentoId) {
    const { data: abertas } = await supabase
      .from("agendamentos")
      .select("id, data_inicio")
      .eq("lead_id", lead.id)
      .eq("tipo", "visita")
      .in("status", ["agendado", "confirmado"])
      .is("deleted_at", null)
      .gte("data_inicio", new Date(agora.getTime() - 7 * DIA_MS).toISOString())
      .lte("data_inicio", new Date(agora.getTime() + DIA_MS).toISOString())
      .order("data_inicio", { ascending: false })
      .limit(1);
    agendamentoId = abertas?.[0]?.id ?? null;
  }
  if (!agendamentoId) {
    // Visita que aconteceu sem estar agendada (a tela faz o mesmo: cria o
    // agendamento automático e valida em seguida).
    const quando = payload.realizadaEm
      ? new Date(payload.realizadaEm)
      : new Date(agora.getTime() - HORA_MS);
    const { data: auto, error: autoErr } = await supabase
      .from("agendamentos")
      .insert({
        lead_id: lead.id,
        corretor_id: lead.corretor_id ?? userId,
        criado_por_id: userId,
        tipo: "visita",
        status: "agendado",
        titulo: `Visita - ${lead.nome}`,
        descricao: "Registrada via Sami (visita sem agendamento)",
        data_inicio: quando.toISOString(),
        data_fim: new Date(quando.getTime() + HORA_MS).toISOString(),
        timezone: "America/Sao_Paulo",
        auto_gerado: true,
      })
      .select("id")
      .single();
    if (autoErr) erroDb("Não foi possível registrar a visita", autoErr);
    agendamentoId = auto.id;
    autoGerado = auto.id;
  }
  const etapa = (payload.proximaEtapa ??
    (payload.compareceu
      ? "visita_realizada"
      : payload.reagendarPara
        ? "agendado"
        : "aguardando_retorno")) as LeadStatus;
  // Etapa atual que não chega à de destino direto (ex.: Em atendimento →
  // Visita realizada): passa por Agendado, como a visita agendada faria.
  let etapaAntes = lead.status;
  if (
    lead.status !== etapa &&
    !transicaoLeadPermitida(lead.status, etapa, false) &&
    lead.status !== "agendado" &&
    transicaoLeadPermitida(lead.status, "agendado", false)
  ) {
    const { error: trErr } = await supabase.rpc("transicionar_lead", {
      p_lead_id: lead.id,
      p_novo_status: "agendado",
      p_proxima_acao: "Registrar o resultado da visita",
      p_proximo_followup: new Date(agora.getTime() + HORA_MS).toISOString(),
    });
    if (trErr) erroDb("O funil recusou registrar a visita", trErr);
    etapaAntes = "agendado";
  }
  const tpl = followUpParaStatus(etapa, {
    nome: lead.nome,
    dataInicio: payload.reagendarPara ?? null,
    agora,
  });
  const followup = payload.proximoFollowupEm
    ? new Date(payload.proximoFollowupEm).toISOString()
    : (tpl?.vencimento ?? new Date(agora.getTime() + DIA_MS).toISOString());
  const { error: vErr } = await supabase.rpc("salvar_modo_visita", {
    p_agendamento_id: agendamentoId,
    p_checklist: {},
    p_observacoes: payload.observacoes?.trim() || undefined,
    p_concluir: true,
    p_proxima_etapa: etapa,
    p_proxima_acao: payload.proximoPasso?.trim() || tpl?.titulo || undefined,
    p_proximo_followup: followup,
    p_compareceu: payload.compareceu,
    p_interesse: payload.compareceu ? payload.interesse : undefined,
    p_objecao_principal: payload.objecaoPrincipal ?? undefined,
    p_reagendar_para: payload.reagendarPara
      ? new Date(payload.reagendarPara).toISOString()
      : undefined,
  });
  if (vErr) {
    if (autoGerado) {
      await supabase
        .from("agendamentos")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", autoGerado);
    }
    // A passagem por Agendado já aconteceu e o funil não volta: o recibo
    // diz isso em vez de fingir que nada mudou.
    erroDb(
      etapaAntes !== lead.status
        ? "O CRM recusou o resultado da visita (o cliente ficou em Agendado; me diga de novo como foi)"
        : "O CRM recusou o resultado da visita",
      vErr,
    );
  }
  const resultado: ResultadoExecucao = {
    lead_id: lead.id,
    agendamento_id: agendamentoId,
    etapa_anterior: etapaAntes,
    etapa_nova: (await statusAtual(supabase, lead.id)) ?? etapa,
    ...(autoGerado ? { agendamento_auto_id: autoGerado } : {}),
  };
  if (tpl) {
    await auxiliar(avisos, "tarefa do próximo passo", async () => {
      const fu = await garantirFollowUp(supabase, {
        leadId: lead.id,
        tipo: tpl.tipo,
        titulo: payload.proximoPasso?.trim() || tpl.titulo,
        prioridade: tpl.prioridade,
        vencimento: followup,
        corretorId: lead.corretor_id ?? userId,
        criadoPorId: userId,
      });
      await anotarFollowUp(supabase, resultado, fu);
    });
  }
  if (avisos.length) resultado.avisos = avisos;
  resultado.efeito = `${payload.compareceu ? "visita realizada" : "não compareceu"}; cliente em ${rotuloEtapa(
    String(resultado.etapa_nova),
  )}${payload.reagendarPara ? `; nova visita ${fmtDataHoraSP(payload.reagendarPara)}` : ""}`;
  return resultado;
}

export async function executarDocumentosChecklist(
  c: AcaoCtx,
  payload: PayloadDe<"documentos_checklist">,
): Promise<ResultadoExecucao> {
  const { supabase } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  const esperados = checklistPorPerfil(payload.perfil as PerfilRenda, {
    casado: payload.casado,
    usaFgts: payload.usaFgts,
    declaraIr: payload.declaraIr,
  }).map((d) => d.tipo);
  const { data: atuais, error: selErr } = await supabase
    .from("documentacoes")
    .select("tipo")
    .eq("lead_id", lead.id)
    .limit(80);
  if (selErr) erroDb("Não foi possível ler os documentos", selErr);
  const tem = new Set((atuais ?? []).map((d) => d.tipo));
  const faltam = esperados.filter((t) => !tem.has(t));
  if (faltam.length === 0) {
    return { lead_id: lead.id, efeito: "o checklist já estava completo" };
  }
  const { data: criados, error } = await supabase
    .from("documentacoes")
    .insert(
      faltam.map((tipo) => ({
        lead_id: lead.id,
        corretor_id: lead.corretor_id,
        tipo,
        status: "pendente",
      })),
    )
    .select("id");
  if (error) erroDb("Não foi possível montar o checklist", error);
  return {
    lead_id: lead.id,
    documentacao_ids: (criados ?? []).map((d) => d.id),
    efeito: `${faltam.length} documentos no checklist: ${faltam.map(docLabel).join(", ")}`.slice(
      0,
      400,
    ),
  };
}

export async function executarAtualizarDocumento(
  c: AcaoCtx,
  payload: PayloadDe<"atualizar_documento">,
): Promise<ResultadoExecucao> {
  const { supabase, agora } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  const { data: doc, error: selErr } = await supabase
    .from("documentacoes")
    .select("id, status, observacoes, recebido_em")
    .eq("lead_id", lead.id)
    .eq("tipo", payload.documento)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selErr) erroDb("Não foi possível ler o documento", selErr);
  const recebe = payload.status === "recebido" || payload.status === "aprovado";
  const resultado: ResultadoExecucao = { lead_id: lead.id };
  if (!doc) {
    const { data: criado, error } = await supabase
      .from("documentacoes")
      .insert({
        lead_id: lead.id,
        corretor_id: lead.corretor_id,
        tipo: payload.documento,
        status: payload.status,
        observacoes: payload.observacao?.trim() || null,
        ...(recebe ? { recebido_em: agora.toISOString() } : {}),
      })
      .select("id")
      .single();
    if (error) erroDb("Não foi possível registrar o documento", error);
    resultado.documento_criado_id = criado.id;
  } else {
    const { error } = await supabase
      .from("documentacoes")
      .update({
        status: payload.status,
        ...(payload.observacao !== undefined
          ? { observacoes: payload.observacao.trim() || null }
          : {}),
        ...(recebe && !doc.recebido_em ? { recebido_em: agora.toISOString() } : {}),
      })
      .eq("id", doc.id);
    if (error) erroDb("Não foi possível atualizar o documento", error);
    resultado.documento_anterior = {
      id: doc.id,
      status: doc.status,
      observacoes: doc.observacoes,
      recebido_em: doc.recebido_em,
    };
    resultado.documento_depois = { status: payload.status };
  }
  const depois = await statusAtual(supabase, lead.id);
  if (depois && depois !== lead.status) {
    resultado.etapa_anterior = lead.status;
    resultado.etapa_nova = depois;
  }
  resultado.efeito = `${docLabel(payload.documento)}: ${payload.status}${
    depois && depois !== lead.status
      ? `; pasta montada, cliente foi para ${rotuloEtapa(depois)}`
      : ""
  }`;
  return resultado;
}

export async function executarAnexarDocumento(
  c: AcaoCtx,
  payload: PayloadDe<"anexar_documento">,
): Promise<ResultadoExecucao> {
  const { supabase, userId } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  const r = await anexarArquivoDoWhatsApp({
    supabase,
    userId,
    leadId: lead.id,
    corretorId: lead.corretor_id,
    anexoId: payload.anexoId,
    tipoDocumento: payload.documento,
  });
  const depois = await statusAtual(supabase, lead.id);
  return {
    lead_id: lead.id,
    documentacao_id: r.documentacaoId,
    efeito: `${docLabel(payload.documento)} anexado na ficha${
      depois && depois !== lead.status
        ? `; pasta montada, cliente foi para ${rotuloEtapa(depois)}`
        : ""
    }`,
  };
}
