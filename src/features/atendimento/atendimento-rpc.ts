// Fronteira ÚNICA de tipos das RPCs atendimento_inbox_v4/v3: os types gerados
// do Supabase ainda não conhecem as funções novas. Tipos estruturais
// explícitos no molde de landing.ts (holder + cast de campo unknown), sem
// gastar o orçamento de type escapes. Ao regenerar os types com as
// migrations aplicadas, troque pelos tipos gerados.

import { supabase } from "@/integrations/supabase/client";

export type AtendimentoInboxVersao = "v4" | "v3" | "v2";

export type AtendimentoInboxParams = {
  _corretor_id: string;
  _limit_per_queue: number;
};

const INBOX_FN: Record<AtendimentoInboxVersao, string> = {
  v4: "atendimento_inbox_v4",
  v3: "atendimento_inbox_v3",
  v2: "atendimento_inbox_v2",
};

type ResultadoRpc = PromiseLike<{
  data: unknown[] | null;
  error: { code?: string; message?: string } | null;
}>;
type ClientHolder = { rpc: unknown };
type RpcInbox = (fn: string, args: AtendimentoInboxParams) => ResultadoRpc;

export async function rpcAtendimentoInbox(
  versao: AtendimentoInboxVersao,
  params: AtendimentoInboxParams,
): Promise<unknown[]> {
  const holder: ClientHolder = supabase;
  const { data, error } = await (holder.rpc as RpcInbox).call(supabase, INBOX_FN[versao], params);
  if (error) throw error;
  return data ?? [];
}
