// GET /api/public/escrita/health
// Prova só o guard da chave de escrita. Não toca em tabela nenhuma.
import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight } from "@/lib/public-api-auth";
import { requireApiClientScope } from "@/lib/api-client-auth.server";
import { writeJson } from "@/lib/write-api-auth";

export const Route = createFileRoute("/api/public/escrita/health")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      GET: async ({ request }) => {
        const auth = await requireApiClientScope(request, "events:write");
        if (auth instanceof Response) return auth;
        return writeJson({ ok: true, versao: "escrita-v2-fundacao" });
      },
    },
  },
});
