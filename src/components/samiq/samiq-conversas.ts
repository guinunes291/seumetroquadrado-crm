// Memória da Sami no CLIENTE (Onda S1, decisão D11): leitura da última
// conversa persistida (RLS: só a do próprio usuário), avaliação 👍/👎 e a
// regra pura de "retomar ou começar do zero". A escrita da conversa é do
// servidor (samiq-memoria.server.ts) — o browser nunca insere aqui.
//
// Tolerante à migration ausente: tabela/RPC que ainda não existe no ambiente
// vira "sem memória" (o painel abre vazio, como antes), nunca erro na tela.

import { supabase } from "@/integrations/supabase/client";
import { isMissingBackendObject } from "@/lib/supabase-errors";
import {
  SAMIQ_MAX_MENSAGENS_CARREGADAS,
  deveRetomarConversa,
  mapearMensagensPersistidas,
  mapearPropostasPersistidas,
  type MensagemPersistida,
} from "@/lib/samiq-memoria";
import type { PropostaSamiQ } from "@/lib/samiq-propostas";

export type ConversaCarregada = {
  id: string;
  leadId: string | null;
  atualizadoEm: string;
  mensagens: MensagemPersistida[];
};

export async function carregarUltimaConversaSamiQ(
  agora: Date = new Date(),
): Promise<ConversaCarregada | null> {
  try {
    const { data: conversa, error } = await supabase
      .from("samiq_conversas")
      .select("id, lead_id, atualizado_em")
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isMissingBackendObject(error)) return null;
      throw error;
    }
    if (!conversa || !deveRetomarConversa(conversa.atualizado_em, agora)) return null;

    const { data: rows, error: rowsErr } = await supabase
      .from("samiq_conversa_mensagens")
      .select("papel, conteudo, ferramentas, execution_id, criado_em")
      .eq("conversa_id", conversa.id)
      .order("criado_em", { ascending: true })
      .limit(SAMIQ_MAX_MENSAGENS_CARREGADAS);
    if (rowsErr) throw rowsErr;

    const execIds = (rows ?? [])
      .map((r) => r.execution_id)
      .filter((id): id is string => typeof id === "string");
    let avaliacoes: Array<{ execution_id: string; nota: number }> = [];
    let propostas: PropostaSamiQ[] = [];
    const propostaExecucao = new Map<string, string>();
    if (execIds.length > 0) {
      const [{ data: avs }, { data: props, error: propsErr }] = await Promise.all([
        supabase.from("samiq_avaliacoes").select("execution_id, nota").in("execution_id", execIds),
        supabase
          .from("samiq_propostas")
          .select("id, tipo, payload, status, execution_id, lead_nome, desfazer_ate, erro")
          .in("execution_id", execIds)
          .order("criado_em", { ascending: true }),
      ]);
      avaliacoes = avs ?? [];
      // Migration S2 ausente: sem propostas, sem erro (isMissingBackendObject).
      if (!propsErr) {
        propostas = mapearPropostasPersistidas(props ?? [], agora);
        for (const r of props ?? []) if (r.execution_id) propostaExecucao.set(r.id, r.execution_id);
      } else if (!isMissingBackendObject(propsErr)) {
        console.error("[samiq] propostas indisponíveis", propsErr);
      }
    }

    return {
      id: conversa.id,
      leadId: conversa.lead_id,
      atualizadoEm: conversa.atualizado_em,
      mensagens: mapearMensagensPersistidas(rows ?? [], avaliacoes, propostas, propostaExecucao),
    };
  } catch (error) {
    console.error("[samiq] memória indisponível", error);
    return null;
  }
}

/** 👍 (1) / 👎 (-1) numa resposta — só em execução do próprio usuário. */
export async function avaliarRespostaSamiQ(
  executionId: string,
  nota: 1 | -1,
  motivo?: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("samiq_avaliar_execucao", {
    _execution_id: executionId,
    _nota: nota,
    _motivo: motivo?.trim() ? motivo.trim().slice(0, 300) : null,
  });
  if (error) {
    if (isMissingBackendObject(error)) return false;
    throw error;
  }
  return data === true;
}
