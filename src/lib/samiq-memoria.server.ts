// Memória persistida da Sami (decisão D11): cada turno (pergunta + resposta)
// vai para samiq_conversas/samiq_conversa_mensagens pela RPC
// samiq_gravar_turno (service_role). Regras:
//  * PII redigida AQUI, antes de sair do servidor — telefone, CPF, e-mail,
//    endereço e banco nunca chegam ao banco; nomes de cliente ficam (D12).
//  * Memória nunca derruba a resposta: erro (ou migration ausente) vira log
//    e `null`, e o painel segue sem conversaId.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";
import { isMissingBackendObject } from "@/lib/supabase-errors";
import { redactSamiQPii } from "@/lib/samiq-governance";
import type { SamiQCanal } from "@/lib/samiq";
import { deveRetomarConversa } from "@/lib/samiq-memoria";
import { PropostaPayloadSchema, type PropostaSamiQ } from "@/lib/samiq-propostas";
import type { PropostaColetada } from "@/lib/samiq-propostas.server";
import { samiqRpc, type SamiQGravarTurnoArgs } from "@/lib/samiq-rpc-args";
import {
  conversasComContexto,
  lerContexto,
  type ContextoConversaSamiQ,
} from "@/lib/samiq-contexto";

export const SAMIQ_MAX_TURNO_CHARS = 6000;

export async function gravarTurnoSamiQ(args: {
  userId: string;
  conversaId?: string | null;
  leadId?: string | null;
  pergunta: string;
  resposta: string;
  ferramentas?: string[];
  executionId?: string | null;
  /** Canal da conversa (Onda S4). Ausente = painel, a assinatura antiga da RPC. */
  canal?: SamiQCanal;
}): Promise<string | null> {
  const pergunta = redactSamiQPii(args.pergunta, SAMIQ_MAX_TURNO_CHARS).trim();
  const resposta = redactSamiQPii(args.resposta, SAMIQ_MAX_TURNO_CHARS).trim();
  if (!pergunta || !resposta) return args.conversaId ?? null;

  try {
    // Contrato da RPC (migration S1/S4): _conversa_id e _lead_id NÃO têm
    // DEFAULT — a chave precisa ir no corpo, com null quando não há valor.
    // Omitir (undefined) faz o PostgREST não achar a função (PGRST202) e o
    // turno some em silêncio. As formas nulas e o _canal vivem em
    // src/lib/samiq-rpc-args.ts (types.ts é gerado e não aceita mais edição
    // manual): se algo divergir, é lá que se repõe — nunca trocando null por
    // undefined aqui.
    type TurnoArgs = SamiQGravarTurnoArgs;
    const base: TurnoArgs = {
      _user_id: args.userId,
      _conversa_id: args.conversaId ?? null,
      _lead_id: args.leadId ?? null,
      _pergunta: pergunta,
      _resposta: resposta,
      _ferramentas: (args.ferramentas ?? []).slice(0, 20),
      _execution_id: args.executionId ?? null,
    };
    // Só o WhatsApp envia _canal; se a assinatura nova (migration S4) ainda
    // não está no ar, grava sem o canal em vez de perder o turno.
    const comCanal = args.canal !== undefined && args.canal !== "painel";
    const rpc = samiqRpc(supabaseAdmin);
    const rpcTurno = (payload: TurnoArgs) => rpc("samiq_gravar_turno", payload);
    let { data, error } = await rpcTurno(comCanal ? { ...base, _canal: args.canal } : base);
    if (error && comCanal && isMissingBackendObject(error)) {
      ({ data, error } = await rpcTurno(base));
    }
    if (error) {
      if (!isMissingBackendObject(error)) {
        console.error(JSON.stringify({ event: "samiq_memoria_failed", code: error.code ?? "" }));
      }
      return null;
    }
    return typeof data === "string" ? data : null;
  } catch {
    console.error(JSON.stringify({ event: "samiq_memoria_failed", code: "exception" }));
    return null;
  }
}

/**
 * Onda S2: grava as propostas empilhadas no turno como 'pendente'
 * (samiq_registrar_propostas, service_role) e devolve-as já com id para o
 * card. Se a migration S2 ainda não chegou, devolve [] — o texto da Sami já
 * avisou que "preparou"; sem card, o corretor registra à mão como antes.
 */
