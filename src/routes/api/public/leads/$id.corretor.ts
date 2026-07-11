// PATCH /api/public/leads/:id/corretor → troca o corretor do lead
// Body: { corretor_id: uuid, motivo?: string, origem?: string }
// Auth: header X-API-Key = MCP_WRITE_API_KEY (READ_API_KEY aceita em transição —
// ver requireWriteKeyOrLegacy). Toda escrita é auditada em api_escrita_log.
import { createFileRoute } from "@tanstack/react-router";
import {
  jsonResponse,
  corsPreflight,
  PUBLIC_LEAD_SELECT,
  shapeLeadForPublic,
} from "@/lib/public-api-auth";
import {
  requireWriteKeyOrLegacy,
  writeAgentLabel,
  auditarEscrita,
  clientIp,
} from "@/lib/write-api-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/leads/$id/corretor")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),

      PATCH: async ({ request, params }) => {
        const auth = requireWriteKeyOrLegacy(request);
        if (auth instanceof Response) return auth;
        const agente = writeAgentLabel(auth.mode);
        const ip = clientIp(request);

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

        const corretorId = typeof body.corretor_id === "string" ? body.corretor_id.trim() : "";
        if (!UUID_RE.test(corretorId)) {
          return jsonResponse({ error: "corretor_id inválido (esperado UUID)" }, 422);
        }

        const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";
        const origem =
          typeof body.origem === "string" && body.origem.trim()
            ? body.origem.trim()
            : "realocacao-automatica";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: lead, error: leadErr } = await supabaseAdmin
          .from("leads")
          .select("id, corretor_id, nome")
          .eq("id", id)
          .maybeSingle();
        if (leadErr) return jsonResponse({ error: leadErr.message }, 500);
        if (!lead) return jsonResponse({ error: "lead não encontrado" }, 404);

        const { data: destino, error: destErr } = await supabaseAdmin
          .from("profiles")
          .select("id, nome, ativo")
          .eq("id", corretorId)
          .maybeSingle();
        if (destErr) return jsonResponse({ error: destErr.message }, 500);
        if (!destino) return jsonResponse({ error: "corretor destino não encontrado" }, 404);
        if (!destino.ativo) {
          return jsonResponse({ error: "corretor destino não está ativo" }, 422);
        }

        const anteriorId = lead.corretor_id as string | null;
        let anteriorNome: string | null = null;
        if (anteriorId) {
          const { data: ant } = await supabaseAdmin
            .from("profiles")
            .select("nome")
            .eq("id", anteriorId)
            .maybeSingle();
          anteriorNome = (ant?.nome as string | null) ?? null;
        }

        // RPC canônica de transferência: além do corretor_id, renova
        // data_distribuicao (sem isso o job de redistribuição de parados
        // desfazia a realocação em minutos) e registra em distribution_log.
        const { error: upErr } = await supabaseAdmin.rpc(
          "transferir_leads" as never,
          { _ids: [id], _corretor: corretorId } as never,
        );
        if (upErr) {
          await auditarEscrita({
            agente,
            acao: "lead.corretor",
            lead_id: id,
            payload: { corretor_id: corretorId, motivo: motivo || null, origem },
            resultado: "erro",
            http_status: 500,
            ip,
          });
          return jsonResponse({ error: upErr.message }, 500);
        }

        const { data: updated, error: selErr } = await supabaseAdmin
          .from("leads")
          .select(PUBLIC_LEAD_SELECT)
          .eq("id", id)
          .single();
        if (selErr) return jsonResponse({ error: selErr.message }, 500);

        const conteudo = `Lead realocado.${motivo ? ` Motivo: ${motivo}` : ""}`;

        await supabaseAdmin.from("interacoes").insert({
          lead_id: id,
          tipo: "nota",
          direcao: "interna",
          titulo: "Lead realocado",
          conteudo,
          metadata: {
            fonte: "api_publica",
            origem,
            motivo: motivo || null,
            auth_mode: auth.mode,
          },
        });

        await auditarEscrita({
          agente,
          acao: "lead.corretor",
          lead_id: id,
          payload: {
            corretor_anterior: anteriorId,
            corretor_novo: corretorId,
            motivo: motivo || null,
            origem,
          },
          resultado: "ok",
          http_status: 200,
          ip,
        });

        return jsonResponse({
          ok: true,
          lead: shapeLeadForPublic(updated as unknown as Record<string, unknown>),
          corretor_anterior: anteriorId ? { id: anteriorId, nome: anteriorNome } : null,
          corretor_novo: { id: corretorId, nome: destino.nome ?? null },
        });
      },
    },
  },
});
