// Executor da Sami — análise de crédito (envio e resultado) e venda.
// Recortado de samiq-executar.server.ts sem mudança de comportamento.

import { followUpParaStatus } from "@/lib/follow-up";
import { diaSP, fmtDataHoraSP, mesesPrevisaoSP } from "@/lib/samiq-datas";
import {
  type ResultadoExecucao,
  erroDb,
  carregarLead,
  auxiliar,
  type AcaoCtx,
  type PayloadDe,
} from "./samiq-executar-base.server";
import { garantirFollowUp, anotarFollowUp } from "./samiq-executar-apoio.server";

export async function executarEnviarAnaliseCredito(
  c: AcaoCtx,
  payload: PayloadDe<"enviar_analise_credito">,
): Promise<ResultadoExecucao> {
  const { supabase, userId, agora, metadata } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  const situacao = payload.situacao ?? "enviada";
  const rotuloSit = situacao === "pendente" ? "Pendente (aguardando docs)" : "Enviada ao banco";
  const tpl = followUpParaStatus("analise_credito", { nome: lead.nome, agora });
  // Etapa PRIMEIRO: se o funil recusar, nada fica gravado pela metade.
  if (lead.status !== "analise_credito") {
    const { error: trErr } = await supabase.rpc("transicionar_lead", {
      p_lead_id: lead.id,
      p_novo_status: "analise_credito",
      p_motivo: `Análise de crédito — ${rotuloSit}`,
      p_proxima_acao: tpl?.titulo ?? undefined,
      p_proximo_followup: tpl?.vencimento ?? undefined,
    });
    if (trErr) erroDb("O funil recusou enviar para análise", trErr);
  }
  const resultado: ResultadoExecucao = {
    lead_id: lead.id,
    etapa_anterior: lead.status,
    etapa_nova: "analise_credito",
  };
  const avisos: string[] = [];
  await auxiliar(avisos, "registro da análise", async () => {
    const { data: an, error } = await supabase
      .from("analises_credito")
      .insert({
        lead_id: lead.id,
        corretor_id: lead.corretor_id ?? userId,
        status: situacao,
        observacoes: payload.observacoes?.trim() || null,
      })
      .select("id")
      .single();
    if (error) erroDb("análise", error);
    resultado.analise_id = an.id;
  });
  await auxiliar(avisos, "nota na timeline", async () => {
    const { data: nota, error } = await supabase
      .from("interacoes")
      .insert({
        lead_id: lead.id,
        autor_id: userId,
        tipo: "nota",
        direcao: "interna",
        titulo: `Análise de crédito — ${rotuloSit}`,
        conteudo: payload.observacoes?.trim() || `Status da análise: ${rotuloSit}`,
        metadata: { status_analise: situacao, ...metadata },
      })
      .select("id")
      .single();
    if (error) erroDb("nota", error);
    resultado.interacao_id = nota.id;
  });
  if (tpl) {
    await auxiliar(avisos, "tarefa de cobrança", async () => {
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
  }
  if (avisos.length) resultado.avisos = avisos;
  resultado.efeito = `cliente em Análise de crédito (${rotuloSit.toLowerCase()}); cobrança ${fmtDataHoraSP(tpl?.vencimento)}`;
  return resultado;
}

export async function executarResultadoCredito(
  c: AcaoCtx,
  payload: PayloadDe<"registrar_resultado_credito">,
): Promise<ResultadoExecucao> {
  const { supabase, userId, agora, metadata } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  const comValores = payload.resultado !== "reprovada";
  const dados = comValores
    ? {
        banco: payload.banco ?? null,
        modalidade: payload.modalidade ?? null,
        sistema_amortizacao: payload.sistemaAmortizacao ?? null,
        valor_financiamento: payload.valorFinanciamento ?? null,
        valor_parcela: payload.valorParcela ?? null,
        prazo_meses: payload.prazoMeses ?? null,
        taxa_juros_anual: payload.taxaJurosAnual ?? null,
        valor_fgts: payload.valorFgts ?? null,
        valor_subsidio: payload.valorSubsidio ?? null,
        valor_entrada: payload.valorEntrada ?? null,
        valor_imovel_simulacao: payload.valorImovel ?? null,
        renda_familiar: payload.rendaFamiliar ?? null,
        validade_ate: payload.validadeAte ?? null,
        data_aprovacao: diaSP(agora),
        dados_origem: "manual",
      }
    : {};
  const motivo = payload.motivo?.trim() || null;
  const rotuloMotivo = payload.resultado === "aprovada_condicionada" ? "Condição" : "Reprovação";
  const { data: atual, error: selErr } = await supabase
    .from("analises_credito")
    .select("id, status, observacoes")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selErr) erroDb("Não foi possível ler a análise", selErr);
  const decidida = ["aprovada", "aprovada_condicionada", "reprovada"].includes(atual?.status ?? "");
  let analiseId: string;
  if (atual && !decidida) {
    const observacoes = motivo
      ? `${atual.observacoes ? `${atual.observacoes}\n` : ""}${rotuloMotivo}: ${motivo}`
      : atual.observacoes;
    const { error } = await supabase
      .from("analises_credito")
      .update({ status: payload.resultado, observacoes, ...dados })
      .eq("id", atual.id);
    if (error) erroDb("Não foi possível registrar o resultado", error);
    analiseId = atual.id;
  } else {
    const { data: nova, error } = await supabase
      .from("analises_credito")
      .insert({
        lead_id: lead.id,
        corretor_id: userId,
        status: payload.resultado,
        observacoes: motivo ? `${rotuloMotivo}: ${motivo}` : null,
        ...dados,
      })
      .select("id")
      .single();
    if (error) erroDb("Não foi possível registrar o resultado", error);
    analiseId = nova.id;
  }
  const titulo =
    payload.resultado === "aprovada"
      ? "Análise de crédito APROVADA"
      : payload.resultado === "aprovada_condicionada"
        ? "Análise de crédito APROVADA COM CONDIÇÃO"
        : "Análise de crédito REPROVADA";
  const valores = [
    payload.valorFinanciamento
      ? `Financiamento R$ ${payload.valorFinanciamento.toLocaleString("pt-BR")}`
      : null,
    payload.valorParcela ? `parcela R$ ${payload.valorParcela.toLocaleString("pt-BR")}` : null,
    payload.prazoMeses ? `${payload.prazoMeses} meses` : null,
    payload.banco ?? null,
  ]
    .filter(Boolean)
    .join(", ");
  const resultado: ResultadoExecucao = { lead_id: lead.id, analise_id: analiseId };
  const avisos: string[] = [];
  await auxiliar(avisos, "nota na timeline", async () => {
    const { data: nota, error } = await supabase
      .from("interacoes")
      .insert({
        lead_id: lead.id,
        autor_id: userId,
        tipo: "nota",
        direcao: "interna",
        titulo,
        conteudo: [motivo, valores].filter(Boolean).join("\n") || titulo,
        metadata: { status_analise: payload.resultado, fonte: "fluxo_analise", ...metadata },
      })
      .select("id")
      .single();
    if (error) erroDb("nota", error);
    resultado.interacao_id = nota.id;
  });
  if (avisos.length) resultado.avisos = avisos;
  resultado.efeito = `${titulo.toLowerCase()}${valores ? ` (${valores})` : ""}`;
  return resultado;
}

export async function executarVenda(
  c: AcaoCtx,
  payload: PayloadDe<"registrar_venda">,
): Promise<ResultadoExecucao> {
  const { supabase, userId, agora } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  if (!lead.corretor_id) throw new Error("Venda exige cliente com corretor responsável.");
  if (payload.dataAssinatura > diaSP(agora))
    throw new Error("A data de assinatura não pode ser futura.");
  if (!mesesPrevisaoSP(agora).includes(payload.previsaoRecebimento)) {
    throw new Error(
      "O mês previsto para recebimento tem de estar nos próximos 12 meses (a partir do mês que vem).",
    );
  }
  let projetoId: string | null = null;
  let projetoNome = payload.projetoNome?.trim() || null;
  if (payload.projetoId) {
    const { data: p } = await supabase
      .from("projetos")
      .select("id, nome")
      .eq("id", payload.projetoId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!p) throw new Error("Empreendimento não encontrado.");
    projetoId = p.id;
    projetoNome = p.nome;
  }
  // Percentuais padrão da tela; para o corretor o trigger recalcula a parte
  // dele pelo tier (vendas_aplicar_tier_comissao).
  const { data: venda, error } = await supabase
    .from("vendas")
    .insert({
      lead_id: lead.id,
      corretor_id: lead.corretor_id,
      criado_por_id: userId,
      projeto_id: projetoId,
      projeto_nome: projetoNome,
      unidade: payload.unidade?.trim() || null,
      valor_venda: payload.valorVenda,
      data_assinatura: payload.dataAssinatura,
      percentual_comissao: 3.5,
      percentual_corretor: 1.85,
      percentual_gerente: 0.5,
      percentual_superintendente: 0.6,
      observacoes: [payload.observacoes?.trim(), "Registrada via Sami"].filter(Boolean).join("\n"),
      previsao_recebimento: `${payload.previsaoRecebimento}-01`,
      status_venda: "pendente",
      contrato_assinado: payload.contratoAssinado ?? false,
      ato_pago: payload.atoPago ?? false,
      apto_repasse: payload.aptoRepasse ?? false,
    })
    .select("id")
    .single();
  if (error) erroDb("O CRM recusou a venda", error);
  const faltam = [
    payload.contratoAssinado ? null : "contrato assinado",
    payload.atoPago ? null : "ato pago",
    payload.aptoRepasse ? null : "apto para repasse",
  ].filter(Boolean);
  return {
    venda_id: venda.id,
    lead_id: lead.id,
    efeito: `venda enviada para aprovação da gestão${faltam.length ? `; para aprovar faltam os marcos: ${faltam.join(", ")}` : ""}`,
  };
}
