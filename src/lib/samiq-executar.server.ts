// EXECUÇÃO das ações da Sami (Onda S2 → v8 "CRM no WhatsApp"). É o ÚNICO
// lugar em que a Sami escreve no CRM — e escreve com a SESSÃO DO CORRETOR (o
// `supabase` que o canal abre com o JWT dele), então RLS, triggers e autor
// valem como se ele tivesse feito à mão.
//
// Regra da v8: cada movimento usa a MESMA porta oficial da tela —
// registrar_contato_lead, registrar_retorno_lead, marcar_lead_perdido_v2,
// trocar_vaga_em_atendimento, salvar_modo_visita, presenca_checkin,
// criar_lead_dedup, prospeccao_pedir_lote, transicionar_lead — para a Sami
// nunca ter um efeito diferente do botão (Em atendimento por consequência,
// teto dos 65, cadência, redistribuição na perda, retorno de 30 dias...).
//
// Ordem dentro de cada ação: o passo principal primeiro; os auxiliares
// (marca "via Sami", objeções, tarefa do próximo passo) depois e sem derrubar
// a ação. Assim uma falha no meio não deixa metade gravado com status
// "falhou" (que, reconfirmado, duplicaria o que já entrou).
//
// `resultado` guarda os ids e o snapshot ANTES da escrita: é o que o
// samiq_desfazer_proposta usa no desfazer de 24 h. `efeito` é o resumo
// humano do que aconteceu de fato (vai para o modelo e para o recibo).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { followUpParaStatus } from "@/lib/follow-up";
import { LEAD_STATUS_LABEL, transicaoLeadPermitida, type LeadStatus } from "@/lib/leads";
import { checklistPorPerfil, docLabel, type PerfilRenda } from "@/lib/documentacao-checklist";
import { diaSP, fmtDataHoraSP, mesesPrevisaoSP } from "@/lib/samiq-datas";
import {
  RESULTADOS_CONTATO,
  conteudoContato,
  fimDaVisita,
  mensagemEtapaNaoAplicada,
  SAMIQ_JANELA_MESMA_TAREFA_MS,
  tarefaNoMesmoHorario,
  metadataViaSami,
  tituloVisita,
  type PropostaPayload,
} from "@/lib/samiq-propostas";
import { anexarArquivoDoWhatsApp } from "./samiq-anexos.server";

type Db = SupabaseClient<Database>;

export type ResultadoExecucao = Record<string, Json | undefined>;

/** O que o turno sabe e a ação pode precisar (v8): a localização mandada no WhatsApp. */
export type ContextoExecucao = {
  localizacao?: { latitude: number; longitude: number; precisao?: number | null } | null;
};

export type ExecutarArgs = {
  supabase: Db;
  userId: string;
  propostaId: string;
  executionId: string | null;
  payload: PropostaPayload;
  agora?: Date;
  contexto?: ContextoExecucao;
};

const DIA_MS = 24 * 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;

function erroDb(contexto: string, error: { message?: string; code?: string } | null): never {
  const detalhe = error?.message ? ` (${error.message.slice(0, 140)})` : "";
  throw new Error(`${contexto}${detalhe}`);
}

function rotuloEtapa(s: string | null | undefined): string {
  return LEAD_STATUS_LABEL[(s ?? "") as LeadStatus] ?? s ?? "";
}

const LEAD_COLS =
  "id, nome, corretor_id, status, cadencia_etapa, objecoes, renda_informada, renda_estimada, entrada_disponivel, usa_fgts, tem_fgts, fgts_valor, tipo_renda, faixa_mcmv, temperatura, decisor, zona, bairro, dorms_desejados, precisa_vaga, prioridades, nota_perfil_cliente, projeto_id, projeto_nome, construtora, resumo_qualificacao";

type LeadAtual = {
  id: string;
  nome: string;
  corretor_id: string | null;
  status: string;
  cadencia_etapa: string | null;
  objecoes: string[];
  [coluna: string]: unknown;
};

async function carregarLead(supabase: Db, leadId: string): Promise<LeadAtual> {
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_COLS)
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) erroDb("Não foi possível ler o cliente", error);
  if (!data) throw new Error("Cliente não encontrado na sua carteira.");
  return { ...data, objecoes: data.objecoes ?? [] } as LeadAtual;
}

async function statusAtual(supabase: Db, leadId: string): Promise<string | null> {
  const { data } = await supabase.from("leads").select("status").eq("id", leadId).maybeSingle();
  return data?.status ?? null;
}

