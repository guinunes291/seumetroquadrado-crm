// PATCH /api/public/vendas/{venda_id}
// Auth: X-API-Key com escopo `sales:write` (concedido manualmente).
// Só corrige o empreendimento (projeto_id / nome) e a observação da venda.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, corsPreflight } from "@/lib/public-api-auth";
import { requireApiClientScope } from "@/lib/api-client-auth.server";
import { validarPatchVenda, aplicarPatchVenda } from "@/lib/vendas-write.server";

export const Route = createFileRoute("/api/public/vendas/$id")({
  server: {
    handlers: {
      OPTIONS: async () => corsPreflight(),
      PATCH: async ({ request, params }) => {
        const auth = await requireApiClientScope(request, "sales:write");
        if (auth instanceof Response) return auth;

        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return jsonResponse({ error: "corpo_invalido" }, 400);
        }

        const payload = validarPatchVenda(corpo);
        if ("body" in payload) return jsonResponse(payload.body, payload.status);

        const resultado = await aplicarPatchVenda(params.id, payload, auth);
        if (!resultado.ok) return jsonResponse(resultado.erro.body, resultado.erro.status);

        return jsonResponse(
          {
            venda: resultado.venda,
            anterior: resultado.anterior,
            vinculado_ao_catalogo: resultado.vinculado_ao_catalogo,
            comissoes_afetadas: resultado.comissoes_afetadas,
          },
          200,
        );
      },
    },
  },
});
