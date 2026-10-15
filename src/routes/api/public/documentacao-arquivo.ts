import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ARQUIVO_MAX_BYTES, PASTA_TOKEN_RE } from "@/lib/documentacao-link";

// Upload público para a pasta do cliente (/pasta/<token>): um arquivo por
// requisição (multipart). O corpo grande é recusado antes de ser lido; o
// limite distribuído da pasta vale antes de tudo; o conteúdo é conferido pela
// assinatura do arquivo no servidor (documentacao-link.server).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** O arquivo mais o envelope do multipart. */
const CORPO_MAX_BYTES = ARQUIVO_MAX_BYTES + 64 * 1024;

const camposSchema = z.union([
  z.object({
    token: z.string().regex(PASTA_TOKEN_RE),
    documentacao_id: z.string().regex(UUID_RE),
    tipo: z.undefined(),
  }),
  z.object({
    token: z.string().regex(PASTA_TOKEN_RE),
    documentacao_id: z.undefined(),
    tipo: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
  }),
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

function campo(form: FormData, nome: string): string | undefined {
  const v = form.get(nome);
  return typeof v === "string" && v !== "" ? v : undefined;
}

export const Route = createFileRoute("/api/public/documentacao-arquivo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // O navegador sempre manda o tamanho do multipart; sem ele (corpo em
          // chunks) não dá para recusar antes de ler.
          const tamanho = Number(request.headers.get("content-length") ?? "0");
          if (!Number.isFinite(tamanho) || tamanho <= 0) {
            return json({ ok: false, error: "invalid_input" }, 411);
          }
          if (tamanho > CORPO_MAX_BYTES) {
            return json({ ok: false, error: "arquivo_grande" }, 413);
          }
          const form = await request.formData();
          const campos = camposSchema.parse({
            token: campo(form, "token"),
            documentacao_id: campo(form, "documentacao_id"),
            tipo: campo(form, "tipo"),
          });
          const arquivo = form.get("arquivo");
          if (!(arquivo instanceof File)) {
            return json({ ok: false, error: "arquivo_invalido" }, 422);
          }

          const server = await import("@/lib/documentacao-link.server");
          await server.consumirPasta(campos.token);
          const alvo = campos.documentacao_id
            ? { documentacaoId: campos.documentacao_id }
            : { tipo: campos.tipo! };
          const enviado = await server.enviarArquivo(campos.token, alvo, arquivo);
          return json({ ok: true, ...enviado }, 201);
        } catch (error) {
          const { DocumentacaoLinkError } = await import("@/lib/documentacao-link.server");
          if (error instanceof DocumentacaoLinkError) {
            const headers: Record<string, string> =
              error.status === 429 ? { "retry-after": "60" } : {};
            const code = error.status >= 500 ? "service_unavailable" : error.code;
            return json({ ok: false, error: code }, error.status, headers);
          }
          if (error instanceof z.ZodError || error instanceof TypeError) {
            return json({ ok: false, error: "invalid_input" }, 422);
          }
          // Nunca registrar request/body: carregam documentos do cliente.
          console.error("[documentacao-arquivo] falha inesperada");
          return json({ ok: false, error: "internal_error" }, 500);
        }
      },
    },
  },
});