/**
 * Tarefa aberta do lead no mesmo horário (±2 h), de QUALQUER tipo. Evita que
 * follow-up automático, follow-up do contato e tarefa explícita virem 2 ou 3
 * tarefas para o mesmo compromisso.
 */
async function tarefaAbertaNoMesmoHorario(
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
  const mesmoHorario = await tarefaAbertaNoMesmoHorario(supabase, args.leadId, args.vencimento);
  if (mesmoHorario) {
    if (mesmoHorario.data_vencimento !== args.vencimento) {
      const { error } = await supabase
        .from("tarefas")
        .update({ data_vencimento: args.vencimento })
        .eq("id", mesmoHorario.id);
      if (error) erroDb("Não foi possível atualizar o follow-up", error);
    }
    return { criou: false, tarefaId: mesmoHorario.id };
  }
  const vencMs = Date.parse(args.vencimento);
  const { data: abertas, error: selErr } = await supabase
    .from("tarefas")
    .select("id")
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

/** Auxiliar que nunca derruba a ação: devolve o aviso em vez de lançar. */
async function auxiliar(avisos: string[], rotulo: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    avisos.push(`${rotulo}: ${e instanceof Error ? e.message.slice(0, 120) : "falhou"}`);
  }
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

/**
 * A interação criada por uma RPC oficial (registrar_contato_lead) já tem a
 * origem dela; aqui só acrescenta a marca "via Sami" (timeline e auditoria),
 * sem apagar a origem oficial que métricas e telas leem.
 */
async function marcarViaSami(
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

type ContatoRpc = {
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
async function registrarContatoOficial(
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

/** Follow-ups abertos do lead a ±1 dia (o registrar_contato_lead reaproveita um deles). */
async function followUpsAbertosPerto(supabase: Db, leadId: string, iso: string): Promise<string[]> {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return [];
  const { data } = await supabase
    .from("tarefas")
    .select("id")
    .eq("lead_id", leadId)
    .eq("tipo", "follow_up")
    .in("status", ["pendente", "em_andamento"])
    .is("deleted_at", null)
    .gte("data_vencimento", new Date(t - DIA_MS).toISOString())
    .lte("data_vencimento", new Date(t + DIA_MS).toISOString())
    .limit(10);
  return (data ?? []).map((r) => r.id);
}

/** Duas tarefas abertas no mesmo horário exato (cadência + retorno): fica a mais nova. */
async function deduplicarTarefasNoHorario(supabase: Db, leadId: string, iso: string): Promise<void> {
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

function textoLotado(l: ContatoRpc["lotado"]): string {
  const ocupa = l?.em_atendimento;
  const teto = l?.teto;
  return `Em atendimento lotado${ocupa != null && teto != null ? ` (${ocupa} de ${teto})` : ""}: o contato ficou gravado mas o cliente não entrou; para colocar, troque a vaga com alguém (trocar_vaga)`;
}

const CAMPOS_QUALIFICACAO_COLUNA = {
  rendaInformada: "renda_informada",
  rendaEstimada: "renda_estimada",
  entradaDisponivel: "entrada_disponivel",
  usaFgts: "usa_fgts",
  temFgts: "tem_fgts",
  fgtsValor: "fgts_valor",
  tipoRenda: "tipo_renda",
  faixaMcmv: "faixa_mcmv",
  temperatura: "temperatura",
  decisor: "decisor",
  zona: "zona",
  bairro: "bairro",
  dormsDesejados: "dorms_desejados",
  precisaVaga: "precisa_vaga",
  prioridades: "prioridades",
  notaPerfil: "nota_perfil_cliente",
  projetoInteresse: "projeto_nome",
  resumoQualificacao: "resumo_qualificacao",
} as const;

export async function executarPropostaSamiQ(args: ExecutarArgs): Promise<ResultadoExecucao> {
  const { supabase, userId, payload } = args;
  const agora = args.agora ?? new Date();
  const metadata = metadataViaSami({ executionId: args.executionId, propostaId: args.propostaId });
  const marca: Record<string, Json> = {
    proposta_id: args.propostaId,
    ...(args.executionId ? { execution_id: args.executionId } : {}),
  };

  switch (payload.tipo) {
    case "registrar_contato": {
      const lead = await carregarLead(supabase, payload.leadId);
      const followup = payload.followupEm ? new Date(payload.followupEm).toISOString() : null;
      const antes = followup ? await followUpsAbertosPerto(supabase, lead.id, followup) : [];
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
        if (antes.includes(out.tarefa_id)) resultado.tarefa_atualizada_id = out.tarefa_id;
        else resultado.tarefa_id = out.tarefa_id;
      }
      const avisos: string[] = [];
      if (out.interacao_id) {
        const interacaoId = out.interacao_id;
        await auxiliar(avisos, "marca via Sami", () =>
          marcarViaSami(supabase, interacaoId, marca, { origem: "registrar_contato", resultado: payload.resultado }),
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
          if (obj.alterou) resultado.lead_anterior = { objecoes: obj.anterior };
        });
      }
      const efeitos: string[] = [];
      if (out.entrou) efeitos.push("entrou em Em atendimento");
      else if (out.moveu) efeitos.push("foi para Aguardando retorno");
      if (out.lotado) {
        efeitos.push(textoLotado(out.lotado));
        resultado.lotado = out.lotado as Json;
      }
      if (resultado.cadencia_tentativa) efeitos.push(`tentativa contada na cadência (${lead.cadencia_etapa})`);
      if (out.tarefa_id && followup) efeitos.push(`follow-up ${fmtDataHoraSP(followup)}`);
      if (avisos.length) resultado.avisos = avisos;
      resultado.efeito = efeitos.join("; ") || null;
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
      return { interacao_id: data.id, lead_id: lead.id, efeito: null };
    }

    case "criar_tarefa": {
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

    case "atualizar_qualificacao": {
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
        return { lead_id: lead.id, sem_mudanca: true, efeito: "nada mudou: a ficha já tinha esses dados" };
      }
      const { error } = await supabase
        .from("leads")
        .update(patch as Database["public"]["Tables"]["leads"]["Update"])
        .eq("id", lead.id);
      if (error) erroDb("Não foi possível atualizar a qualificação", error);
      return { lead_id: lead.id, lead_anterior: anterior, campos: Object.keys(patch), efeito: null };
    }

    case "agendar_visita": {
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
            if (fu.criou) resultado.tarefa_id = fu.tarefaId;
          });
          if (avisos.length) resultado.avisos = avisos;
        }
      }
      resultado.efeito = `visita ${fmtDataHoraSP(inicio.toISOString())}${mover ? "; cliente em Agendado" : ""}`;
      return resultado;
    }

    case "mudar_etapa": {
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
          if (fu.criou) resultado.tarefa_id = fu.tarefaId;
        });
        if (avisos.length) resultado.avisos = avisos;
      }
      return resultado;
    }

    case "registrar_retorno": {
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
          payload.nota?.trim() || (payload.desfecho === "esfriou" ? "Cliente esfriou" : "Pediu retorno"),
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
          marcarViaSami(supabase, interacaoId, marca, { origem: "registrar_contato", resultado: "pediu_retorno" }),
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
        if (fu.criou) resultado.tarefa_id = fu.tarefaId;
        resultado.etapa_nova = (await statusAtual(supabase, lead.id)) ?? lead.status;
        resultado.efeito = `contato gravado e tarefa de retorno ${fmtDataHoraSP(retorno)}; o funil não levou para Aguardando retorno (${(rErr.message ?? "").slice(0, 100)})${
          contato.lotado ? `; ${textoLotado(contato.lotado)}` : ""
        }`;
        return resultado;
      }
      const out = (r ?? {}) as { destino?: string; proprio?: boolean };
      await auxiliar(avisos, "tarefa duplicada", () => deduplicarTarefasNoHorario(supabase, lead.id, retorno));
      resultado.etapa_nova = out.destino === "perdido" ? "perdido" : "aguardando_retorno";
      resultado.efeito =
        out.destino === "perdido"
          ? "retorno a mais de 30 dias: virou perda 'retorno futuro' e volta pela reativação perto da data"
          : `em Aguardando retorno, tarefa ${fmtDataHoraSP(retorno)}${payload.desfecho === "esfriou" ? ", cliente frio" : ""}`;
      if (avisos.length) resultado.avisos = avisos;
      return resultado;
    }

    case "marcar_perdido": {
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

    case "trocar_vaga": {
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

    case "concluir_tarefa":
    case "reagendar_tarefa":
    case "cancelar_tarefa": {
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
      return { tarefa_atualizada_id: t.id, tarefa_anterior: anterior, lead_id: t.lead_id, efeito };
    }

    case "confirmar_visita":
    case "cancelar_visita": {
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
      if (error) erroDb(confirmar ? "Não foi possível confirmar a visita" : "Não foi possível cancelar a visita", error);
      const resultado: ResultadoExecucao = {
        agendamento_anterior: { id: a.id, status: a.status, motivo_cancelamento: a.motivo_cancelamento },
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
                  ? { status: "concluida", data_conclusao: agora.toISOString(), resultado: "Visita confirmada" }
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

    case "remarcar_visita": {
      const { data: a, error: aErr } = await supabase
        .from("agendamentos")
        .select("id, status, lead_id, corretor_id, titulo, descricao, local, tipo, data_inicio, data_fim, lembrete_minutos, lead:leads(id, nome)")
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
        await supabase.from("agendamentos").update({ deleted_at: new Date().toISOString() }).eq("id", nova.id);
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
            if (fu.criou) resultado.tarefa_id = fu.tarefaId;
          });
          if (avisos.length) resultado.avisos = avisos;
        }
      }
      return resultado;
    }

    case "registrar_visita": {
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
        const quando = payload.realizadaEm ? new Date(payload.realizadaEm) : new Date(agora.getTime() - HORA_MS);
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
        (payload.compareceu ? "visita_realizada" : payload.reagendarPara ? "agendado" : "aguardando_retorno")) as LeadStatus;
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
        p_reagendar_para: payload.reagendarPara ? new Date(payload.reagendarPara).toISOString() : undefined,
      });
      if (vErr) {
        if (autoGerado) {
          await supabase.from("agendamentos").update({ deleted_at: new Date().toISOString() }).eq("id", autoGerado);
        }
        erroDb("O CRM recusou o resultado da visita", vErr);
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
          if (fu.criou) resultado.tarefa_id = fu.tarefaId;
        });
      }
      if (avisos.length) resultado.avisos = avisos;
      resultado.efeito = `${payload.compareceu ? "visita realizada" : "não compareceu"}; cliente em ${rotuloEtapa(
        String(resultado.etapa_nova),
      )}${payload.reagendarPara ? `; nova visita ${fmtDataHoraSP(payload.reagendarPara)}` : ""}`;
      return resultado;
    }

    case "documentos_checklist": {
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
        .insert(faltam.map((tipo) => ({ lead_id: lead.id, corretor_id: lead.corretor_id, tipo, status: "pendente" })))
        .select("id");
      if (error) erroDb("Não foi possível montar o checklist", error);
      return {
        lead_id: lead.id,
        documentacao_ids: (criados ?? []).map((d) => d.id),
        efeito: `${faltam.length} documentos no checklist: ${faltam.map(docLabel).join(", ")}`.slice(0, 400),
      };
    }

    case "atualizar_documento": {
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
            ...(payload.observacao !== undefined ? { observacoes: payload.observacao.trim() || null } : {}),
            ...(recebe && !doc.recebido_em ? { recebido_em: agora.toISOString() } : {}),
          })
          .eq("id", doc.id);
        if (error) erroDb("Não foi possível atualizar o documento", error);
        resultado.documento_anterior = { id: doc.id, status: doc.status, observacoes: doc.observacoes, recebido_em: doc.recebido_em };
      }
      const depois = await statusAtual(supabase, lead.id);
      resultado.efeito = `${docLabel(payload.documento)}: ${payload.status}${
        depois && depois !== lead.status ? `; pasta montada, cliente foi para ${rotuloEtapa(depois)}` : ""
      }`;
      return resultado;
    }

    case "anexar_documento": {
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
          depois && depois !== lead.status ? `; pasta montada, cliente foi para ${rotuloEtapa(depois)}` : ""
        }`,
      };
    }

    case "enviar_analise_credito": {
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
          if (fu.criou) resultado.tarefa_id = fu.tarefaId;
        });
      }
      if (avisos.length) resultado.avisos = avisos;
      resultado.efeito = `cliente em Análise de crédito (${rotuloSit.toLowerCase()}); cobrança ${fmtDataHoraSP(tpl?.vencimento)}`;
      return resultado;
    }

    case "registrar_resultado_credito": {
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
        payload.valorFinanciamento ? `Financiamento R$ ${payload.valorFinanciamento.toLocaleString("pt-BR")}` : null,
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

    case "registrar_venda": {
      const lead = await carregarLead(supabase, payload.leadId);
      if (!lead.corretor_id) throw new Error("Venda exige cliente com corretor responsável.");
      if (payload.dataAssinatura > diaSP(agora)) throw new Error("A data de assinatura não pode ser futura.");
      if (!mesesPrevisaoSP(agora).includes(payload.previsaoRecebimento)) {
        throw new Error("O mês previsto para recebimento tem de estar nos próximos 12 meses (a partir do mês que vem).");
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

    case "fazer_checkin": {
      if (payload.modo === "sair") {
        const { error } = await supabase.rpc("marcar_presenca", { _presente: false });
        if (error) erroDb("Não foi possível encerrar a presença", error);
        return { efeito: "presença de hoje encerrada; você sai da roleta" };
      }
      const loc = args.contexto?.localizacao ?? null;
      const { data, error } = await supabase.rpc("presenca_checkin", {
        _modo: payload.modo,
        ...(payload.modo === "loja" ? { _filial: payload.filial } : {}),
        ...(payload.modo === "loja" && loc
          ? {
              _latitude: loc.latitude,
              _longitude: loc.longitude,
              ...(loc.precisao != null ? { _precisao_m: loc.precisao } : {}),
            }
          : {}),
        ...(payload.modo === "loja" && !loc ? { _falha_localizacao: "indisponivel" } : {}),
      });
      if (error) erroDb("O CRM recusou o check-in", error);
      const st = (data ?? {}) as { checkin?: { apto_roleta?: boolean; motivo?: string | null } | null };
      const apto = st.checkin?.apto_roleta === true;
      const motivo = st.checkin?.motivo ?? null;
      const explicacao =
        motivo === "sem_localizacao"
          ? "sem localização: mande sua localização pelo WhatsApp (clipe, Localização) e peça o check-in de novo"
          : motivo === "fora_da_filial"
            ? "a localização ficou fora do raio da filial"
            : motivo === "casa_abaixo_minimo_vendas"
              ? "em casa só libera a roleta com o mínimo de vendas aprovadas no mês anterior"
              : null;
      return {
        checkin: (st.checkin ?? null) as Json,
        efeito: `check-in ${payload.modo === "casa" ? "em casa" : `na filial ${payload.filial}`}: ${
          apto ? "apto para receber leads" : `não apto para a roleta${explicacao ? ` (${explicacao})` : ""}`
        }`,
      };
    }

    case "criar_lead": {
      const { data, error } = await supabase.rpc("criar_lead_dedup", {
        _payload: {
          nome: payload.nome.trim(),
          telefone: payload.telefone.trim(),
          email: payload.email?.trim() || null,
          origem: payload.origem ?? "captacao_corretor",
          projeto_id: payload.projetoId ?? null,
          projeto_nome: payload.projetoNome?.trim() || null,
          bairro: payload.bairro?.trim() || null,
          zona: payload.zona?.trim() || null,
          observacoes: [payload.observacoes?.trim(), "Cadastrado via Sami"].filter(Boolean).join("\n"),
          corretor_id: userId,
          status: "aguardando_atendimento",
        },
      });
      if (error) erroDb("O CRM recusou o cadastro", error);
      const out = (data ?? {}) as { duplicado?: boolean; lead_id?: string; na_carteira?: boolean; nome?: string | null };
      if (out.duplicado) {
        throw new Error(
          out.na_carteira
            ? `Esse telefone já é do cliente ${out.nome ?? ""} na sua carteira; nada foi criado.`.replace("  ", " ")
            : "Esse telefone já existe no CRM em outra carteira; nada foi criado. Fale com o gestor.",
        );
      }
      return {
        lead_id: out.lead_id ?? null,
        efeito: "cliente cadastrado na sua carteira (Aguardando atendimento, entra na cadência)",
      };
    }

    case "pedir_lote": {
      const { data, error } = await supabase.rpc("prospeccao_pedir_lote", { _zona: payload.zona });
      if (error) erroDb("O CRM recusou o lote", error);
      const out = (data ?? {}) as { ok?: boolean; motivo?: string; quantidade?: number; total?: number };
      if (out.ok === false) {
        const motivos: Record<string, string> = {
          so_corretor: "só corretor pede lote",
          lote_em_andamento: "você já tem um lote em andamento",
          carteira_cheia: "sua carteira está sem vaga",
          sem_regiao: "seu cadastro está sem região",
          zona_fora_da_regiao: "essa zona é fora da sua região",
          zona_vazia: "não há leads disponíveis nessa zona agora",
        };
        throw new Error(`Lote não liberado: ${motivos[out.motivo ?? ""] ?? out.motivo ?? "motivo não informado"}.`);
      }
      const n = out.quantidade ?? out.total ?? null;
      return { lote: (data ?? null) as Json, efeito: `lote liberado${n ? `: ${n} leads` : ""} na zona ${payload.zona}` };
    }
  }
}
