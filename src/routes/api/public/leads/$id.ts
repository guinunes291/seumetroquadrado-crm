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
  shapeLeadForPublic,
} from "@/lib/public-api-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Aliases públicos → coluna real do CRM.
const FIELD_MAP: Record<string, string> = {
  renda: "renda_estimada",
  valor_fgts: "fgts_valor",
  empreendimento_interesse: "projeto_nome",
  resumo: "resumo_qualificacao",
  estagio: "status",
  estagio_funil: "status",
  proxima_acao_em: "proximo_followup",
};

// Campos enviados ao Banco Operacional externo (chaves do esquema externo).
// Origem (alias ou coluna real do CRM) → coluna externa.
// NÃO inclui 'estado' (gerido por outro sistema).
const EXTERNAL_FIELD_MAP: Record<string, string> = {
  nome: "nome",
  origem: "origem",
  renda: "renda_estimada",
  renda_estimada: "renda_estimada",
  tem_fgts: "tem_fgts",
  fgts_valor: "fgts_valor",
  valor_fgts: "fgts_valor",
  tipo_renda: "tipo_renda",
  decisor: "decisor",
  faixa_mcmv: "faixa_mcmv",
  temperatura: "temperatura",
  resumo: "resumo_qualificacao",
  resumo_qualificacao: "resumo_qualificacao",
};

type Kind = "text" | "boolean" | "uuid" | "timestamp" | "enum" | "numeric" | "date" | "json";

// Campos permitidos para PATCH no CRM (coluna real).
const PATCHABLE: Record<string, Kind> = {
  nome: "text",
  telefone: "text",
  email: "text",
  origem: "enum",
  campanha: "text",
  projeto_nome: "text",
  projeto_id: "uuid",
  faixa_mcmv: "text",
  renda_informada: "text",
  renda_estimada: "numeric",
  usa_fgts: "boolean",
  tem_fgts: "boolean",
  entrada_disponivel: "numeric",
  fgts_valor: "numeric",
  tipo_renda: "text",
  decisor: "text",
  temperatura: "enum",
  status: "enum",
  estado: "enum",
  etapa: "text",
  motivo_handoff: "text",
  observacoes: "text",
  resumo_qualificacao: "text",
  corretor_id: "uuid",
  proxima_acao: "text",
  proximo_followup: "timestamp",
  consentimento_lgpd: "boolean",
  opt_out: "boolean",
  utm_source: "text",
  utm_medium: "text",
  utm_campaign: "text",
  utm_content: "text",
  desfecho: "text",
  fase: "text",
  visita_data: "date",
  visita_hora: "text",
  visita_empreendimento: "text",
  docs_recebidos: "json",
  docs_pendentes: "json",
};

// Enums conhecidos do banco — quando o valor não bater, ignoramos esse campo
// em vez de retornar 500/422.
const ENUM_VALUES: Record<string, string[]> = {
  temperatura: ["frio", "morno", "quente"],
  status: [
    "novo",
    "aguardando_atendimento",
    "em_atendimento",
    "aguardando_retorno",
    "qualificado",
    "agendado",
    "visita_realizada",
    "analise_credito",
    "contrato_fechado",
    "pos_venda",
    "perdido",
  ],
  estado: ["novo", "com_corretor"],
  origem: [
    "facebook",
    "google_sheets",
    "site",
    "indicacao",
    "captacao_corretor",
    "whatsapp",
    "telefone",
    "plantao",
    "agendamento_self_service",
    "chatbot",
    "outro",
  ],
};

function normTempLower(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const u = v.trim().toUpperCase();
  if (u === "QUENTE" || u === "PRONTO") return "quente";
  if (u === "MORNO") return "morno";
  if (u === "FRIO") return "frio";
  return v;
}

