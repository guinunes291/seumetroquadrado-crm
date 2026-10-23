// POST /api/sami/diretrizes — melhoria contínua da Sami (23/10/2026).
//
// Chamador: o Gate da Sami no n8n, quando o gestor aprova uma regra pelo link
// no WhatsApp. Header `x-sami-key` (mesmo segredo do canal). Corpo:
// { texto, tipo?, origem?, id_origem, ativa? } — idempotente por id_origem;
// ativa=false desliga a diretriz. Vale para painel e WhatsApp no próximo turno.

import { createFileRoute } from "@tanstack/react-router";
import { DiretrizSamiInput } from "@/lib/samiq-diretrizes";

export const Route = createFileRoute("/api/sami/diretrizes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const canal = await import("@/lib/samiq-canal.server");
        try {
          canal.autenticarCanalSami(request);
          const body = await canal.lerCorpoCanalSami(request, DiretrizSamiInput);
          const { publicarDiretrizSamiQ } = await import("@/lib/samiq-diretrizes.server");
          const { id } = await publicarDiretrizSamiQ(body);
          return canal.jsonCanal({ ok: true, id, texto: "Diretriz publicada." });
        } catch (error) {
          return canal.responderErroCanal(error);
        }
      },
    },
  },
});