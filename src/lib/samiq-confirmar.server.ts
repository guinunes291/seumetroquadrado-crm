// Confirmação de ações — o núcleo (Onda S2, extraído na Onda S4 para servir
// ao painel e ao WhatsApp; v8 serve também a execução imediata das ações
// "direto"). Confirmar executa com a SESSÃO DO CORRETOR
// (samiq-executar.server.ts, RLS) e registra a decisão; rejeitar e desfazer
// só mexem no estado da proposta pelas RPCs do servidor.
//
// v8: antes de executar, a ação é REIVINDICADA no banco
// (samiq_reivindicar_proposta). Dois CONFIRMAR seguidos, um clique duplo no
// card ou a retentativa do n8n não executam a mesma ação duas vezes.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isMissingBackendObject } from "@/lib/supabase-errors";
import {
  PropostaPayloadSchema,
  SAMIQ_PROPOSTA_TIPOS,
  type PropostaPayload,
} from "@/lib/samiq-propostas";
import { samiqRpc } from "@/lib/samiq-rpc-args";
import { executarPropostaSamiQ, type ContextoExecucao } from "./samiq-executar.server";

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
  /** v8: o que aconteceu de fato (ex.: "entrou em Em atendimento"). */
  efeito?: string | null;
};

function mensagemErro(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return "Falha ao executar a ação.";
}

/** true = pode executar; false = outra execução já pegou (ou a ação não está mais pendente). */
async function reivindicar(userId: string, propostaId: string): Promise<boolean> {
  try {
    const { data, error } = await samiqRpc(supabaseAdmin)("samiq_reivindicar_proposta", {
      _user_id: userId,
      _proposta_id: propostaId,
    });
    if (error) return isMissingBackendObject(error);
    return data === true;
  } catch {
    return true;
  }
}

export async function confirmarPropostas(args: {
  supabase: Db;
  userId: string;
  itens: ItemConfirmacao[];
  contexto?: ContextoExecucao;
}): Promise<ResultadoConfirmacao[]> {
  const { supabase, userId } = args;
  const resultados: ResultadoConfirmacao[] = [];

  for (const item of args.itens.slice(0, 20)) {
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

    if (!(await reivindicar(userId, row.id))) {
      resultados.push({
        id: row.id,
        ok: false,
        status: "indisponivel",
        erro: "já está sendo gravada",
      });
      continue;
    }

    const editada = jsonEstavel(payloadFinal) !== jsonEstavel(row.payload);
    try {
      const resultado = await executarPropostaSamiQ({
        supabase,
        userId,
        propostaId: row.id,
        executionId: row.execution_id,
        payload: payloadFinal,
        contexto: args.contexto,
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
      const efeito = typeof resultado.efeito === "string" ? resultado.efeito : null;
      resultados.push({
        id: row.id,
        ok: true,
        status,
        desfazerAte: atualizada?.desfazer_ate ?? null,
        efeito,
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
  for (const id of args.ids.slice(0, 20)) {
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
    if (msg.includes("nao se desfaz") || msg.includes("etapa")) {
      throw new Error("Essa ação passa pelo funil e não se desfaz por aqui.");
    }
    if (msg.includes("confirmada")) throw new Error("Esta ação não foi gravada.");
    throw new Error("Não foi possível desfazer este registro.");
  }
  const obj = (out ?? {}) as { desfeito?: boolean; itens?: string[] };
  return { desfeito: obj.desfeito === true, itens: Array.isArray(obj.itens) ? obj.itens : [] };
}

/** v8: DESFAZER pelo WhatsApp — uma ou várias ações, cada uma com o próprio resultado. */
export async function desfazerPropostas(args: {
  userId: string;
  ids: string[];
}): Promise<Array<{ id: string; ok: boolean; erro?: string }>> {
  const out: Array<{ id: string; ok: boolean; erro?: string }> = [];
  for (const id of args.ids.slice(0, 20)) {
    try {
      const r = await desfazerProposta({ userId: args.userId, id });
      out.push({ id, ok: r.desfeito });
    } catch (e) {
      out.push({ id, ok: false, erro: mensagemErro(e) });
    }
  }
  return out;
}

/** JSON com chaves ordenadas: "editada" só quando o conteúdo mudou de fato. */
export function jsonEstavel(valor: unknown): string {
  return JSON.stringify(valor, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}
