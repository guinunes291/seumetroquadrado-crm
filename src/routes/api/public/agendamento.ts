import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AGENDAMENTO_LINK_SLUG_RE, agendarPeloLinkSchema } from "@/lib/agendamento-link";

// API da página pública /agendar/<slug>. Sem login: o slug é o link do
// corretor. Toda requisição consome o limite distribuído do link ANTES de ler
// ou escrever; o resto da defesa (horário livre, portas do registro mãe,
// tetos de envio) mora na RPC, numa transação só.

const loadSchema = z.object({
  action: z.literal("load"),
  slug: z.string().regex(AGENDAMENTO_LINK_SLUG_RE),
});
const agendarSchema = agendarPeloLinkSchema.extend({ action: z.literal("agendar") });
const requestSchema = z.discriminatedUnion("action", [loadSchema, agendarSchema]);

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

export const Route = createFileRoute("/api/public/agendamento")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const text = await request.text();
          if (text.length > 8_192) return json({ ok: false, error: "invalid_request" }, 422);
          const input = requestSchema.parse(JSON.parse(text));
          const server = await import("@/lib/agendamento-link.server");
          await server.consumirRequisicao(input.slug);

          if (input.action === "load") {
            const link = await server.carregarLinkPublico(input.slug);
            return json({ ok: true, ...link });
          }

          const { action: _action, ...dados } = input;
          const confirmado = await server.agendarPeloLink(dados);
          return json({ ok: true, ...confirmado }, 201);
        } catch (error) {
          const { AgendamentoLinkError } = await import("@/lib/agendamento-link.server");
          if (error instanceof AgendamentoLinkError) {
            const headers: Record<string, string> =
              error.status === 429 ? { "retry-after": "60" } : {};
            const code = error.status >= 500 ? "service_unavailable" : error.code;
            return json({ ok: false, error: code }, error.status, headers);
          }
          if (error instanceof SyntaxError || error instanceof z.ZodError) {
            return json({ ok: false, error: "invalid_input" }, 422);
          }
          // Nunca registrar request/body: carregam nome, telefone, e-mail e CPF.
          console.error("[agendamento-publico] falha inesperada");
          return json({ ok: false, error: "internal_error" }, 500);
        }
      },
    },
  },
});
