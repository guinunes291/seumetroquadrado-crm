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
    type TurnoArgs = Database["public"]["Functions"]["samiq_gravar_turno"]["Args"];
    const base: TurnoArgs = {
      _user_id: args.userId,
      _conversa_id: args.conversaId ?? undefined,
      _lead_id: args.leadId ?? undefined,
      _pergunta: pergunta,
      _resposta: resposta,
      _ferramentas: (args.ferramentas ?? []).slice(0, 20),
      _execution_id: args.executionId ?? undefined,
    } as TurnoArgs;
    // Só o WhatsApp envia _canal; se a assinatura nova (migration S4) ainda
    // não está no ar, grava sem o canal em vez de perder o turno.
    const comCanal = args.canal !== undefined && args.canal !== "painel";
    const rpcTurno = (payload: TurnoArgs) => supabaseAdmin.rpc("samiq_gravar_turno", payload);
    let { data, error } = await rpcTurno(
      comCanal ? ({ ...base, _canal: args.canal } as TurnoArgs) : base,
    );
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
  const itens = args.coletadas.slice(0, 10).map((c) => ({
    tipo: c.payload.tipo,
    payload: JSON.parse(JSON.stringify(c.payload)) as Json,
    lead_id: c.leadId,
    lead_nome: c.leadNome,
  }));
  try {
    const { data, error } = await supabaseAdmin.rpc("samiq_registrar_propostas", {
      _user_id: args.userId,
      _execution_id: args.executionId ?? undefined,
      _conversa_id: args.conversaId ?? undefined,
      _propostas: itens,
    });
    if (error) {
      if (!isMissingBackendObject(error)) {
        console.error(JSON.stringify({ event: "samiq_propostas_failed", code: error.code ?? "" }));
      }
      return [];
    }
    const ids = Array.isArray(data) ? data : [];
    return args.coletadas.slice(0, ids.length).map((c, i) => ({
      id: String(ids[i]),
      tipo: c.payload.tipo,
      payload: c.payload,
      leadNome: c.leadNome,
      status: "pendente" as const,
    }));
  } catch {
    console.error(JSON.stringify({ event: "samiq_propostas_failed", code: "exception" }));
    return [];
  }
}

/** Máximo de turnos (user+assistant) que o canal WhatsApp reenvia ao modelo. */
export const SAMIQ_HISTORICO_CANAL = 6;

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
      .eq("canal" as "titulo", args.canal)
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
 * Últimos turnos de uma conversa, no formato do histórico do painel (cap de 6
 * mensagens, 1200 chars cada — o mesmo do SamiQInputSchema). Já está redigido
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
  const ids = (args.ids ?? []).slice(0, 10);
  if (ids.length === 0 && !args.conversaId) return [];
  try {
    let query = supabaseAdmin
      .from("samiq_propostas")
      .select("id, tipo, payload, lead_nome, status")
      .eq("user_id", args.userId)
      .eq("status", "pendente")
      .order("criado_em", { ascending: true })
      .limit(10);
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
