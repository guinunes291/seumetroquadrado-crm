// Cliente do Banco Operacional SMQ (Supabase ref lwebydmveyqyzfgmbqfk).
// Grava via PostgREST direto usando SMQ_OPERACIONAL_SERVICE_KEY (service_role).
// SERVER-ONLY. Nunca importar em código de cliente.

const EXTERNAL_REF = "lwebydmveyqyzfgmbqfk";
const EXTERNAL_URL = `https://${EXTERNAL_REF}.supabase.co`;

function getKey(): string | null {
  return (
    process.env.SMQ_OPERACIONAL_SERVICE_KEY ||
    process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY ||
    null
  );
}

/** Normaliza telefone para 55 + DDD + número, SÓ dígitos, sem '+'. */
export function normalizePhoneSMQ(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (!d.startsWith("55")) {
    if (d.length === 10 || d.length === 11) d = `55${d}`;
  }
  // Garante 9º dígito no celular (após DDD): 55 + DDD(2) + 8 dígitos -> insere 9
  if (d.length === 12 && d.startsWith("55")) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (!rest.startsWith("9")) d = `55${ddd}9${rest}`;
  }
  if (d.length < 12 || d.length > 15) return null;
  return d;
}

// Mantém compat com chamadas antigas que usam toE164 — devolve apenas dígitos com '+'.
export function toE164(raw: string | null | undefined): string | null {
  const n = normalizePhoneSMQ(raw);
  return n ? `+${n}` : null;
}

const ALLOWED_TEMP = new Set(["FRIO", "MORNO", "QUENTE", "PRONTO"]);
function normTempUpper(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const u = v.trim().toUpperCase();
  return ALLOWED_TEMP.has(u) ? u : null;
}

type SyncResult = {
  ok: boolean;
  target: string;
  matched_by: "telefone_e164";
  error?: string;
};

type SyncLeadInput = {
  crmLeadId: string;
  telefone: string | null | undefined;
  /** Telefone já normalizado (lido de leads.telefone_e164). Quando presente,
   *  evita re-normalizar e garante consistência com a coluna persistida. */
  telefoneE164?: string | null;
  nome?: string | null;
  origem?: string | null;
  renda_estimada?: number | null;
  tem_fgts?: boolean | null;
  fgts_valor?: number | null;
  tipo_renda?: string | null;
  decisor?: string | null;
  faixa_mcmv?: string | null;
  temperatura?: string | null;
  resumo_qualificacao?: string | null;
  // legados ignorados (não enviar 'estado' ao externo)
  corretorId?: string | null;
  campanha?: string | null;
  estado?: string | null;
  consentimentoLgpd?: boolean | null;
  optOut?: boolean | null;
};

function buildBody(input: SyncLeadInput, telefoneE164: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    telefone_e164: telefoneE164,
    crm_lead_id: input.crmLeadId,
    crm_synced_at: new Date().toISOString(),
  };
  if (input.nome !== undefined) body.nome = input.nome ?? null;
  if (input.origem !== undefined) body.origem = input.origem ?? null;
  if (input.renda_estimada !== undefined) body.renda_estimada = input.renda_estimada ?? null;
  if (input.tem_fgts !== undefined) body.tem_fgts = input.tem_fgts ?? null;
  if (input.fgts_valor !== undefined) body.fgts_valor = input.fgts_valor ?? null;
  if (input.tipo_renda !== undefined) body.tipo_renda = input.tipo_renda ?? null;
  if (input.decisor !== undefined) body.decisor = input.decisor ?? null;
  if (input.faixa_mcmv !== undefined) body.faixa_mcmv = input.faixa_mcmv ?? null;
  if (input.temperatura !== undefined) {
    const t = normTempUpper(input.temperatura);
    if (t) body.temperatura = t;
  }
  if (input.resumo_qualificacao !== undefined) body.resumo_qualificacao = input.resumo_qualificacao ?? null;
  return body;
}

