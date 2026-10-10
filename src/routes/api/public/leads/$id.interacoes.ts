// POST /api/public/leads/:id/interacoes → grava nota interna na Timeline do lead
// (ex.: resumo do handoff enviado ao corretor pelo agente Marcão / n8n).
// Auth: X-API-Key (escopo events:write)
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, corsPreflight } from "@/lib/public-api-auth";
import {
  apiClientAgent,
  requireApiClientScope,
  requireApiLeadAccess,
} from "@/lib/api-client-auth.server";
import { auditarEscrita, clientIp } from "@/lib/write-api-auth";
import type { Json } from "@/integrations/supabase/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CONTEUDO = 6000;
const MAX_TITULO = 120;
const MAX_CHAVE = 120;
const MAX_METADATA_BYTES = 4_096;
const TITULO_PADRAO = "Resumo do handoff (Marcão)";

export const Route = createFileRoute("/api/public/leads/$id/interacoes")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),

      POST: async ({ request, params }) => {
        const auth = await requireApiClientScope(request, "events:write");
        if (auth instanceof Response) return auth;
        const agente = apiClientAgent(auth);
        const ip = clientIp(request);
        if (!UUID_RE.test(params.id)) return jsonResponse({ error: "id inválido" }, 400);
        const accessError = await requireApiLeadAccess(auth, params.id);
        if (accessError) return accessError;

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonResponse({ error: "JSON inválido" }, 400);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return jsonResponse({ error: "JSON inválido" }, 400);
        }

        const conteudo = typeof body.conteudo === "string" ? body.conteudo.trim() : "";
        if (!conteudo || conteudo.length > MAX_CONTEUDO) {
          return jsonResponse(
            { error: `conteudo é obrigatório (1 a ${MAX_CONTEUDO} caracteres)` },
            422,
          );
        }

        let titulo = TITULO_PADRAO;
        if (body.titulo !== undefined && body.titulo !== null) {
          if (typeof body.titulo !== "string") {
            return jsonResponse({ error: "titulo deve ser texto" }, 422);
          }
          const t = body.titulo.trim();
          if (t.length > MAX_TITULO) {
            return jsonResponse({ error: `titulo excede ${MAX_TITULO} caracteres` }, 422);
          }
          if (t) titulo = t;
        }

        let chaveDedupe: string | null = null;
        if (body.chave_dedupe !== undefined && body.chave_dedupe !== null) {
          if (typeof body.chave_dedupe !== "string") {
            return jsonResponse({ error: "chave_dedupe deve ser texto" }, 422);
          }
          const c = body.chave_dedupe.trim();
          if (c.length > MAX_CHAVE) {
            return jsonResponse({ error: `chave_dedupe excede ${MAX_CHAVE} caracteres` }, 422);
          }
          chaveDedupe = c || null;
        }

        let metadataIn: { [key: string]: Json | undefined } = {};
        if (body.metadata !== undefined && body.metadata !== null) {
          if (typeof body.metadata !== "object" || Array.isArray(body.metadata)) {
            return jsonResponse({ error: "metadata deve ser um objeto" }, 422);
          }
          let size = Infinity;
          try {
            size = JSON.stringify(body.metadata).length;
          } catch {
            return jsonResponse({ error: "metadata não serializável" }, 422);
          }
          if (size > MAX_METADATA_BYTES) {
            return jsonResponse({ error: `metadata excede ${MAX_METADATA_BYTES} bytes` }, 413);
          }
          // Veio de request.json() e já foi conferido como objeto: é JSON.
          metadataIn = body.metadata as { [key: string]: Json | undefined };
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: lead, error: chkErr } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("id", params.id)
          .maybeSingle();
        if (chkErr) return jsonResponse({ error: chkErr.message }, 500);
        if (!lead) return jsonResponse({ error: "lead não encontrado" }, 404);

        if (chaveDedupe) {
          const { data: existente, error: dupErr } = await supabaseAdmin
            .from("interacoes")
            .select("*")
            .eq("lead_id", params.id)
            .eq("metadata->>chave_dedupe", chaveDedupe)
            .is("deleted_at", null)
            .limit(1)
            .maybeSingle();
          if (dupErr) return jsonResponse({ error: dupErr.message }, 500);
          if (existente) {
            return jsonResponse({ ok: true, duplicado: true, interacao: existente }, 200);
          }
        }

        const metadata: Json = {
          ...metadataIn,
          fonte: "api_publica",
          endpoint: "leads/:id/interacoes",
          agente,
          chave_dedupe: chaveDedupe,
        };

        const { data, error } = await supabaseAdmin
          .from("interacoes")
          .insert({
            lead_id: params.id,
            autor_id: null,
            tipo: "nota",
            direcao: "interna",
            titulo,
            conteudo,
            metadata,
            ocorreu_em: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          await auditarEscrita({
            agente,
            acao: "lead.interacao",
            lead_id: params.id,
            payload: { titulo, chave_dedupe: chaveDedupe },
            resultado: "erro",
            http_status: 500,
            ip,
          });
          return jsonResponse({ error: error.message }, 500);
        }

        await auditarEscrita({
          agente,
          acao: "lead.interacao",
          lead_id: params.id,
          payload: { titulo, chave_dedupe: chaveDedupe },
          resultado: "ok",
          http_status: 201,
          ip,
        });
        return jsonResponse({ ok: true, interacao: data }, 201);
      },
    },
  },
});
