// Aviso de transferência ao corretor (WhatsApp via edge function
// `notify-lead-transfer`).
//
// Regra da casa: transferência EM LOTE manda UMA mensagem de resumo por
// corretor. Antes a UI disparava uma chamada por lead e o corretor recebia N
// mensagens seguidas do mesmo número — é exatamente o padrão de rajada que o
// WhatsApp classifica como spam e que derruba/bloqueia a instância Z-API, e
// com ela todo o restante da operação (SDR, atendimento, oferta ativa).
//
// A elegibilidade continua sendo decidida no servidor (RLS do chamador +
// filtro de origem): aqui só mandamos a lista de ids.

import { supabase } from "@/integrations/supabase/client";

/**
 * Notifica o corretor de destino sobre um conjunto de leads transferidos.
 * Best-effort: a transferência já aconteceu, falha de aviso nunca a derruba.
 */
export async function notificarTransferenciaEmLote(args: {
  leadIds: string[];
  corretorId: string;
}): Promise<void> {
  const ids = Array.from(new Set(args.leadIds.filter(Boolean)));
  if (ids.length === 0 || !args.corretorId) return;
  try {
    await supabase.functions.invoke("notify-lead-transfer", {
      body: { lead_ids: ids, corretor_id: args.corretorId },
    });
  } catch (e) {
    console.warn("[notificarTransferenciaEmLote] aviso ao corretor falhou:", e);
  }
}
