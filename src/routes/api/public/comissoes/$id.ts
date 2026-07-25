// PATCH /api/public/comissoes/{comissao_id}
// Auth: X-API-Key com escopo `commissions:write` (concedido manualmente).
// Só altera status, data_pagamento e observacao — nunca valores nem beneficiário.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, corsPreflight } from "@/lib/public-api-auth";
import { requireApiClientScope } from "@/lib/api-client-auth.server";
import { validarPatch, aplicarPatchComissao } from "@/lib/comissoes-write.server";

export const Route = createFileRoute("/api/public/comissoes/$id")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      PATCH: async ({ request, params }) => {
        const auth = await requireApiClientScope(request, "commissions:write");
        if (auth instanceof Response) return auth;

        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return jsonResponse({ error: "corpo_invalido" }, 400);
        }

        const payload = validarPatch(corpo);
        if ("status" in payload && "body" in payload) {
          return jsonResponse(payload.body, payload.status);
        }

        const resultado = await aplicarPatchComissao(params.id, payload, auth);
        if (!resultado.ok) return jsonResponse(resultado.erro.body, resultado.erro.status);

        return jsonResponse({ comissao: resultado.comissao, anterior: resultado.anterior }, 200);
      },
    },
  },
});