export async function registrarPropostasSamiQ(args: {
  userId: string;
  executionId: string | null;
  conversaId: string | null;
  coletadas: PropostaColetada[];
}): Promise<PropostaSamiQ[]> {
  if (args.coletadas.length === 0) return [];
  const out: PropostaSamiQ[] = [];
  // A RPC aceita até 10 por chamada (S2); a v8 permite 20 ações por resposta.
  for (let i = 0; i < Math.min(args.coletadas.length, 20); i += 10) {
    const lote = args.coletadas.slice(i, i + 10);
    const itens = lote.map((c) => ({
      tipo: c.payload.tipo,
      payload: JSON.parse(JSON.stringify(c.payload)) as Json,
      lead_id: c.leadId,
      lead_nome: c.leadNome,
    }));
    try {
      // Mesma regra da gravação do turno: _execution_id/_conversa_id vão como
      // null, nunca omitidos (assinatura da S2 sem DEFAULT).
      const { data, error } = await samiqRpc(supabaseAdmin)("samiq_registrar_propostas", {
        _user_id: args.userId,
        _execution_id: args.executionId ?? null,
        _conversa_id: args.conversaId ?? null,
        _propostas: itens,
      });
      if (error) {
        if (!isMissingBackendObject(error)) {
          console.error(
            JSON.stringify({ event: "samiq_propostas_failed", code: error.code ?? "" }),
          );
        }
        break;
      }
      const ids = Array.isArray(data) ? data : [];
      out.push(
        ...lote.slice(0, ids.length).map((c, j) => ({
          id: String(ids[j]),
          tipo: c.payload.tipo,
          payload: c.payload,
          leadNome: c.leadNome,
          status: "pendente" as const,
        })),
      );
    } catch {
      console.error(JSON.stringify({ event: "samiq_propostas_failed", code: "exception" }));
      break;
    }
  }
  return out;
}

/**
 * v8: memória de trabalho da conversa (samiq_conversas.contexto). Falha de
 * leitura vira contexto vazio: a Sami segue, só sem a numeração/os citados.
 */
export async function lerContextoDaConversaSamiQ(args: {
  userId: string;
  conversaId: string;
}): Promise<ContextoConversaSamiQ> {
  try {
    const { data, error } = await conversasComContexto(supabaseAdmin)
      .select("contexto")
      .eq("id", args.conversaId)
      .eq("user_id", args.userId)
      .maybeSingle();
    if (error || !data) return {};
    return lerContexto(data.contexto);
  } catch {
    return {};
  }
}

/**
 * v8: fecha o turno no banco — liga à conversa as ações gravadas na hora (elas
 * nascem sem conversa, porque a conversa só existe depois da resposta) e
 * guarda a memória de trabalho. Pela RPC do servidor, como o turno.
 */
