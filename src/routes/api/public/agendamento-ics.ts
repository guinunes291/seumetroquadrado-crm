import { createFileRoute } from "@tanstack/react-router";
import {
  COMPROVANTE_RE,
  LEMBRETES_CLIENTE_MINUTOS,
  descricaoEventoCliente,
  tituloEventoCliente,
} from "@/lib/agendamento-link";
import { buildIcsContent } from "@/lib/calendar-links";

// .ics da visita servido por URL de verdade (GET), e não por Blob: é o que o
// iPhone abre direto no Calendário ("Adicionar") e o que funciona no navegador
// embutido do WhatsApp/Instagram, onde download de Blob é bloqueado.
//
// O token do comprovante vai na query, então chega aos access logs. O que ele
// abre é só o evento (data, endereço, nome e WhatsApp do corretor) — nada do
// cliente — e vale até um dia depois da visita.

function texto(status: number, body: string) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export const Route = createFileRoute("/api/public/agendamento-ics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("c") ?? "";
        if (!COMPROVANTE_RE.test(token)) return texto(404, "Agendamento não encontrado.");
        try {
          const server = await import("@/lib/agendamento-link.server");
          const ag = await server.obterComprovante(token);
          const ics = buildIcsContent(
            {
              titulo: tituloEventoCliente(ag.corretor_nome),
              inicio: ag.inicio,
              fim: ag.fim,
              local: ag.endereco,
              descricao: descricaoEventoCliente(ag),
              lembretesMinutos: LEMBRETES_CLIENTE_MINUTOS,
            },
            // UID estável: reimportar atualiza o mesmo evento em vez de duplicar.
            `${ag.agendamento_id}@seumetroquadrado`,
          );
          return new Response(ics, {
            status: 200,
            headers: {
              "content-type": "text/calendar; charset=utf-8",
              "content-disposition": 'attachment; filename="visita-seu-metro-quadrado.ics"',
              "cache-control": "no-store",
              "referrer-policy": "no-referrer",
              "x-content-type-options": "nosniff",
            },
          });
        } catch (error) {
          const { AgendamentoLinkError } = await import("@/lib/agendamento-link.server");
          if (error instanceof AgendamentoLinkError && error.status === 404) {
            return texto(404, "Agendamento não encontrado ou já encerrado.");
          }
          console.error("[agendamento-ics] falha inesperada");
          return texto(503, "Não foi possível gerar o arquivo agora. Tente de novo em instantes.");
        }
      },
    },
  },
});
