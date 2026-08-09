// Fronteira ÚNICA de tipos das RPCs atendimento_inbox_v4/v3: os types gerados
// do Supabase ainda não conhecem as funções novas, então o escape (`as never`)
// vive aqui, uma vez — mesmo padrão de leads-rpc.ts. A v2 continua nos types e
// serve de último degrau enquanto as migrations não estão aplicadas.
// Ao regenerar os types com as migrations aplicadas, remova os casts.

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

export async function rpcAtendimentoInbox(
  versao: AtendimentoInboxVersao,
  params: AtendimentoInboxParams,
): Promise<unknown[]> {
  const { data, error } = await supabase.rpc(INBOX_FN[versao] as never, params as never);
  if (error) throw error;
  return (data as unknown[]) ?? [];
}
