// Memória persistida da Sami (decisão D11): cada turno (pergunta + resposta)
// vai para samiq_conversas/samiq_conversa_mensagens pela RPC
// samiq_gravar_turno (service_role). Regras:
//  * PII redigida AQUI, antes de sair do servidor — telefone, CPF, e-mail,
//    endereço e banco nunca chegam ao banco; nomes de cliente ficam (D12).
//  * Memória nunca derruba a resposta: erro (ou migration ausente) vira log
//    e `null`, e o painel segue sem conversaId.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { isMissingBackendObject } from "@/lib/supabase-errors";
import { redactSamiQPii } from "@/lib/samiq-governance";
import type { PropostaSamiQ } from "@/lib/samiq-propostas";
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
}): Promise<string | null> {
  const pergunta = redactSamiQPii(args.pergunta, SAMIQ_MAX_TURNO_CHARS).trim();
  const resposta = redactSamiQPii(args.resposta, SAMIQ_MAX_TURNO_CHARS).trim();
  if (!pergunta || !resposta) return args.conversaId ?? null;

  try {
    const { data, error } = await supabaseAdmin.rpc("samiq_gravar_turno", {
      _user_id: args.userId,
      _conversa_id: args.conversaId ?? null,
      _lead_id: args.leadId ?? null,
      _pergunta: pergunta,
      _resposta: resposta,
      _ferramentas: (args.ferramentas ?? []).slice(0, 20),
      _execution_id: args.executionId ?? null,
    });
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
      _execution_id: args.executionId,
      _conversa_id: args.conversaId,
      _propostas: itens as Json,
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