export async function gravarContextoTurnoSamiQ(args: {
  userId: string;
  conversaId: string;
  executionId: string | null;
  contexto: ContextoConversaSamiQ | null;
}): Promise<boolean> {
  try {
    const { error } = await samiqRpc(supabaseAdmin)("samiq_contexto_turno", {
      _user_id: args.userId,
      _conversa_id: args.conversaId,
      _execution_id: args.executionId ?? null,
      _contexto: args.contexto ? (JSON.parse(JSON.stringify(args.contexto)) as Json) : null,
    });
    if (error) {
      if (!isMissingBackendObject(error)) {
        console.error(JSON.stringify({ event: "samiq_contexto_failed", code: error.code ?? "" }));
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Ações pelos ids, na ordem pedida (é a numeração que o corretor viu). */
export async function acoesPorIdsSamiQ(args: {
  userId: string;
  ids: string[];
}): Promise<Array<PropostaSamiQ & { decididoEm: string | null }>> {
  const ids = args.ids.slice(0, 20);
  if (ids.length === 0) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("samiq_propostas")
      .select("id, tipo, payload, lead_nome, status, desfazer_ate, erro, decidido_em")
      .eq("user_id", args.userId)
      .in("id", ids)
      .limit(20);
    if (error || !data) return [];
    const porId = new Map(data.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const row = porId.get(id);
      if (!row) return [];
      const parsed = PropostaPayloadSchema.safeParse(row.payload);
      if (!parsed.success) return [];
      return [
        {
          id: row.id,
          tipo: parsed.data.tipo,
          payload: parsed.data,
          leadNome: row.lead_nome,
          status: row.status as PropostaSamiQ["status"],
          desfazerAte: row.desfazer_ate,
          erro: row.erro,
          decididoEm: row.decidido_em,
        },
      ];
    });
  } catch {
    return [];
  }
}

/** Máximo de turnos (user+assistant) que o canal WhatsApp reenvia ao modelo. */
export const SAMIQ_HISTORICO_CANAL = 16;

/**
 * Onda S4: a conversa "viva" do corretor num canal — a última, se o último
 * turno foi há menos de 12 h (mesma regra do painel, deveRetomarConversa).
 * Serve para o WhatsApp continuar o assunto e achar as propostas pendentes.
 * Migration S4 ausente (coluna canal inexistente) → null: começa outra.
 */
export async function conversaAtivaSamiQ(args: {
  userId: string;
  canal: SamiQCanal;
  agora?: Date;
}): Promise<{ id: string; leadId: string | null } | null> {
  try {
    const query = supabaseAdmin.from("samiq_conversas").select("id, lead_id, atualizado_em");
    const { data, error } = await query
      .eq("user_id", args.userId)
      .eq("canal", args.canal)
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    if (!deveRetomarConversa(data.atualizado_em, args.agora ?? new Date())) return null;
    return { id: data.id, leadId: data.lead_id };
  } catch {
    return null;
  }
}

/**
 * Últimos turnos de uma conversa, no formato do histórico do painel (cap de
 * SAMIQ_HISTORICO_CANAL mensagens, 1200 chars cada). Já está redigido
 * (PII nunca entrou no banco).
 */
export async function historicoDaConversaSamiQ(args: {
  userId: string;
  conversaId: string;
  max?: number;
}): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const max = Math.min(Math.max(1, args.max ?? SAMIQ_HISTORICO_CANAL), SAMIQ_HISTORICO_CANAL);
  try {
    const { data, error } = await supabaseAdmin
      .from("samiq_conversa_mensagens")
      .select("papel, conteudo, criado_em")
      .eq("conversa_id", args.conversaId)
      .eq("user_id", args.userId)
      .order("criado_em", { ascending: false })
      // Pergunta e resposta do mesmo turno têm o mesmo criado_em: no desc,
      // "assistant" antes de "user" para, depois do reverse, a pergunta vir antes.
      .order("papel", { ascending: true })
      .limit(max);
    if (error || !data) return [];
    return data.reverse().map((r) => ({
      role: r.papel === "user" ? ("user" as const) : ("assistant" as const),
      content: r.conteudo.slice(0, 1200),
    }));
  } catch {
    return [];
  }
}

/**
 * Propostas ainda pendentes do corretor — por ids (botões do WhatsApp) ou da
 * conversa ativa (resposta "CONFIRMAR"). Nunca de outro corretor: filtra por
 * user_id antes de qualquer coisa.
 */
export async function propostasPendentesSamiQ(args: {
  userId: string;
  conversaId?: string | null;
  ids?: string[];
}): Promise<PropostaSamiQ[]> {
  const ids = (args.ids ?? []).slice(0, 20);
  if (ids.length === 0 && !args.conversaId) return [];
  try {
    let query = supabaseAdmin
      .from("samiq_propostas")
      .select("id, tipo, payload, lead_nome, status")
      .eq("user_id", args.userId)
      .eq("status", "pendente")
      .order("criado_em", { ascending: true })
      .limit(20);
    query = ids.length > 0 ? query.in("id", ids) : query.eq("conversa_id", args.conversaId!);
    const { data, error } = await query;
    if (error || !data) return [];
    return data.flatMap((row) => {
      const parsed = PropostaPayloadSchema.safeParse(row.payload);
      if (!parsed.success) return [];
      return [
        {
          id: row.id,
          tipo: parsed.data.tipo,
          payload: parsed.data,
          leadNome: row.lead_nome,
          status: "pendente" as const,
        },
      ];
    });
  } catch {
    return [];
  }
}
