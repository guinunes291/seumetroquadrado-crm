// Sami — contexto por ação: o que o turno lê do banco (RLS-scoped; campos e
// volumes truncados) antes de chamar o modelo.
// Recortado de samiq-core.server.ts sem mudança de comportamento.

import type { SamiQInput } from "@/lib/samiq";
import { parseAtendimentoInbox } from "@/features/atendimento/inbox";
import { displayNameForSamiQ, firstNameForSamiQ } from "@/lib/samiq-governance";
import type { Db } from "./samiq-core-config";

export async function montarContextoDaAcao({
  supabase,
  userId,
  data,
  reservation,
}: {
  supabase: Db;
  userId: string;
  data: SamiQInput;
  reservation: { toolsEnabled: boolean };
}): Promise<Record<string, unknown>> {
  // ----- Contexto por ação (RLS-scoped; campos e volumes truncados) -----
  const ctx: Record<string, unknown> = {};

  if (data.leadId) {
    const [{ data: lead, error: leadErr }, { data: interacoes, error: interactionErr }] =
      await Promise.all([
        supabase
          .from("leads")
          .select(
            "nome, origem, status, temperatura, projeto_nome, renda_informada, entrada_disponivel, usa_fgts, proximo_followup, ultima_interacao, visita_data, visita_hora, visita_empreendimento, tipo_renda, faixa_mcmv",
          )
          .eq("id", data.leadId)
          .maybeSingle(),
        supabase
          .from("interacoes")
          .select("tipo, direcao, ocorreu_em")
          .eq("lead_id", data.leadId)
          .is("deleted_at", null)
          .order("ocorreu_em", { ascending: false })
          .limit(12),
      ]);
    if (leadErr || interactionErr) throw new Error("context_unavailable");
    if (!lead) throw new Error("lead_not_found");
    const { nome: leadName, ...leadWithoutName } = lead;
    // Nome completo só quando a versão ativa já é a que sabe lidar com ele
    // (D12); com a v2 no ar, o comportamento antigo (primeiro nome) fica.
    ctx.cliente = {
      ...leadWithoutName,
      primeiro_nome: firstNameForSamiQ(leadName),
      ...(reservation.toolsEnabled ? { nome: displayNameForSamiQ(leadName) } : {}),
    };
    ctx.ultimasInteracoes = (interacoes ?? []).map((interaction) => ({
      em: interaction.ocorreu_em,
      tipo: interaction.tipo,
      direcao: interaction.direcao,
    }));
  }

  if (data.action === "checklist_docs" && data.leadId) {
    const { data: docs, error } = await supabase
      .from("documentacoes")
      .select("tipo, status")
      .eq("lead_id", data.leadId)
      .limit(40);
    if (error) throw new Error("context_unavailable");
    ctx.documentacao = (docs ?? []).map((doc) => ({
      documento: doc.tipo,
      status: doc.status,
    }));
  }

  if (data.action === "responder_objecao") {
    const { data: objections, error } = await supabase
      .from("objecoes")
      .select("objecao, resposta")
      .eq("ativo", true)
      .order("ordem")
      .limit(30);
    if (error) throw new Error("context_unavailable");
    const target = (data.pergunta ?? "").toLowerCase();
    const hit = target
      ? ((objections ?? []).find((item) => target.includes(item.objecao.toLowerCase())) ??
        (objections ?? []).find((item) => item.objecao.toLowerCase().includes(target)))
      : null;
    if (hit) ctx.respostaBiblioteca = hit.resposta;
  }

  if (data.action === "projeto_ideal") {
    const { data: projects, error } = await supabase
      .from("projetos")
      .select("nome, bairro, cidade, regiao, tipologia, dorms_min, dorms_max, preco_a_partir")
      .eq("ativo", true)
      .is("deleted_at", null)
      .limit(40);
    if (error) throw new Error("context_unavailable");
    ctx.catalogo = projects ?? [];
  }

  if (data.action === "analise_funil") {
    const { data: snapshot, error } = await supabase.rpc("pipeline_snapshot_v2", {
      _corretor_id: userId,
    });
    if (error) throw new Error("context_unavailable");
    ctx.funil = Object.fromEntries(
      (snapshot ?? []).map((stage) => [stage.etapa, stage.quantidade]),
    );
  }

  if (data.action === "prioridade_dia") {
    const { data: inboxRows, error } = await supabase.rpc("atendimento_inbox_v2", {
      _corretor_id: userId,
      _limit_per_queue: 10,
    });
    if (error) throw new Error("context_unavailable");
    const inbox = parseAtendimentoInbox(inboxRows ?? []);
    ctx.fila = Object.values(inbox.filas)
      .flat()
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((item) => ({
        primeiro_nome: firstNameForSamiQ(item.lead.nome),
        status: item.lead.status,
        temperatura: item.lead.temperatura,
        projeto: item.lead.projeto_nome,
        score: item.score,
        motivo: item.motivo,
      }));
  }

  return ctx;
}
