import { supabase } from "@/integrations/supabase/client";
import { followUpParaStatus } from "@/lib/follow-up";
import type { LeadStatus } from "@/lib/leads";

export type TransicionarLeadInput = {
  id: string;
  status: LeadStatus;
  nome?: string;
  motivo?: string | null;
  proximaAcao?: string | null;
  proximoFollowup?: string | null;
};

/** Única fronteira frontend suportada para alterar a etapa de um lead. */
export async function transicionarLead(input: TransicionarLeadInput) {
  const template = followUpParaStatus(input.status, { nome: input.nome });
  const { data, error } = await supabase.rpc("transicionar_lead", {
    p_lead_id: input.id,
    p_motivo: input.motivo ?? null,
    p_novo_status: input.status,
    p_proxima_acao: input.proximaAcao ?? template?.titulo ?? null,
    p_proximo_followup: input.proximoFollowup ?? template?.vencimento ?? null,
  });
  if (error) throw error;
  return data;
}
