import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  DOCUMENTACAO_LINK_SLUG_RE,
  PASTA_TOKEN_RE,
  iniciarDocumentacaoSchema,
  perfilPastaSchema,
} from "@/lib/documentacao-link";

// API das páginas públicas /documentos/<slug> (link fixo do corretor) e
// /pasta/<token> (a pasta do cliente). Sem login: o slug e o token são os
// links. Toda requisição consome o limite distribuído do link ou da pasta
// ANTES de ler ou escrever; o resto da defesa (portas do registro mãe, tetos,
// itens fechados) mora nas RPCs, numa transação só. Os arquivos vão por
// /api/public/documentacao-arquivo.

const linkSchema = z.object({
  action: z.literal("link"),
  slug: z.string().regex(DOCUMENTACAO_LINK_SLUG_RE),
});
const iniciarSchema = iniciarDocumentacaoSchema.extend({ action: z.literal("iniciar") });
const pastaSchema = z.object({
  action: z.literal("pasta"),
  token: z.string().regex(PASTA_TOKEN_RE),
});
const perfilSchema = perfilPastaSchema.extend({ action: z.literal("perfil") });
const requestSchema = z.discriminatedUnion("action", [
  linkSchema,
  iniciarSchema,
  pastaSchema,
  perfilSchema,
]);

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

export const Route = createFileRoute("/api/public/documentacao")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const text = await request.text();
          if (text.length > 8_192) return json({ ok: false, error: "invalid_request" }, 422);
          const input = requestSchema.parse(JSON.parse(text));
          const server = await import("@/lib/documentacao-link.server");

          switch (input.action) {
            case "link": {
              await server.consumirLink(input.slug);
              return json({ ok: true, ...(await server.carregarLink(input.slug)) });
            }
            case "iniciar": {
              await server.consumirLink(input.slug);
              const { action: _action, ...dados } = input;
              return json({ ok: true, ...(await server.iniciar(dados)) }, 201);
            }
            case "pasta": {
              await server.consumirPasta(input.token);
              return json({ ok: true, ...(await server.carregarPasta(input.token)) });
            }
            case "perfil": {
              await server.consumirPasta(input.token);
              const { action: _action, ...dados } = input;
              return json({ ok: true, ...(await server.definirPerfil(dados)) });
            }
          }
        } catch (error) {
          const { DocumentacaoLinkError } = await import("@/lib/documentacao-link.server");
          if (error instanceof DocumentacaoLinkError) {
            const headers: Record<string, string> =
              error.status === 429 ? { "retry-after": "60" } : {};
            const code = error.status >= 500 ? "service_unavailable" : error.code;
            return json({ ok: false, error: code }, error.status, headers);
          }
          if (error instanceof SyntaxError || error instanceof z.ZodError) {
            return json({ ok: false, error: "invalid_input" }, 422);
          }
          // Nunca registrar request/body: carregam nome, telefone, e-mail e CPF.
          console.error("[documentacao-publica] falha inesperada");
          return json({ ok: false, error: "internal_error" }, 500);
        }
      },
    },
  },
});
