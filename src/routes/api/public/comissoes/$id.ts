// PATCH /api/public/comissoes/{comissao_id}
// Auth: X-API-Key com escopo `commissions:write` (status/data/observacao) e/ou
// `commissions:write:beneficiary` (troca de beneficiário) — concedidos manualmente.
// Nunca altera valores financeiros nem aceita `beneficiario_nome` do cliente.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, corsPreflight } from "@/lib/public-api-auth";
import { requireApiClientScope } from "@/lib/api-client-auth.server";
import {
  validarPatch,
  aplicarPatchComissao,
  escoposNecessarios,
} from "@/lib/comissoes-write.server";

export const Route = createFileRoute("/api/public/comissoes/$id")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      PATCH: async ({ request, params }) => {
        // 401 antes de qualquer validação de corpo, para não vazar semântica.
        if (!request.headers.get("x-api-key")) {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }

        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return jsonResponse({ error: "corpo_invalido" }, 400);
        }

        const payload = validarPatch(corpo);
        if ("body" in payload) {
          return jsonResponse(payload.body, payload.status);
        }

        const auth = await requireApiClientScope(request, escoposNecessarios(payload));
        if (auth instanceof Response) return auth;

        const resultado = await aplicarPatchComissao(params.id, payload, auth);
        if (!resultado.ok) return jsonResponse(resultado.erro.body, resultado.erro.status);

        return jsonResponse({ comissao: resultado.comissao, anterior: resultado.anterior }, 200);
      },
    },
  },
});
