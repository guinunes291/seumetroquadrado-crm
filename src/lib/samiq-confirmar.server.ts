// Confirmação de propostas — o núcleo (Onda S2, extraído na Onda S4 para servir
// ao painel e ao WhatsApp). Confirmar executa com a SESSÃO DO CORRETOR
// (samiq-executar.server.ts, RLS) e registra a decisão; rejeitar e desfazer
// só mexem no estado da proposta. O modelo nunca chega aqui: só o botão do
// card ou a resposta "CONFIRMAR" do corretor no WhatsApp.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isMissingBackendObject } from "@/lib/supabase-errors";
import {
  PropostaPayloadSchema,
  SAMIQ_PROPOSTA_TIPOS,
  type PropostaPayload,
} from "@/lib/samiq-propostas";
import { executarPropostaSamiQ } from "./samiq-executar.server";

type Db = SupabaseClient<Database>;

export type ItemConfirmacao = {
  id: string;
  /** Payload editado no card; ausente = confirmar como a Sami propôs. */
  payload?: unknown;
};

export type ResultadoConfirmacao = {
  id: string;
  ok: boolean;
  status: "aceita" | "editada" | "falhou" | "indisponivel";
  erro?: string;
  desfazerAte?: string | null;
};

function mensagemErro(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return "Falha ao executar a proposta.";
}

export async function confirmarPropostas(args: {
  supabase: Db;
  userId: string;
  itens: ItemConfirmacao[];
}): Promise<ResultadoConfirmacao[]> {
  const { supabase, userId } = args;
  const resultados: ResultadoConfirmacao[] = [];

  for (const item of args.itens.slice(0, 10)) {
    const { data: row, error } = await supabaseAdmin
      .from("samiq_propostas")
      .select("id, tipo, payload, status, execution_id, lead_id")
      .eq("id", item.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !row || (row.status !== "pendente" && row.status !== "falhou")) {
      resultados.push({ id: item.id, ok: false, status: "indisponivel" });
      continue;
    }

    let payloadFinal: PropostaPayload;
    try {
      payloadFinal = PropostaPayloadSchema.parse(item.payload ?? row.payload);
      const original = PropostaPayloadSchema.parse(row.payload);
      // O card pode ajustar texto, datas e campos — nunca trocar o tipo nem o
      // cliente da proposta (isso seria outra proposta, não uma edição).
      if (
        payloadFinal.tipo !== original.tipo ||
        !SAMIQ_PROPOSTA_TIPOS.includes(payloadFinal.tipo)
      ) {
        throw new Error("Tipo da proposta não pode mudar na edição.");
      }
      const leadOriginal = "leadId" in original ? (original.leadId ?? null) : null;
      const leadFinal = "leadId" in payloadFinal ? (payloadFinal.leadId ?? null) : null;
      if (leadOriginal !== leadFinal) {
        throw new Error("Cliente da proposta não pode mudar na edição.");
      }
    } catch (e) {
      resultados.push({ id: item.id, ok: false, status: "falhou", erro: mensagemErro(e) });
      continue;
    }

    const editada = JSON.stringify(payloadFinal) !== JSON.stringify(row.payload);
    try {
      const resultado = await executarPropostaSamiQ({
        supabase,
        userId,
        propostaId: row.id,
        executionId: row.execution_id,
        payload: payloadFinal,
      });
      const status = editada ? "editada" : "aceita";
      const { error: decErr } = await supabaseAdmin.rpc("samiq_decidir_proposta", {
        _user_id: userId,
        _proposta_id: row.id,
        _status: status,
        _payload_final: payloadFinal,
        _resultado: resultado,
        _erro: undefined,
      });
      if (decErr) {
        console.error(
          JSON.stringify({ event: "samiq_proposta_decisao_failed", code: decErr.code }),
        );
      }
      const { data: atualizada } = await supabaseAdmin
        .from("samiq_propostas")
        .select("desfazer_ate")
        .eq("id", row.id)
        .maybeSingle();
      resultados.push({
        id: row.id,
        ok: true,
        status,
        desfazerAte: atualizada?.desfazer_ate ?? null,
      });
    } catch (e) {
      const erro = mensagemErro(e);
      await supabaseAdmin.rpc("samiq_decidir_proposta", {
        _user_id: userId,
        _proposta_id: row.id,
        _status: "falhou",
        _payload_final: payloadFinal,
        _resultado: null,
        _erro: erro,
      });
      resultados.push({ id: row.id, ok: false, status: "falhou", erro });
    }
  }

  return resultados;
}

export async function rejeitarPropostas(args: { userId: string; ids: string[] }): Promise<number> {
  let rejeitadas = 0;
  for (const id of args.ids.slice(0, 10)) {
    const { data: ok, error } = await supabaseAdmin.rpc("samiq_decidir_proposta", {
      _user_id: args.userId,
      _proposta_id: id,
      _status: "rejeitada",
      _payload_final: null,
      _resultado: null,
      _erro: undefined,
    });
    if (!error && ok === true) rejeitadas += 1;
  }
  return rejeitadas;
}

export async function desfazerProposta(args: {
  userId: string;
  id: string;
}): Promise<{ desfeito: boolean; itens: string[] }> {
  const { data: out, error } = await supabaseAdmin.rpc("samiq_desfazer_proposta", {
    _user_id: args.userId,
    _proposta_id: args.id,
  });
  if (error) {
    if (isMissingBackendObject(error)) throw new Error("Desfazer ainda não está disponível.");
    const msg = (error.message ?? "").toLowerCase();
    if (msg.includes("expirada")) throw new Error("A janela de 24 h para desfazer já passou.");
    if (msg.includes("etapa")) throw new Error("Mudança de etapa não se desfaz pelo botão.");
    if (msg.includes("confirmada")) throw new Error("Esta proposta não foi confirmada.");
    throw new Error("Não foi possível desfazer este registro.");
  }
  const obj = (out ?? {}) as { desfeito?: boolean; itens?: string[] };
  return { desfeito: obj.desfeito === true, itens: Array.isArray(obj.itens) ? obj.itens : [] };
}