function coerce(value: unknown, kind: Kind): { ok: true; value: unknown } | { ok: false; err: string } {
  if (value === null) return { ok: true, value: null };
  switch (kind) {
    case "text":
      if (typeof value === "string") return { ok: true, value };
      if (typeof value === "number" || typeof value === "boolean") return { ok: true, value: String(value) };
      return { ok: false, err: "esperado string" };
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
      if (typeof value === "boolean") return { ok: true, value };
      if (value === "true" || value === 1) return { ok: true, value: true };
      if (value === "false" || value === 0) return { ok: true, value: false };
      return { ok: false, err: "esperado boolean" };
    case "uuid":
      if (typeof value !== "string" || !UUID_RE.test(value)) return { ok: false, err: "uuid inválido" };
      return { ok: true, value };
    case "timestamp":
      if (typeof value !== "string") return { ok: false, err: "esperado ISO 8601" };
      if (Number.isNaN(Date.parse(value))) return { ok: false, err: "ISO 8601 inválido" };
      return { ok: true, value };
    case "date": {
      if (typeof value !== "string") return { ok: false, err: "esperado YYYY-MM-DD" };
      const s = value.trim();
      if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return { ok: false, err: "esperado YYYY-MM-DD" };
      if (Number.isNaN(Date.parse(s))) return { ok: false, err: "data inválida" };
      return { ok: true, value: s.slice(0, 10) };
    }
    case "json": {
      if (Array.isArray(value) || (value && typeof value === "object")) return { ok: true, value };
      if (typeof value === "string") {
        try {
          return { ok: true, value: JSON.parse(value) };
        } catch {
          /* fall */
        }
      }
      return { ok: false, err: "esperado array/objeto JSON" };
    }
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

        return jsonResponse({
          lead: shapeLeadForPublic(leadRes.data as Record<string, unknown>),
          interacoes: interRes.data ?? [],
        });
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
        const externalFields: Record<string, unknown> = {};
        const ignored: string[] = [];

        for (const [rawKey, rawVal] of Object.entries(body)) {
          if (rawKey === "id" || rawKey === "created_at" || rawKey === "updated_at") continue;

          // Normalização específica de temperatura para o CRM (enum lowercase).
          const valForCrm = rawKey === "temperatura" ? normTempLower(rawVal) : rawVal;

          const realKey = FIELD_MAP[rawKey] ?? rawKey;
          const kind = PATCHABLE[realKey];

          if (kind) {
            const r = coerce(valForCrm, kind);
            if (r.ok) {
              // Para enums, valida o valor — se inválido, IGNORA em vez de erro.
              if (kind === "enum" && typeof r.value === "string") {
                const allowed = ENUM_VALUES[realKey];
                if (allowed && !allowed.includes(r.value)) {
                  ignored.push(`${rawKey}:enum_invalido`);
                } else {
                  update[realKey] = r.value;
                }
              } else {
                update[realKey] = r.value;
              }
            } else {
              ignored.push(`${rawKey}:${r.err}`);
            }
          } else {
            ignored.push(`${rawKey}:desconhecido`);
          }

          // Espelha para o payload externo (independente da validação do CRM).
          const extKey = EXTERNAL_FIELD_MAP[rawKey];
          if (extKey) {
            if (extKey === "temperatura" && typeof rawVal === "string") {
              externalFields[extKey] = rawVal.trim().toUpperCase();
            } else if (extKey === "renda_estimada" || extKey === "fgts_valor") {
              // coerção numérica para o externo
              const r = coerce(rawVal, "numeric");
              if (r.ok) externalFields[extKey] = r.value;
            } else if (extKey === "tem_fgts") {
              const r = coerce(rawVal, "boolean");
              if (r.ok) externalFields[extKey] = r.value;
            } else if (rawVal !== undefined) {
              externalFields[extKey] = rawVal;
            }
          }
        }

        if (Object.keys(update).length === 0 && Object.keys(externalFields).length === 0) {
          return jsonResponse(
            { error: "nenhum campo válido para atualizar", ignored },
            400,
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: existing, error: chkErr } = await supabaseAdmin
          .from("leads")
          .select("id, telefone, nome")
          .eq("id", id)
          .maybeSingle();
        if (chkErr) return jsonResponse({ error: chkErr.message }, 500);
        if (!existing) return jsonResponse({ error: "lead não encontrado" }, 404);

        let updated: Record<string, unknown> | null = null;
        if (Object.keys(update).length > 0) {
          update.updated_at = new Date().toISOString();
          const { data, error } = await supabaseAdmin
            .from("leads")
            .update(update as never)
            .eq("id", id)
            .select(PUBLIC_LEAD_SELECT)
            .single();
          if (error) {
            // Nunca 500 por enum/coluna restrita — devolve 422 limpo.
            const msg = error.message || "";
            const status = /invalid input value for enum|violates check/i.test(msg) ? 422 : 500;
            return jsonResponse({ error: msg, ignored }, status);
          }
          updated = data as Record<string, unknown>;
        } else {
          // Garante leitura atualizada
          const { data } = await supabaseAdmin
            .from("leads")
            .select(PUBLIC_LEAD_SELECT)
            .eq("id", id)
            .single();
          updated = (data ?? null) as Record<string, unknown> | null;
        }

        // Replica no Banco Operacional externo (best-effort).
        let externalSync: { ok: boolean; target: string; matched_by: string; error?: string } = {
          ok: true,
          target: "lwebydmveyqyzfgmbqfk",
          matched_by: "telefone_e164",
        };
        if (Object.keys(externalFields).length > 0) {
          try {
            const { replicateLeadFieldsToExternal } = await import(
              "@/lib/external-supabase.server"
            );
            externalSync = await replicateLeadFieldsToExternal({
              crmLeadId: id,
              telefone: existing.telefone,
              nome: existing.nome,
              fields: externalFields,
            });
          } catch (e) {
            externalSync = {
              ok: false,
              target: "lwebydmveyqyzfgmbqfk",
              matched_by: "telefone_e164",
              error: e instanceof Error ? e.message : String(e),
            };
          }
        }

        return jsonResponse({
          ok: true,
          lead: shapeLeadForPublic(updated),
          ignored,
          external_sync: externalSync,
        });
      },
    },
  },
});
