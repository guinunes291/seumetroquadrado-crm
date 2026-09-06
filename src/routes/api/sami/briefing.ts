// POST /api/sami/briefing — o "seu dia" do corretor para o WhatsApp (Onda S4).
//
// { corretor_telefone } → { texto, briefing }. Mesma coleta do painel
// (samiq-briefing.server.ts), com a sessão do corretor; sem modelo, sem cota.
// O n8n dispara de manhã para quem tem o WhatsApp da Sami.

import { createFileRoute } from "@tanstack/react-router";
import { BriefingSamiInput, primeiroNome, textoDoBriefingWhatsApp } from "@/lib/samiq-canal";

export const Route = createFileRoute("/api/sami/briefing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const canal = await import("@/lib/samiq-canal.server");
        try {
          canal.autenticarCanalSami(request);
          const body = await canal.lerCorpoCanalSami(request, BriefingSamiInput);
          const corretor = await canal.resolverCorretorPorTelefone(body.corretor_telefone);
          const briefing = await canal.comSessaoDoCorretor(corretor, async (supabase) => {
            const { montarBriefingDoCorretor } = await import("@/lib/samiq-briefing.server");
            return montarBriefingDoCorretor({ supabase, userId: corretor.id });
          });
          return canal.jsonCanal({
            ok: true,
            texto: textoDoBriefingWhatsApp(primeiroNome(corretor.nome), briefing),
            briefing,
            corretor: { id: corretor.id, nome: corretor.nome },
          });
        } catch (error) {
          return canal.responderErroCanal(error);
        }
      },
    },
  },
});
