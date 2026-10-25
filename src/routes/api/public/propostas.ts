import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PROPOSTA_TOKEN_RE } from "@/lib/proposta-link";

// Sinais de leitura do Link de Proposta (abertura, heartbeat de 15s, saída por
// sendBeacon). Público: o token é a credencial; cada sinal consome o limite.

const sinalSchema = z.object({
  token: z.string().regex(PROPOSTA_TOKEN_RE),
  chave: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  aparelho: z.string().max(40).nullable().default(null),
  navegador: z.string().max(40).nullable().default(null),
  tempo_total_s: z.number().int().min(0).max(14400),
  profundidade: z.number().int().min(0).max(100),
  tempo_por_secao: z.record(z.string().max(40), z.number().min(0).max(14400)),
  eventos: z
    .array(
      z.object({
        tipo: z.enum(["abertura", "secao_vista", "clique_whatsapp", "clique_mapa", "fluxo_visto", "visita_pedida"]),
        secao: z.string().max(40).nullable().optional(),
        chave: z.string().min(8).max(80),
      }),
    )
    .max(20)
    .default([]),
});

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

export const Route = createFileRoute("/api/public/propostas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const text = await request.text();
          if (text.length > 8_192) return json({ ok: false }, 422);
          const input = sinalSchema.parse(JSON.parse(text));
          const server = await import("@/lib/proposta-publica.server");
          const hash = await server.hashToken(input.token);
          const consumo = await server.consumirRequisicao(hash);
          if (consumo === "not_found") return json({ ok: false }, 404);
          if (consumo !== "allowed") return json({ ok: false }, 429);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.rpc("registrar_proposta_sinal", {
            _token_hash: hash,
            _chave: input.chave,
            _aparelho: input.aparelho ?? "",
            _navegador: input.navegador ?? "",
            _tempo_total_s: input.tempo_total_s,
            _profundidade: input.profundidade,
            _tempo_por_secao: input.tempo_por_secao,
            _eventos: input.eventos,
          });
          if (error) return json({ ok: false }, 500);
          return json({ ok: true }, 202);
        } catch (error) {
          if (error instanceof SyntaxError || error instanceof z.ZodError) return json({ ok: false }, 422);
          console.error("[propostas-publica] falha inesperada");
          return json({ ok: false }, 500);
        }
      },
    },
  },
});
