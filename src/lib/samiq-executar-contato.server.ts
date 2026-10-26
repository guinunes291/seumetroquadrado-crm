// Executor da Sami — contato, anotação, tarefa e qualificação da ficha.
// Recortado de samiq-executar.server.ts sem mudança de comportamento.

import { fmtDataHoraSP } from "@/lib/samiq-datas";
import { conteudoContato } from "@/lib/samiq-propostas";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  type ResultadoExecucao,
  paraJson,
  erroDb,
  carregarLead,
  auxiliar,
  tarefasAbertasDoLead,
  estadoDepoisDaTarefa,
  fichaDepois,
  CAMPOS_QUALIFICACAO_COLUNA,
  type AcaoCtx,
  type PayloadDe,
} from "./samiq-executar-base.server";
import {
  tarefaAbertaNoMesmoHorario,
  unirObjecoes,
  marcarViaSami,
  registrarContatoOficial,
  textoLotado,
} from "./samiq-executar-apoio.server";

export async function executarRegistrarContato(
  c: AcaoCtx,
  payload: PayloadDe<"registrar_contato">,
): Promise<ResultadoExecucao> {
  const { supabase, marca } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  const followup = payload.followupEm ? new Date(payload.followupEm).toISOString() : null;
  // Sem data dita, o CRM escolhe o follow-up (amanhã) e pode reaproveitar
  // uma tarefa que o corretor já tinha: guarda TODAS as abertas antes.
  const antes = await tarefasAbertasDoLead(supabase, lead.id);
  const out = await registrarContatoOficial(supabase, {
    leadId: lead.id,
    canal: payload.canal,
    resultado: payload.resultado,
    conteudo: conteudoContato(payload),
    proximaAcao: payload.proximoPasso,
    proximoFollowup: followup,
    criarTarefa: true,
  });
  const resultado: ResultadoExecucao = {
    interacao_id: out.interacao_id,
    lead_id: lead.id,
    etapa_anterior: lead.status,
    etapa_nova: out.status ?? lead.status,
  };
  if (out.tarefa_id) {
    const existia = antes.find((t) => t.id === out.tarefa_id);
    if (existia) {
      resultado.tarefa_atualizada_id = out.tarefa_id;
      resultado.tarefa_anterior = paraJson(existia);
      resultado.tarefa_depois = await estadoDepoisDaTarefa(supabase, out.tarefa_id);
    } else {
      resultado.tarefa_id = out.tarefa_id;
    }
  }
  const avisos: string[] = [];
  if (out.interacao_id) {
    const interacaoId = out.interacao_id;
    await auxiliar(avisos, "marca via Sami", () =>
      marcarViaSami(supabase, interacaoId, marca, {
        origem: "registrar_contato",
        resultado: payload.resultado,
      }),
    );
  }
  // Cadência D0 a D3: a tentativa sem resposta também conta na régua
  // (2 ligações + 1 WhatsApp por dia), como na Fila da Cadência.
  if (
    payload.resultado === "nao_atendeu" &&
    ["D0", "D1", "D2", "D3"].includes(lead.cadencia_etapa ?? "") &&
    (payload.canal === "ligacao" || payload.canal === "whatsapp")
  ) {
    await auxiliar(avisos, "cadência", async () => {
      const { error } = await supabase.rpc("cadencia_registrar_tentativa", {
        _lead_id: lead.id,
        _canal: payload.canal,
        _resultado: payload.canal === "ligacao" ? "nao_atendeu" : "enviada",
      });
      if (error) erroDb("tentativa da cadência", error);
      resultado.cadencia_tentativa = true;
    });
  }
  if (payload.objecoes?.length) {
    const objecoes = payload.objecoes;
    await auxiliar(avisos, "objeções", async () => {
      const obj = await unirObjecoes(supabase, lead, objecoes);
      if (obj.alterou) {
        resultado.lead_anterior = { objecoes: obj.anterior };
        resultado.lead_depois = await fichaDepois(supabase, lead.id, ["objecoes"]);
      }
    });
  }
  const efeitos: string[] = [];
  if (out.entrou) efeitos.push("entrou em Em atendimento");
  else if (out.moveu) efeitos.push("foi para Aguardando retorno");
  if (out.lotado) {
    efeitos.push(textoLotado(out.lotado));
    resultado.lotado = out.lotado as Json;
  }
  if (resultado.cadencia_tentativa)
    efeitos.push(`tentativa contada na cadência (${lead.cadencia_etapa})`);
  if (out.tarefa_id && followup) efeitos.push(`follow-up ${fmtDataHoraSP(followup)}`);
  if (avisos.length) resultado.avisos = avisos;
  resultado.efeito = efeitos.join("; ") || null;
  return resultado;
}

export async function executarAnotar(
  c: AcaoCtx,
  payload: PayloadDe<"anotar">,
): Promise<ResultadoExecucao> {
  const { supabase, userId, metadata } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  const { data, error } = await supabase
    .from("interacoes")
    .insert({
      lead_id: lead.id,
      autor_id: userId,
      tipo: "nota",
      direcao: "interna",
      titulo: "Anotação via Sami",
      conteudo: payload.nota.trim(),
      metadata,
    })
    .select("id")
    .single();
  if (error) erroDb("Não foi possível gravar a anotação", error);
  return { interacao_id: data.id, lead_id: lead.id, efeito: null };
}

