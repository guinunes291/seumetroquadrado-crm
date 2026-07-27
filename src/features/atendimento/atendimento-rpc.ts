// Fronteira ÚNICA de tipos da RPC atendimento_inbox_v3: os types gerados do
// Supabase ainda não conhecem a função nova, então o escape (`as never`) vive
// aqui, uma vez — mesmo padrão de leads-rpc.ts. A v2 continua nos types e
// serve de fallback enquanto a migration não está aplicada no ambiente.
// Ao regenerar os types com as migrations aplicadas, remova os casts.

import { supabase } from "@/integrations/supabase/client";

export type AtendimentoInboxParams = {
  _corretor_id: string;
  _limit_per_queue: number;
};

export async function rpcAtendimentoInbox(
  versao: "v3" | "v2",
  params: AtendimentoInboxParams,
): Promise<unknown[]> {
  const { data, error } = await supabase.rpc(
    (versao === "v3" ? "atendimento_inbox_v3" : "atendimento_inbox_v2") as never,
    params as never,
  );
  if (error) throw error;
  return (data as unknown[]) ?? [];
}
