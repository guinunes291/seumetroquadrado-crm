// EXECUÇÃO das propostas confirmadas pelo corretor (Onda S2). É o ÚNICO lugar
// em que a Sami escreve no CRM — e escreve com a sessão do corretor (o
// `supabase` do middleware de auth), então RLS, triggers e autor valem como
// se ele tivesse feito à mão. Cada registro leva a marca `origem: 'samiq'`
// (metadata da interação; `resultado` da proposta guarda os ids e o snapshot
// do lead para o desfazer de 24 h — samiq_desfazer_proposta).
//
// Não importa o client do browser nem o admin: quem grava é o corretor.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { followUpParaStatus } from "@/lib/follow-up";
import type { LeadStatus } from "@/lib/leads";
import {
  RESULTADOS_CONTATO,
  conteudoContato,
  fimDaVisita,
  metadataViaSami,
  tituloVisita,
  type PropostaPayload,
} from "@/lib/samiq-propostas";

type Db = SupabaseClient<Database>;

export type ResultadoExecucao = Record<string, Json | undefined>;

export type ExecutarArgs = {
  supabase: Db;
  userId: string;
  propostaId: string;
  executionId: string | null;
  payload: PropostaPayload;
  agora?: Date;
};

const DIA_MS = 24 * 60 * 60 * 1000;

function erroDb(contexto: string, error: { message?: string; code?: string } | null): never {
  const detalhe = error?.message ? ` (${error.message.slice(0, 120)})` : "";
  throw new Error(`${contexto}${detalhe}`);
}

type LeadAtual = {
  id: string;
  nome: string;
  corretor_id: string | null;
  status: string;
  objecoes: string[];
  renda_informada: string | null;
  entrada_disponivel: string | null;
  usa_fgts: boolean;
  tem_fgts: boolean | null;
  tipo_renda: string | null;
  temperatura: string | null;
  projeto_nome: string | null;
  resumo_qualificacao: string | null;
};

async function carregarLead(supabase: Db, leadId: string): Promise<LeadAtual> {
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, nome, corretor_id, status, objecoes, renda_informada, entrada_disponivel, usa_fgts, tem_fgts, tipo_renda, temperatura, projeto_nome, resumo_qualificacao",
    )
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) erroDb("Não foi possível ler o cliente", error);
  if (!data) throw new Error("Cliente não encontrado na sua carteira.");
  return { ...data, objecoes: data.objecoes ?? [] };
}

/**
 * Mesma regra de garantirFollowUpAberto (lib/follow-up.ts), com o client do
 * corretor: dedup por (lead, tipo, ±1 dia) — atualiza a aberta ou cria nova.
 * Devolve o id só quando CRIOU (é o que o desfazer pode apagar).
 */
