// POST /api/public/escrita/ping
// Prova ponta a ponta: guard (401) → allowlist (403) → auditoria (200).
// Não escreve em nenhum lead — só grava 1 linha em api_escrita_log.
import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight } from "@/lib/public-api-auth";
import {
  requireWriteKey,
  requireAgentePermitido,
  auditarEscrita,
  writeJson,
  clientIp,
} from "@/lib/write-api-auth";

export const Route = createFileRoute("/api/public/escrita/ping")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      POST: async ({ request }) => {
        const ip = clientIp(request);

        // 1) Guard da chave (401)
        const authErr = requireWriteKey(request);
        if (authErr) return authErr;

        // 2) Corpo JSON
        let body: Record<string, unknown> = {};
        try {
          const raw = await request.text();
          body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
          return writeJson({ ok: false, erro: "JSON inválido" }, 400);
        }

        // 3) Allowlist (403 / 422)
        const perm = await requireAgentePermitido(body.agente, "ping");
        if (perm instanceof Response) {
          // Auditoria da tentativa negada (agente informado ou não)
          await auditarEscrita({
            agente: typeof body.agente === "string" ? body.agente : null,
            acao: "ping",
            payload: body,
            resultado: "erro",
            http_status: perm.status,
            ip,
          });
          return perm;
        }

        // 4) Auditoria de sucesso
        const logId = await auditarEscrita({
          agente: perm.agente,
          acao: "ping",
          payload: body,
          resultado: "ok",
          http_status: 200,
          ip,
        });

        return writeJson({ ok: true, log_id: logId });
      },
    },
  },
});
