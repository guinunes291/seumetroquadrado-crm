// POST /api/sami/devolucao — o Marquinhos encerra uma devolução (06/11/2026).
//
// Chamador: o fluxo do Marquinhos no n8n, quando cumpre (ou não consegue
// cumprir) o objetivo que o corretor deu ao devolver o cliente. Header
// `x-sami-key` (mesmo segredo dos canais da Sami). Corpo:
//   { devolucao_id, desfecho: objetivo_cumprido | sem_resposta | precisa_corretor,
//     resultado: "Visita remarcada para sáb 14/11 10h" }
// Efeito: devolução concluída, nota na timeline do lead e push ao corretor
// dono. Idempotente: replay ou devolução já encerrada responde ignorado.
// Depois de responder, o n8n pausa o robô de novo para esse telefone.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DESFECHOS_DEVOLUCAO } from "@/features/mensagens/devolucao-marquinhos";

const EncerrarDevolucao = z.object({
  devolucao_id: z.string().uuid(),
  desfecho: z.enum(DESFECHOS_DEVOLUCAO),
  resultado: z.string().trim().max(1000).optional().nullable(),
});

export const Route = createFileRoute("/api/sami/devolucao")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const canal = await import("@/lib/samiq-canal.server");
        try {
          canal.autenticarCanalSami(request);
          const body = await canal.lerCorpoCanalSami(request, EncerrarDevolucao);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("marquinhos_devolucao_encerrar", {
            _id: body.devolucao_id,
            _desfecho: body.desfecho,
            _resultado: body.resultado ?? "",
          });
          if (error) {
            if (error.code === "22023") {
              return canal.jsonCanal(
                { ok: false, erro: "devolucao_invalida", texto: error.message },
                404,
              );
            }
            throw new Error(error.message);
          }
          const status = String(data ?? "");
          return canal.jsonCanal({
            ok: true,
            status,
            texto:
              status === "concluida"
                ? "Devolução encerrada e corretor avisado."
                : "Devolução já estava encerrada.",
          });
        } catch (error) {
          return canal.responderErroCanal(error);
        }
      },
    },
  },
});