async function upsertLead(input: SyncLeadInput): Promise<SyncResult> {
  const out: SyncResult = { ok: false, target: EXTERNAL_REF, matched_by: "telefone_e164" };
  const key = getKey();
  if (!key) return { ...out, error: "missing_SMQ_OPERACIONAL_SERVICE_KEY" };
  const tel = normalizePhoneSMQ(input.telefone);
  if (!tel) return { ...out, error: "telefone_invalido" };

  const body = buildBody(input, tel);

  try {
    const res = await fetch(
      `${EXTERNAL_URL}/rest/v1/leads?on_conflict=telefone_e164`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ...out, error: `http_${res.status}: ${txt.slice(0, 300)}` };
    }
    return { ok: true, target: EXTERNAL_REF, matched_by: "telefone_e164" };
  } catch (e) {
    return { ...out, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Sincroniza lead criado/atualizado para o Banco Operacional. */
export async function syncLeadToExternal(input: SyncLeadInput): Promise<SyncResult> {
  return upsertLead(input);
}

/** Replica campos de qualificação. Mesma operação que sync (upsert por telefone). */
export async function replicateLeadFieldsToExternal(args: {
  crmLeadId: string;
  telefone?: string | null;
  nome?: string | null;
  fields: Record<string, unknown>;
}): Promise<SyncResult> {
  // Aceita o map de campos vindos do PATCH e mapeia para o esquema externo.
  const f = args.fields;
  return upsertLead({
    crmLeadId: args.crmLeadId,
    telefone: args.telefone ?? null,
    nome: typeof f.nome === "string" ? (f.nome as string) : (args.nome ?? undefined),
    origem: typeof f.origem === "string" ? (f.origem as string) : undefined,
    renda_estimada:
      typeof f.renda_estimada === "number"
        ? (f.renda_estimada as number)
        : f.renda_estimada === null
          ? null
          : undefined,
    tem_fgts:
      typeof f.tem_fgts === "boolean" ? (f.tem_fgts as boolean) : f.tem_fgts === null ? null : undefined,
    fgts_valor:
      typeof f.fgts_valor === "number"
        ? (f.fgts_valor as number)
        : f.fgts_valor === null
          ? null
          : undefined,
    tipo_renda: typeof f.tipo_renda === "string" ? (f.tipo_renda as string) : undefined,
    decisor: typeof f.decisor === "string" ? (f.decisor as string) : undefined,
    faixa_mcmv: typeof f.faixa_mcmv === "string" ? (f.faixa_mcmv as string) : undefined,
    temperatura: typeof f.temperatura === "string" ? (f.temperatura as string) : undefined,
    resumo_qualificacao:
      typeof f.resumo_qualificacao === "string" ? (f.resumo_qualificacao as string) : undefined,
  });
}

/** Mantido para compat: registra evento de funil no externo (best-effort). */
export async function logEventoFunilExternal(args: {
  crmLeadId: string;
  telefone?: string | null;
  para_estado: string;
  agente?: string;
  motivo?: string;
}): Promise<void> {
  const key = getKey();
  if (!key) return;
  try {
    // Resolve lead_id externo via PostgREST select.
    const tel = normalizePhoneSMQ(args.telefone);
    const url =
      `${EXTERNAL_URL}/rest/v1/leads?select=lead_id&` +
      `or=(crm_lead_id.eq.${encodeURIComponent(args.crmLeadId)}` +
      (tel ? `,telefone_e164.eq.${encodeURIComponent(tel)}` : ``) +
      `)&limit=1`;
    const r = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return;
    const rows = (await r.json()) as Array<{ lead_id?: string }>;
    const leadId = rows?.[0]?.lead_id;
    if (!leadId) return;
    await fetch(`${EXTERNAL_URL}/rest/v1/eventos_funil`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        lead_id: leadId,
        para_estado: args.para_estado,
        agente: args.agente ?? "crm",
        motivo: args.motivo ?? null,
      }),
    });
  } catch (e) {
    console.warn("[external-supabase] eventos_funil falhou:", e);
  }
}
