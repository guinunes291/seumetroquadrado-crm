// Leitura do perfil do lead para o comparativo e o card do dossiê.
//
// Rollout aditivo: as colunas de perfil (dorms_desejados, precisa_vaga,
// prioridades, nota_perfil_cliente) nascem na migration
// 20260930120000_comparativo_plantas_perfil. Se o app subir antes dela, a query
// cai para as colunas antigas em vez de quebrar a sacola inteira.

import { supabase } from "@/integrations/supabase/client";
import { isMissingBackendObject } from "@/lib/supabase-errors";
import type { LeadPerfilRow } from "./encaixe";

export type LeadPerfilCompleto = LeadPerfilRow & {
  id: string;
  nome: string | null;
  nota_perfil_cliente?: string | null;
  /** false quando a migration de perfil ainda não está no banco. */
  perfilDisponivel: boolean;
};

const BASE =
  "id, nome, renda_informada, renda_estimada, entrada_disponivel, fgts_valor, zona, bairro";
const NOVAS = "dorms_desejados, precisa_vaga, prioridades, nota_perfil_cliente";

export async function buscarPerfilDoLead(leadId: string): Promise<LeadPerfilCompleto | null> {
  const completo = await supabase
    .from("leads")
    .select(`${BASE}, ${NOVAS}`)
    .eq("id", leadId)
    .maybeSingle();
  if (!completo.error) {
    return completo.data ? { ...completo.data, perfilDisponivel: true } : null;
  }
  if (!isMissingBackendObject(completo.error)) throw completo.error;
  const base = await supabase.from("leads").select(BASE).eq("id", leadId).maybeSingle();
  if (base.error) throw base.error;
  return base.data ? { ...base.data, perfilDisponivel: false } : null;
}

export const leadPerfilQueryKey = (leadId: string | null) => ["lead-perfil-comparativo", leadId];
