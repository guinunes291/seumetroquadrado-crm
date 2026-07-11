import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createVitrineLinkInputSchema, revokeVitrineLinkInputSchema } from "@/lib/vitrine-publica";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_CHARS = 8_192;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

async function body(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) throw new SyntaxError("body_too_large");
  return JSON.parse(text);
}

async function handleError(error: unknown): Promise<Response> {
  const { VitrineRequestError } = await import("@/lib/vitrine-publica.server");
  if (error instanceof VitrineRequestError) {
    return json({ ok: false, error: error.code }, error.status);
  }
  if (error instanceof SyntaxError || error instanceof z.ZodError) {
    return json({ ok: false, error: "invalid_input" }, 422);
  }
  // Não serializar o erro: payloads de criação contêm o token bruto apenas na
  // resposta de sucesso e nunca devem chegar aos logs da aplicação.
  console.error("[vitrine-links] falha inesperada");
  return json({ ok: false, error: "internal_error" }, 500);
}

export const Route = createFileRoute("/api/vitrine-links")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const server = await import("@/lib/vitrine-publica.server");
          const auth = await server.authenticateVitrineRequest(request);
          const input = createVitrineLinkInputSchema.parse(await body(request));
          const result = await server.createSecureVitrineLink({
            auth,
            leadId: input.lead_id,
            projectIds: input.project_ids,
            expiresInDays: input.expires_in_days,
          });
          return json(
            {
              ok: true,
              id: result.id,
              path: result.path,
              expires_at: result.expiresAt,
            },
            201,
          );
        } catch (error) {
          return handleError(error);
        }
      },

      GET: async ({ request }) => {
        try {
          const server = await import("@/lib/vitrine-publica.server");
          const auth = await server.authenticateVitrineRequest(request);
          const leadId = new URL(request.url).searchParams.get("lead_id") ?? "";
          if (!UUID_RE.test(leadId)) return json({ ok: false, error: "invalid_input" }, 422);
          const links = await server.listSecureVitrineLinks(auth, leadId);
          return json({ ok: true, links });
        } catch (error) {
          return handleError(error);
        }
      },

      DELETE: async ({ request }) => {
        try {
          const server = await import("@/lib/vitrine-publica.server");
          const auth = await server.authenticateVitrineRequest(request);
          const input = revokeVitrineLinkInputSchema.parse(await body(request));
          await server.revokeSecureVitrineLink(auth, input.link_id);
          return json({ ok: true });
        } catch (error) {
          return handleError(error);
        }
      },
    },
  },
});