export async function executarCriarTarefa(
  c: AcaoCtx,
  payload: PayloadDe<"criar_tarefa">,
): Promise<ResultadoExecucao> {
  const { supabase, userId } = c;
  const lead = payload.leadId ? await carregarLead(supabase, payload.leadId) : null;
  const vencimento = new Date(payload.vencimentoEm).toISOString();
  if (lead) {
    const existente = await tarefaAbertaNoMesmoHorario(supabase, lead.id, vencimento);
    if (existente) {
      const { error: updErr } = await supabase
        .from("tarefas")
        .update({
          titulo: payload.titulo.trim(),
          tipo: payload.tipoTarefa,
          prioridade:
            payload.prioridade ??
            (existente.prioridade as Database["public"]["Enums"]["tarefa_prioridade"]),
          data_vencimento: vencimento,
        })
        .eq("id", existente.id);
      if (updErr) erroDb("Não foi possível atualizar a tarefa", updErr);
      return {
        tarefa_atualizada_id: existente.id,
        lead_id: lead.id,
        tarefa_anterior: {
          id: existente.id,
          titulo: existente.titulo,
          tipo: existente.tipo,
          prioridade: existente.prioridade,
          data_vencimento: existente.data_vencimento,
        },
        tarefa_depois: await estadoDepoisDaTarefa(supabase, existente.id),
        efeito: "aproveitei a tarefa que já existia nesse horário",
      };
    }
  }
  const { data, error } = await supabase
    .from("tarefas")
    .insert({
      titulo: payload.titulo.trim(),
      tipo: payload.tipoTarefa,
      status: "pendente",
      prioridade: payload.prioridade ?? "media",
      lead_id: lead?.id ?? null,
      corretor_id: lead?.corretor_id ?? userId,
      criado_por: userId,
      data_vencimento: vencimento,
      descricao: "Registrado via Sami",
    })
    .select("id")
    .single();
  if (error) erroDb("Não foi possível criar a tarefa", error);
  return { tarefa_id: data.id, lead_id: lead?.id ?? null, efeito: null };
}

export async function executarAtualizarQualificacao(
  c: AcaoCtx,
  payload: PayloadDe<"atualizar_qualificacao">,
): Promise<ResultadoExecucao> {
  const { supabase } = c;
  const lead = await carregarLead(supabase, payload.leadId);
  const anterior: Record<string, Json> = {};
  const patch: Record<string, unknown> = {};
  for (const [campo, coluna] of Object.entries(CAMPOS_QUALIFICACAO_COLUNA)) {
    const v = (payload as Record<string, unknown>)[campo];
    if (v === undefined) continue;
    anterior[coluna] = (lead[coluna] ?? null) as Json;
    patch[coluna] = typeof v === "string" ? v.trim() || null : v;
  }
  if (payload.projetoId) {
    const { data: proj, error: pErr } = await supabase
      .from("projetos")
      .select("id, nome, construtora")
      .eq("id", payload.projetoId)
      .is("deleted_at", null)
      .maybeSingle();
    if (pErr) erroDb("Não foi possível ler o empreendimento", pErr);
    if (!proj) throw new Error("Empreendimento não encontrado.");
    anterior.projeto_id = (lead.projeto_id ?? null) as Json;
    anterior.projeto_nome = (lead.projeto_nome ?? null) as Json;
    anterior.construtora = (lead.construtora ?? null) as Json;
    patch.projeto_id = proj.id;
    patch.projeto_nome = proj.nome;
    patch.construtora = proj.construtora;
  } else if (payload.projetoInteresse !== undefined) {
    // Nome sem id: o projeto antigo não pode ficar no FK (inconsistência B.12).
    anterior.projeto_id = (lead.projeto_id ?? null) as Json;
    patch.projeto_id = null;
  }
  if (payload.objecoesAdicionar?.length) {
    const limpas = payload.objecoesAdicionar.map((o) => o.trim()).filter(Boolean);
    const faltam = limpas.filter(
      (o) => !lead.objecoes.some((a) => a.trim().toLowerCase() === o.toLowerCase()),
    );
    if (faltam.length) {
      anterior.objecoes = lead.objecoes;
      patch.objecoes = [...lead.objecoes, ...faltam].slice(0, 30);
    }
  }
  if (Object.keys(patch).length === 0) {
    return {
      lead_id: lead.id,
      sem_mudanca: true,
      efeito: "nada mudou: a ficha já tinha esses dados",
    };
  }
  const { error } = await supabase
    .from("leads")
    .update(patch as Database["public"]["Tables"]["leads"]["Update"])
    .eq("id", lead.id);
  if (error) erroDb("Não foi possível atualizar a qualificação", error);
  return {
    lead_id: lead.id,
    lead_anterior: anterior,
    lead_depois: await fichaDepois(supabase, lead.id, Object.keys(anterior)),
    campos: Object.keys(patch),
    efeito: null,
  };
}
