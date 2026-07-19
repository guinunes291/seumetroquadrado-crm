// PATCH /api/public/leads/:id/perda → grava motivo de perda do lead
// Body: {
//   motivo_perda_categoria: "credito_score" | ... (11 valores válidos),
//   motivo_perda_obs?: string,          // grava em leads.motivo_perdido
//   data_perda?: string ISO,            // fallback: now() quando marcar perdido / lead já perdido sem data
//   marcar_status_perdido?: boolean     // default false — só grava campos de perda
// }
// Auth: cliente com escopo leads:write.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, corsPreflight } from "@/lib/public-api-auth";
import {
  apiClientAgent,
  requireApiClientScope,
  requireApiLeadAccess,
} from "@/lib/api-client-auth.server";
import { auditarEscrita, clientIp } from "@/lib/write-api-auth";

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
        const auth = await requireApiClientScope(request, "leads:write");
        if (auth instanceof Response) return auth;
        const agente = apiClientAgent(auth);
        const ip = clientIp(request);

        const id = params.id;
        if (!UUID_RE.test(id)) {
          return jsonResponse({ error: "id inválido (esperado UUID)" }, 400);
        }
        const accessError = await requireApiLeadAccess(auth, id);
        if (accessError) return accessError;

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
        const motivoTransicao = obsRaw ? `${categoria}: ${obsRaw}` : categoria;
        if (marcarPerdido && motivoTransicao.length > 1000) {
          return jsonResponse({ error: "motivo de perda excede 1000 caracteres" }, 422);
        }

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
        } = {
          motivo_perda_categoria: categoria as MotivoValido,
          motivo_perdido: obsRaw ? obsRaw : null,
        };
        if (dataPerdaFinal !== null) patch.data_perda = dataPerdaFinal;

        const mutationResult = marcarPerdido
          ? await supabaseAdmin.rpc("transicionar_lead_api_perda", {
              p_categoria: categoria,
              p_data_perda: dataPerdaFinal ?? undefined,
              p_lead_id: id,
              p_motivo: obsRaw || undefined,
            })
          : await supabaseAdmin.from("leads").update(patch).eq("id", id);
        if (mutationResult.error) {
          const status = ["22023", "23514"].includes(mutationResult.error.code) ? 422 : 500;
          await auditarEscrita({
            agente,
            acao: "lead.perda",
            lead_id: id,
            payload: { categoria, marcar_status_perdido: marcarPerdido },
            resultado: "erro",
            http_status: status,
            ip,
          });
          return jsonResponse({ error: mutationResult.error.message }, status);
        }

        const { data: updated, error: selectError } = await supabaseAdmin
          .from("leads")
          .select(PERDA_SELECT)
          .eq("id", id)
          .single();
        if (selectError) return jsonResponse({ error: selectError.message }, 500);

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
          payload: { categoria, marcar_status_perdido: marcarPerdido },
          resultado: "ok",
          http_status: 200,
          ip,
        });

        return jsonResponse({ ok: true, lead: updated });
      },
    },
  },
});