async function garantirFollowUp(
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
): Promise<{ criou: boolean; tarefaId: string | null }> {
  const vencMs = Date.parse(args.vencimento);
  const { data: abertas, error: selErr } = await supabase
    .from("tarefas")
    .select("id")
    .eq("lead_id", args.leadId)
    .eq("tipo", args.tipo)
    .in("status", ["pendente", "em_andamento"])
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
    return { criou: false, tarefaId: abertas[0].id };
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

async function unirObjecoes(
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

export async function executarPropostaSamiQ(args: ExecutarArgs): Promise<ResultadoExecucao> {
  const { supabase, userId, payload } = args;
  const agora = args.agora ?? new Date();
  const metadata = metadataViaSami({ executionId: args.executionId, propostaId: args.propostaId });

  switch (payload.tipo) {
    case "registrar_contato": {
      const lead = await carregarLead(supabase, payload.leadId);
      const { data: interacao, error } = await supabase
        .from("interacoes")
        .insert({
          lead_id: lead.id,
          autor_id: userId,
          tipo: payload.canal,
          direcao: "saida",
          titulo: RESULTADOS_CONTATO[payload.resultado],
          conteudo: conteudoContato(payload),
          metadata,
        })
        .select("id")
        .single();
      if (error) erroDb("Não foi possível registrar o contato", error);
      const resultado: ResultadoExecucao = { interacao_id: interacao.id, lead_id: lead.id };

      if (payload.followupEm) {
        const fu = await garantirFollowUp(supabase, {
          leadId: lead.id,
          tipo: "follow_up",
          titulo: `Follow-up com ${lead.nome}`,
          prioridade: "media",
          vencimento: new Date(payload.followupEm).toISOString(),
          corretorId: lead.corretor_id ?? userId,
          criadoPorId: userId,
        });
        if (fu.criou) resultado.tarefa_id = fu.tarefaId;
        else resultado.tarefa_atualizada_id = fu.tarefaId;
      }
      if (payload.objecoes?.length) {
        const obj = await unirObjecoes(supabase, lead, payload.objecoes);
        if (obj.alterou) resultado.lead_anterior = { objecoes: obj.anterior };
      }
      return resultado;
    }

    case "anotar": {
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
      return { interacao_id: data.id, lead_id: lead.id };
    }

    case "criar_tarefa": {
      const lead = payload.leadId ? await carregarLead(supabase, payload.leadId) : null;
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
          data_vencimento: new Date(payload.vencimentoEm).toISOString(),
          descricao: "Registrado via Sami",
        })
        .select("id")
        .single();
      if (error) erroDb("Não foi possível criar a tarefa", error);
      return { tarefa_id: data.id, lead_id: lead?.id ?? null };
    }

    case "atualizar_qualificacao": {
      const lead = await carregarLead(supabase, payload.leadId);
      const anterior: Record<string, Json> = {};
      const patch: Database["public"]["Tables"]["leads"]["Update"] = {};
      if (payload.rendaInformada !== undefined) {
        anterior.renda_informada = lead.renda_informada;
        patch.renda_informada = payload.rendaInformada || null;
      }
      if (payload.entradaDisponivel !== undefined) {
        anterior.entrada_disponivel = lead.entrada_disponivel;
        patch.entrada_disponivel = payload.entradaDisponivel || null;
      }
      if (payload.usaFgts !== undefined) {
        anterior.usa_fgts = lead.usa_fgts;
        patch.usa_fgts = payload.usaFgts;
      }
      if (payload.temFgts !== undefined) {
        anterior.tem_fgts = lead.tem_fgts;
        patch.tem_fgts = payload.temFgts;
      }
      if (payload.tipoRenda !== undefined) {
        anterior.tipo_renda = lead.tipo_renda;
        patch.tipo_renda = payload.tipoRenda || null;
      }
      if (payload.temperatura !== undefined) {
        anterior.temperatura = lead.temperatura;
        patch.temperatura = payload.temperatura;
      }
      if (payload.projetoInteresse !== undefined) {
        anterior.projeto_nome = lead.projeto_nome;
        patch.projeto_nome = payload.projetoInteresse || null;
      }
      if (payload.resumoQualificacao !== undefined) {
        anterior.resumo_qualificacao = lead.resumo_qualificacao;
        patch.resumo_qualificacao = payload.resumoQualificacao || null;
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
        return { lead_id: lead.id, sem_mudanca: true };
      }
      const { error } = await supabase.from("leads").update(patch).eq("id", lead.id);
      if (error) erroDb("Não foi possível atualizar a qualificação", error);
      return { lead_id: lead.id, lead_anterior: anterior, campos: Object.keys(patch) };
    }

    case "agendar_visita": {
      const lead = await carregarLead(supabase, payload.leadId);
      const inicio = new Date(payload.inicioEm);
      if (Number.isNaN(inicio.getTime())) throw new Error("Data da visita inválida.");
      if (inicio.getTime() < agora.getTime() - 60_000) {
        throw new Error("A data da visita já passou.");
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
      const mover = payload.moverParaAgendado !== false && lead.status !== "agendado";
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
          const fu = await garantirFollowUp(supabase, {
            leadId: lead.id,
            tipo: tpl.tipo,
            titulo: tpl.titulo,
            prioridade: tpl.prioridade,
            vencimento: tpl.vencimento,
            corretorId: lead.corretor_id ?? userId,
            criadoPorId: userId,
          });
          if (fu.criou) resultado.tarefa_id = fu.tarefaId;
        }
      }
      return resultado;
    }

    case "mudar_etapa": {
      const lead = await carregarLead(supabase, payload.leadId);
      const novo = payload.novoStatus as LeadStatus;
      const tpl = followUpParaStatus(novo, { nome: lead.nome, agora });
      const followup = payload.proximoFollowupEm
        ? new Date(payload.proximoFollowupEm).toISOString()
        : (tpl?.vencimento ?? undefined);
      const { error } = await supabase.rpc("transicionar_lead", {
        p_lead_id: lead.id,
        p_novo_status: novo,
        p_motivo: payload.motivo?.trim() || undefined,
        p_proxima_acao: payload.proximaAcao?.trim() || tpl?.titulo || undefined,
        p_proximo_followup: followup,
        ...(payload.motivoCategoria ? { p_motivo_categoria: payload.motivoCategoria } : {}),
      });
      if (error) erroDb("O funil recusou a mudança de etapa", error);
      const resultado: ResultadoExecucao = {
        lead_id: lead.id,
        etapa_anterior: lead.status,
        etapa_nova: novo,
      };
      if (tpl) {
        const fu = await garantirFollowUp(supabase, {
          leadId: lead.id,
          tipo: tpl.tipo,
          titulo: tpl.titulo,
          prioridade: tpl.prioridade,
          vencimento: followup ?? tpl.vencimento,
          corretorId: lead.corretor_id ?? userId,
          criadoPorId: userId,
        });
        if (fu.criou) resultado.tarefa_id = fu.tarefaId;
      }
      return resultado;
    }
  }
}
