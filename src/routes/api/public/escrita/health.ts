// GET /api/public/escrita/health
// Prova só o guard da chave de escrita. Não toca em tabela nenhuma.
import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight } from "@/lib/public-api-auth";
import { requireWriteKey, writeJson } from "@/lib/write-api-auth";

export const Route = createFileRoute("/api/public/escrita/health")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const authErr = requireWriteKey(request);
        if (authErr) return authErr;
        return writeJson({ ok: true, versao: "escrita-v2-fundacao" });
      },
    },
  },
});
