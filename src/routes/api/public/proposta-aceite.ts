import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PROPOSTA_TOKEN_RE, cpfValido } from "@/lib/proposta-link";

// Aceite digital do Link de Proposta. Público: o token é a credencial.
// Grava IP e user agent; o CPF vai ao banco só como hash + 3 últimos dígitos.

const schema = z.object({
  token: z.string().regex(PROPOSTA_TOKEN_RE),
  opcao: z.number().int().min(1).max(3),
  nome: z.string().trim().min(5).max(160),
  cpf: z.string().max(20).refine(cpfValido, "CPF inválido"),
  concordo: z.literal(true),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

export const Route = createFileRoute("/api/public/proposta-aceite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const text = await request.text();
          if (text.length > 4096) return json({ ok: false, motivo: "invalid_input" }, 422);
          const input = schema.parse(JSON.parse(text));
          const server = await import("@/lib/proposta-publica.server");
          const ip =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            request.headers.get("x-real-ip");
          const r = await server.aceitarPropostaPublica({
            token: input.token,
            opcao: input.opcao,
            nome: input.nome,
            cpf: input.cpf,
            ip,
            userAgent: request.headers.get("user-agent"),
          });
          if (r.ok) {
            const { despacharAvisosProposta } = await import("@/lib/proposta-avisos.server");
            await despacharAvisosProposta(5).catch(() => undefined);
          }
          return json(r, r.ok ? 200 : r.motivo === "limite" ? 429 : 409);
        } catch (error) {
          if (error instanceof SyntaxError || error instanceof z.ZodError) return json({ ok: false, motivo: "invalid_input" }, 422);
          console.error("[proposta-aceite] falha inesperada");
          return json({ ok: false, motivo: "indisponivel" }, 500);
        }
      },
    },
  },
});
