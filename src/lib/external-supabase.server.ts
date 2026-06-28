// Cliente do Banco Operacional externo (Supabase ref lwebydmveyqyzfgmbqfk).
// Usado para manter a tabela public.leads sincronizada com o CRM via telefone_e164.
// SERVER-ONLY (service_role). Nunca importar em código de cliente.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.EXTERNAL_SUPABASE_URL;
  const key = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[external-supabase] secrets ausentes; sync desativado");
    return null;
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  return _client;
}

/** Normaliza telefone BR para E.164: +55DDD9XXXXXXXX. Retorna null se inválido. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  // Remove zero internacional
  if (d.startsWith("00")) d = d.slice(2);
  // Se já vem com 55, mantém
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    return `+${d}`;
  }
  // Sem código de país
  if (d.length === 10 || d.length === 11) {
    return `+55${d}`;
  }
  // Fallback: aceita qualquer coisa entre 10 e 15 dígitos
  if (d.length >= 10 && d.length <= 15) return `+${d}`;
  return null;
}

type SyncLeadInput = {
  crmLeadId: string;
  telefone: string;
  nome?: string | null;
  origem?: string | null;
  campanha?: string | null;
  corretorId?: string | null;
  estado?: string | null;
  consentimentoLgpd?: boolean | null;
  optOut?: boolean | null;
};

/** UPSERT idempotente em public.leads do Banco Operacional, casando por telefone_e164.
 *  Nunca sobrescreve o lead_id local — apenas preenche/atualiza crm_lead_id e demais campos. */
export async function syncLeadToExternal(input: SyncLeadInput): Promise<{ ok: boolean; error?: string }> {
  const client = getClient();
  if (!client) return { ok: false, error: "client_indisponivel" };
  const e164 = toE164(input.telefone);
  if (!e164) return { ok: false, error: "telefone_invalido" };

  const patch: Record<string, unknown> = {
    crm_lead_id: input.crmLeadId,
    telefone_e164: e164,
    crm_synced_at: new Date().toISOString(),
  };
  if (input.nome !== undefined) patch.nome = input.nome;
  if (input.origem !== undefined) patch.origem = input.origem;
  if (input.campanha !== undefined) patch.campanha_id = input.campanha;
  if (input.corretorId !== undefined) patch.corretor_id = input.corretorId;
  if (input.estado !== undefined) patch.estado = input.estado;
  if (input.consentimentoLgpd !== undefined) patch.consentimento_lgpd = input.consentimentoLgpd;
  if (input.optOut !== undefined) patch.opt_out = input.optOut;

  try {
    // Tenta UPDATE primeiro (preserva lead_id local)
    const { data: existing, error: selErr } = await client
      .from("leads")
      .select("lead_id")
      .eq("telefone_e164", e164)
      .maybeSingle();
    if (selErr) return { ok: false, error: selErr.message };

    if (existing) {
      const { error } = await client.from("leads").update(patch).eq("telefone_e164", e164);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await client.from("leads").insert(patch);
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Replica campos de qualificação para o Banco Operacional, casando por crm_lead_id ou telefone. */
export async function replicateLeadFieldsToExternal(args: {
  crmLeadId: string;
  telefone?: string | null;
  fields: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const client = getClient();
  if (!client) return { ok: false, error: "client_indisponivel" };
  const patch = { ...args.fields, crm_synced_at: new Date().toISOString() };

  try {
    const { data: byCrm, error: e1 } = await client
      .from("leads")
      .select("lead_id")
      .eq("crm_lead_id", args.crmLeadId)
      .maybeSingle();
    if (e1) return { ok: false, error: e1.message };

    if (byCrm) {
      const { error } = await client.from("leads").update(patch).eq("crm_lead_id", args.crmLeadId);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    const e164 = toE164(args.telefone);
    if (!e164) return { ok: false, error: "sem_match" };
    const { error } = await client
      .from("leads")
      .update({ ...patch, crm_lead_id: args.crmLeadId })
      .eq("telefone_e164", e164);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Insere linha em public.eventos_funil para alimentar KPIs. Falha silenciosa. */
export async function logEventoFunilExternal(args: {
  crmLeadId: string;
  telefone?: string | null;
  para_estado: string;
  agente?: string;
  motivo?: string;
}): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    // Resolve lead_id local pelo crm_lead_id ou telefone
    let leadId: string | null = null;
    const { data: byCrm } = await client
      .from("leads")
      .select("lead_id")
      .eq("crm_lead_id", args.crmLeadId)
      .maybeSingle();
    if (byCrm?.lead_id) leadId = byCrm.lead_id as string;
    if (!leadId) {
      const e164 = toE164(args.telefone);
      if (e164) {
        const { data } = await client
          .from("leads")
          .select("lead_id")
          .eq("telefone_e164", e164)
          .maybeSingle();
        if (data?.lead_id) leadId = data.lead_id as string;
      }
    }
    if (!leadId) return;
    await client.from("eventos_funil").insert({
      lead_id: leadId,
      para_estado: args.para_estado,
      agente: args.agente ?? "crm",
      motivo: args.motivo ?? null,
    });
  } catch (e) {
    console.warn("[external-supabase] eventos_funil falhou:", e);
  }
}
