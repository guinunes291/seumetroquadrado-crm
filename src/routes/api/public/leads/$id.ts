// GET /api/public/leads/:id          → lead + interações
// PATCH /api/public/leads/:id        → atualização parcial
// OPTIONS                             → CORS preflight
// Auth: header X-API-Key = READ_API_KEY
import { createFileRoute } from "@tanstack/react-router";
import {
  checkReadApiKey,
  jsonResponse,
  corsPreflight,
  PUBLIC_LEAD_SELECT,
} from "@/lib/public-api-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mapeamento campo público → coluna real no banco.
// (mantém compatibilidade aceitando os dois nomes)
const FIELD_MAP: Record<string, string> = {
  // aliases canônicos → coluna existente
  renda: "renda_informada",
  renda_estimada: "renda_informada",
  valor_fgts: "entrada_disponivel",
  fgts_valor: "entrada_disponivel",
  tem_fgts: "usa_fgts",
  empreendimento_interesse: "projeto_nome",
  resumo: "observacoes",
  estagio: "status",
  estagio_funil: "status",
  proxima_acao_em: "proximo_followup",
};

// Campos enviados ao Banco Operacional externo (nomes do schema externo).
// Origem (alias ou coluna real do CRM) → coluna externa
const EXTERNAL_FIELD_MAP: Record<string, string> = {
  renda: "renda_estimada",
  renda_estimada: "renda_estimada",
  renda_informada: "renda_estimada",
  tem_fgts: "tem_fgts",
  usa_fgts: "tem_fgts",
  fgts_valor: "fgts_valor",
  valor_fgts: "fgts_valor",
  entrada_disponivel: "fgts_valor",
  tipo_renda: "tipo_renda",
  decisor: "decisor",
  faixa_mcmv: "faixa_mcmv",
  temperatura: "temperatura",
  estagio_funil: "estagio_funil",
  estagio: "estagio_funil",
  status: "estagio_funil",
  estado: "estado",
  proxima_acao: "proxima_acao",
  resumo: "resumo",
  observacoes: "resumo",
  consentimento_lgpd: "consentimento_lgpd",
  opt_out: "opt_out",
};


// Campos permitidos para PATCH (coluna real do banco)
const PATCHABLE: Record<string, "text" | "boolean" | "uuid" | "timestamp" | "enum" | "numeric"> = {
  nome: "text",
  telefone: "text",
  email: "text",
  origem: "enum",
  campanha: "text",
  projeto_nome: "text",
  projeto_id: "uuid",
  faixa_mcmv: "text",
  renda_informada: "numeric",
  usa_fgts: "boolean",
  entrada_disponivel: "numeric",
  tipo_renda: "text",
  decisor: "text",
  temperatura: "enum",
  status: "enum",
  estado: "enum",
  etapa: "text",
  motivo_handoff: "text",
  observacoes: "text",
  corretor_id: "uuid",
  proxima_acao: "text",
  proximo_followup: "timestamp",
  consentimento_lgpd: "boolean",
  opt_out: "boolean",
  utm_source: "text",
  utm_medium: "text",
  utm_campaign: "text",
  utm_content: "text",
};

function coerce(value: unknown, kind: string): { ok: true; value: unknown } | { ok: false; err: string } {
  if (value === null) return { ok: true, value: null };
  switch (kind) {
    case "text":
    case "enum":
      if (typeof value !== "string") return { ok: false, err: "esperado string" };
      return { ok: true, value };
    case "numeric": {
      if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value };
      if (typeof value === "string") {
        const s = value.trim().replace(/\./g, "").replace(",", ".");
        const n = Number(s);
        if (Number.isFinite(n)) return { ok: true, value: n };
      }
      return { ok: false, err: "esperado number" };
    }
    case "boolean":
      if (typeof value !== "boolean") return { ok: false, err: "esperado boolean" };
      return { ok: true, value };
    case "uuid":
      if (typeof value !== "string" || !UUID_RE.test(value))
        return { ok: false, err: "uuid inválido" };
      return { ok: true, value };
    case "timestamp":
      if (typeof value !== "string") return { ok: false, err: "esperado ISO 8601" };
      if (Number.isNaN(Date.parse(value))) return { ok: false, err: "ISO 8601 inválido" };
      return { ok: true, value };
    default:
      return { ok: false, err: "tipo não suportado" };
  }
}

