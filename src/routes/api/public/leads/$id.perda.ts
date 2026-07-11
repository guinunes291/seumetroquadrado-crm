// PATCH /api/public/leads/:id/perda → grava motivo de perda do lead
// Body: {
//   motivo_perda_categoria: "credito_score" | ... (11 valores válidos),
//   motivo_perda_obs?: string,          // grava em leads.motivo_perdido
//   data_perda?: string ISO,            // fallback: now() quando marcar perdido / lead já perdido sem data
//   marcar_status_perdido?: boolean     // default false — só grava campos de perda
// }
// Auth: header X-API-Key = MCP_WRITE_API_KEY (READ_API_KEY aceita em transição).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, corsPreflight } from "@/lib/public-api-auth";
import {
  requireWriteKeyOrLegacy,
  writeAgentLabel,
  auditarEscrita,
  clientIp,
} from "@/lib/write-api-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MOTIVOS_VALIDOS = [
  "sem_contato",
  "sumiu_pos_proposta",
  "credito_score",
  "credito_renda",
  "estourou_teto",
  "ja_possui_imovel",
  "preco_parcela",
  "comprou_concorrente",
  "timing_adiou",
  "sem_perfil",
  "outro",
] as const;

type MotivoValido = (typeof MOTIVOS_VALIDOS)[number];

const PERDA_SELECT = "id, status, motivo_perda_categoria, motivo_perdido, data_perda";

export const Route = createFileRoute("/api/public/leads/$id/perda")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),

      PATCH: async ({ request, params }) => {
        const auth = requireWriteKeyOrLegacy(request);
        if (auth instanceof Response) return auth;
        const agente = writeAgentLabel(auth.mode);
        const ip = clientIp(request);

        const id = params.id;
        if (!UUID_RE.test(id)) {
          return jsonResponse({ error: "id inválido (esperado UUID)" }, 400);
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonResponse({ error: "JSON inválido" }, 400);
        }
        if (!body || typeof body !== "object") {
          return jsonResponse({ error: "body deve ser objeto JSON" }, 400);
        }

        const categoria =
          typeof body.motivo_perda_categoria === "string" ? body.motivo_perda_categoria.trim() : "";
        if (!categoria) {
          return jsonResponse(
            {
              error: "motivo_perda_categoria é obrigatório",
              motivos_validos: MOTIVOS_VALIDOS,
            },
            422,
          );
        }
        if (!(MOTIVOS_VALIDOS as readonly string[]).includes(categoria)) {
          return jsonResponse(
            {
              error: "motivo_perda_categoria inválido",
              motivos_validos: MOTIVOS_VALIDOS,
            },
            422,
          );
        }

        const obsRaw =
          typeof body.motivo_perda_obs === "string" ? body.motivo_perda_obs.trim() : "";
        if (categoria === "outro" && !obsRaw) {
          return jsonResponse(
            {
              error: "motivo_perda_obs é obrigatório quando motivo_perda_categoria = 'outro'",
            },
            422,
          );
        }

        // data_perda opcional
        let dataPerdaProvided: string | null = null;
        if (body.data_perda !== undefined && body.data_perda !== null) {
          if (typeof body.data_perda !== "string") {
            return jsonResponse({ error: "data_perda deve ser string ISO" }, 422);
          }
          const t = Date.parse(body.data_perda);
          if (Number.isNaN(t)) {
            return jsonResponse({ error: "data_perda inválida (esperado ISO 8601)" }, 422);
          }
          dataPerdaProvided = new Date(t).toISOString();
        }

        const marcarPerdido = body.marcar_status_perdido === true;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: lead, error: leadErr } = await supabaseAdmin
          .from("leads")
          .select("id, status, data_perda")
          .eq("id", id)
          .maybeSingle();
        if (leadErr) return jsonResponse({ error: leadErr.message }, 500);
        if (!lead) return jsonResponse({ error: "lead não encontrado" }, 404);

        // Resolver data_perda final
        let dataPerdaFinal: string | null = null;
        if (dataPerdaProvided) {
          dataPerdaFinal = dataPerdaProvided;
        } else if (marcarPerdido) {
          dataPerdaFinal = new Date().toISOString();
        } else if (lead.status === "perdido" && !lead.data_perda) {
          dataPerdaFinal = new Date().toISOString();
        } else {
          // mantém o que houver
          dataPerdaFinal = (lead.data_perda as string | null) ?? null;
        }

        const patch: {
          motivo_perda_categoria: MotivoValido;
          motivo_perdido: string | null;
          data_perda?: string;
          status?: string;
        } = {
          motivo_perda_categoria: categoria as MotivoValido,
          motivo_perdido: obsRaw ? obsRaw : null,
        };
        if (dataPerdaFinal !== null) patch.data_perda = dataPerdaFinal;
        if (marcarPerdido) patch.status = "perdido";

        const { data: updated, error: upErr } = await supabaseAdmin
          .from("leads")
          .update(patch as never)
          .eq("id", id)
          .select(PERDA_SELECT)
          .single();
        if (upErr) {
          await auditarEscrita({
            agente,
            acao: "lead.perda",
            lead_id: id,
            payload: { categoria, marcar_status_perdido: marcarPerdido },
            resultado: "erro",
            http_status: 500,
            ip,
          });
          return jsonResponse({ error: upErr.message }, 500);
        }

        // Auditoria: registra no histórico do lead sem expor a chave.
        await supabaseAdmin.from("interacoes").insert({
          lead_id: id,
          tipo: "nota",
          direcao: "interna",
          titulo: "Motivo de perda atualizado (API)",
          conteudo: `Categoria: ${categoria}${obsRaw ? `. Observação: ${obsRaw}` : ""}`,
          metadata: {
            fonte: "api_publica",
            endpoint: "leads/:id/perda",
            auth_mode: auth.mode,
            marcar_status_perdido: marcarPerdido,
            registrado_em: new Date().toISOString(),
          },
        });

        await auditarEscrita({
          agente,
          acao: "lead.perda",
          lead_id: id,
          payload: { categoria, obs: obsRaw || null, marcar_status_perdido: marcarPerdido },
          resultado: "ok",
          http_status: 200,
          ip,
        });

        return jsonResponse({ ok: true, lead: updated });
      },
    },
  },
});
