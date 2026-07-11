import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { VITRINE_TOKEN_RE, vitrinePublicEventSchema } from "@/lib/vitrine-publica";

const loadSchema = z.object({
  action: z.literal("load"),
  token: z.string().regex(VITRINE_TOKEN_RE),
  request_id: z.string().uuid(),
});
const eventSchema = z.object({
  action: z.literal("event"),
  token: z.string().regex(VITRINE_TOKEN_RE),
  request_id: z.string().uuid(),
  event: vitrinePublicEventSchema,
});
const requestSchema = z.discriminatedUnion("action", [loadSchema, eventSchema]);

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export const Route = createFileRoute("/api/public/vitrine")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const text = await request.text();
          if (text.length > 8_192) return json({ ok: false, error: "invalid_request" }, 422);
          const input = requestSchema.parse(JSON.parse(text));
          const server = await import("@/lib/vitrine-publica.server");
          await server.consumePublicVitrineRequest(input.token);

          if (input.action === "load") {
            const payload = await server.loadPublicVitrine(input.token);
            // Telemetria nunca impede o cliente de ver uma seleção já validada.
            try {
              await server.recordPublicVitrineEvent(
                input.token,
                { type: "opened" },
                input.request_id,
              );
            } catch {
              // Sem log: o request contém um token bruto e o evento é best-effort.
            }
            return json({ ok: true, ...payload });
          }

          await server.recordPublicVitrineEvent(input.token, input.event, input.request_id);
          return json({ ok: true }, 202);
        } catch (error) {
          const { VitrineRequestError } = await import("@/lib/vitrine-publica.server");
          if (error instanceof VitrineRequestError) {
            if (error.status === 429) {
              return json({ ok: false, error: "rate_limited" }, 429, {
                "retry-after": "60",
              });
            }
            if (error.status === 404 || error.status === 410) {
              return json({ ok: false, error: "not_found" }, error.status);
            }
            if (error.status >= 500) {
              return json({ ok: false, error: "service_unavailable" }, error.status);
            }
            return json({ ok: false, error: "internal_error" }, 500);
          }
          if (error instanceof SyntaxError || error instanceof z.ZodError) {
            return json({ ok: false, error: "invalid_request" }, 422);
          }
          // Nunca registrar request/body: ele contém o token bruto.
          console.error("[vitrine-publica] falha inesperada");
          return json({ ok: false, error: "internal_error" }, 500);
        }
      },
    },
  },
});