export const Route = createFileRoute("/api/public/leads/$id")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),

      GET: async ({ request, params }) => {
        const authErr = checkReadApiKey(request);
        if (authErr) return authErr;

        const id = params.id;
        if (!UUID_RE.test(id)) return jsonResponse({ error: "id inválido (esperado UUID)" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const [leadRes, interRes] = await Promise.all([
          supabaseAdmin.from("leads").select(PUBLIC_LEAD_SELECT).eq("id", id).maybeSingle(),
          supabaseAdmin
            .from("interacoes")
            .select("id,tipo,direcao,titulo,conteudo,metadata,ocorreu_em,created_at,autor_id")
            .eq("lead_id", id)
            .is("deleted_at", null)
            .order("ocorreu_em", { ascending: false })
            .limit(200),
        ]);

        if (leadRes.error) return jsonResponse({ error: leadRes.error.message }, 500);
        if (!leadRes.data) return jsonResponse({ error: "lead não encontrado" }, 404);

        return jsonResponse({ lead: leadRes.data, interacoes: interRes.data ?? [] });
      },

      PATCH: async ({ request, params }) => {
        const authErr = checkReadApiKey(request);
        if (authErr) return authErr;

        const id = params.id;
        if (!UUID_RE.test(id)) return jsonResponse({ error: "id inválido (esperado UUID)" }, 400);

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonResponse({ error: "JSON inválido" }, 400);
        }
        if (!body || typeof body !== "object") {
          return jsonResponse({ error: "body deve ser objeto JSON" }, 400);
        }

        const update: Record<string, unknown> = {};
        const errors: Record<string, string> = {};
        const externalFields: Record<string, unknown> = {};

        // Normalização de temperatura aceitando UPPER do banco operacional
        const normTemp = (v: unknown): unknown => {
          if (typeof v !== "string") return v;
          const u = v.trim().toUpperCase();
          if (u === "QUENTE" || u === "PRONTO") return "quente";
          if (u === "MORNO") return "morno";
          if (u === "FRIO") return "frio";
          return v;
        };

        for (const [k, vRaw] of Object.entries(body)) {
          if (k === "id" || k === "created_at" || k === "updated_at") continue;
          const v = k === "temperatura" ? normTemp(vRaw) : vRaw;
          const realKey = FIELD_MAP[k] ?? k;
          const kind = PATCHABLE[realKey];
          if (kind) {
            const r = coerce(v, kind);
            if (!r.ok) errors[k] = r.err;
            else update[realKey] = r.value;
          }
          // Espelha no payload externo (mesmo que o CRM não tenha a coluna)
          const extKey = EXTERNAL_FIELD_MAP[k];
          if (extKey) externalFields[extKey] = v;
        }

        if (Object.keys(errors).length > 0) {
          return jsonResponse({ error: "validação", details: errors }, 422);
        }
        if (Object.keys(update).length === 0 && Object.keys(externalFields).length === 0) {
          return jsonResponse({ error: "nenhum campo válido para atualizar" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: existing, error: chkErr } = await supabaseAdmin
          .from("leads")
          .select("id, telefone")
          .eq("id", id)
          .maybeSingle();
        if (chkErr) return jsonResponse({ error: chkErr.message }, 500);
        if (!existing) return jsonResponse({ error: "lead não encontrado" }, 404);

        let updated: unknown = null;
        if (Object.keys(update).length > 0) {
          update.updated_at = new Date().toISOString();
          const { data, error } = await supabaseAdmin
            .from("leads")
            .update(update as never)
            .eq("id", id)
            .select(PUBLIC_LEAD_SELECT)
            .single();
          if (error) return jsonResponse({ error: error.message }, 500);
          updated = data;
        }

        // Replica no Banco Operacional externo (não bloqueia resposta em caso de falha)
        let externalSync: { ok: boolean; error?: string } = { ok: true };
        if (Object.keys(externalFields).length > 0) {
          try {
            const { replicateLeadFieldsToExternal } = await import(
              "@/lib/external-supabase.server"
            );
            externalSync = await replicateLeadFieldsToExternal({
              crmLeadId: id,
              telefone: existing.telefone,
              fields: externalFields,
            });
          } catch (e) {
            externalSync = { ok: false, error: e instanceof Error ? e.message : String(e) };
          }
        }

        return jsonResponse({ ok: true, lead: updated, external_sync: externalSync });
      },

    },
  },
});
