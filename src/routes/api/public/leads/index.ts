// GET /api/public/leads
// Auth: header X-API-Key = READ_API_KEY
// Query params (todos opcionais, combinam com AND):
//   parados=30d              → sem ultima_interacao há N dias (mantido para compat)
//   status=novo,em_atendimento
//   estado=novo,qualificado  → csv
//   etapa=...                → csv (estágio textual do funil)
//   temperatura=quente       → quente|morno|frio
//   corretor_id=<uuid>
//   sem_corretor=true|false  → true: corretor_id IS NULL; false: NOT NULL
//   origem=facebook_lead_ads → csv
//   projeto_id=<uuid>
//   empreendimento=<texto>   → ILIKE em projeto_nome
//   campanha=<texto>         → ILIKE em campanha
//   handoff=true|false       → handoff_em not null/null
//   opt_out=true|false       → opt_out = bool
//   q=<texto>                → ILIKE nome/telefone/email
//   criado_apos=YYYY-MM-DD   → created_at >=
//   criado_antes=YYYY-MM-DD  → created_at <= (inclusivo, +1d)
//   atualizado_apos=YYYY-MM-DD → updated_at >=
//   desde=YYYY-MM-DD / ate=YYYY-MM-DD (aliases legados de criado_apos/criado_antes)
//   order_by=created_at|updated_at|ultima_interacao|temperatura (default created_at)
//   order=asc|desc (default desc)
//   limit=50 (max 200), offset=0
import { createFileRoute } from "@tanstack/react-router";
import {
  checkReadApiKey,
  jsonResponse,
  PUBLIC_LEAD_SELECT,
  shapeLeadForPublic,
} from "@/lib/public-api-auth";
import { escapeLike } from "@/lib/validators";

const PARADOS_RE = /^(\d+)d$/i;
const ORDER_BY_ALLOWED = new Set(["created_at", "updated_at", "ultima_interacao", "temperatura"]);

function parseBool(v: string | null): boolean | null {
  if (v == null) return null;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1") return true;
  if (s === "false" || s === "0") return false;
  return null;
}

function csv(v: string | null): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function plusOneDay(ymd: string): string {
  const d = new Date(ymd);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/api/public/leads/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authErr = checkReadApiKey(request);
        if (authErr) return authErr;

        const url = new URL(request.url);
        const q = url.searchParams;

        const limit = Math.min(Number(q.get("limit")) || 50, 200);
        const offset = Math.max(Number(q.get("offset")) || 0, 0);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let query = supabaseAdmin
          .from("leads")
          .select(PUBLIC_LEAD_SELECT, { count: "exact" })
          .eq("na_lixeira", false)
          .is("deleted_at", null);

        // parados=Nd (compat)
        const parados = q.get("parados");
        if (parados) {
          const m = PARADOS_RE.exec(parados);
          if (!m) return jsonResponse({ error: "parados inválido. Use formato 30d" }, 400);
          const dias = Number(m[1]);
          const cutoff = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
          query = query.or(`ultima_interacao.is.null,ultima_interacao.lte.${cutoff}`);
          query = query.not("status", "in", "(perdido,contrato_fechado)");
        }

        // Enums csv-aware
        for (const [param, col] of [
          ["status", "status"],
          ["estado", "estado"],
          ["etapa", "etapa"],
          ["origem", "origem"],
        ] as const) {
          const arr = csv(q.get(param));
          if (arr.length === 1) query = query.eq(col, arr[0] as never);
          else if (arr.length > 1) query = query.in(col, arr as never);
        }

        const temperatura = q.get("temperatura");
        if (temperatura) {
          const arr = csv(temperatura).map((s) => s.toLowerCase());
          if (arr.length === 1) query = query.eq("temperatura", arr[0] as never);
          else if (arr.length > 1) query = query.in("temperatura", arr as never);
        }

        const corretorId = q.get("corretor_id");
        if (corretorId) query = query.eq("corretor_id", corretorId);

        const semCorretor = parseBool(q.get("sem_corretor"));
        if (semCorretor === true) query = query.is("corretor_id", null);
        else if (semCorretor === false) query = query.not("corretor_id", "is", null);

        const projetoId = q.get("projeto_id");
        if (projetoId) query = query.eq("projeto_id", projetoId);

        const empreendimento = q.get("empreendimento");
        if (empreendimento) query = query.ilike("projeto_nome", `%${escapeLike(empreendimento)}%`);

        const campanha = q.get("campanha");
        if (campanha) query = query.ilike("campanha", `%${escapeLike(campanha)}%`);

        const handoff = parseBool(q.get("handoff"));
        if (handoff === true) query = query.not("handoff_em", "is", null);
        else if (handoff === false) query = query.is("handoff_em", null);

        const optOut = parseBool(q.get("opt_out"));
        if (optOut !== null) query = query.eq("opt_out", optOut);

        // Busca textual
        const qText = q.get("q");
        if (qText && qText.trim()) {
          // Remove separadores do PostgREST .or() e escapa curingas do ILIKE.
          const s = escapeLike(qText.trim().replace(/[,()]/g, " "));
          const like = `%${s}%`;
          query = query.or(`nome.ilike.${like},email.ilike.${like},telefone.ilike.${like}`);
        }

        // Datas
        const criadoApos = q.get("criado_apos") ?? q.get("desde");
        if (criadoApos) query = query.gte("created_at", criadoApos);
        const criadoAntes = q.get("criado_antes") ?? q.get("ate");
        if (criadoAntes) query = query.lt("created_at", plusOneDay(criadoAntes));
        const atualizadoApos = q.get("atualizado_apos");
        if (atualizadoApos) query = query.gte("updated_at", atualizadoApos);

        // Ordenação
        const orderByRaw = q.get("order_by") ?? "created_at";
        const orderBy = ORDER_BY_ALLOWED.has(orderByRaw) ? orderByRaw : "created_at";
        const ascending = (q.get("order") ?? "desc").toLowerCase() === "asc";

        query = query.order(orderBy, { ascending }).range(offset, offset + limit - 1);

        const { data, error, count } = await query;
        if (error) {
          console.error("[/api/public/leads] erro:", error);
          return jsonResponse({ error: error.message }, 500);
        }

        return jsonResponse({
          total: count ?? data?.length ?? 0,
          limit,
          offset,
          data: (data ?? []).map((l) =>
            shapeLeadForPublic(l as unknown as Record<string, unknown>),
          ),
        });
      },
    },
  },
});
