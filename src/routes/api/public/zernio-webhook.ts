// POST /api/public/zernio-webhook — eventos do Zernio para a automação de DM
// do Instagram (message.received e comment.received).
//
// Pública de propósito (o Zernio chama de fora), protegida pela assinatura:
// X-Zernio-Signature = HMAC-SHA256 do corpo CRU com o segredo gerado no botão
// "Conectar ao Instagram". Por isso o corpo é lido como texto antes de
// qualquer JSON.parse: reserializar mudaria os bytes e a assinatura.
//
// Respostas: 2xx encerra a entrega; 5xx faz o Zernio reentregar (até 7 vezes
// em ~51 h). Usamos 5xx só quando vale tentar de novo (envio falhou, banco
// fora); evento repetido ou sem palavra-chave responde 200.
import { createFileRoute } from "@tanstack/react-router";

const MAX_BODY_BYTES = 256 * 1024;

export const Route = createFileRoute("/api/public/zernio-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const corpo = await request.text();
        if (corpo.length > MAX_BODY_BYTES) {
          return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
        }
        const assinatura =
          request.headers.get("x-zernio-signature") ?? request.headers.get("x-late-signature");
        const { processarWebhookZernio } = await import("@/lib/instagram-dm.server");
        const r = await processarWebhookZernio(corpo, assinatura);
        return Response.json(r.body, { status: r.status });
      },
    },
  },
});
