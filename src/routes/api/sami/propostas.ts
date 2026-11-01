// POST /api/sami/propostas — decide um pacote pendente pelo WhatsApp (Onda S4).
//
// Para fluxos com botões interativos (o n8n manda os ids) ou como atalho
// explícito: { corretor_telefone, decisao: 'confirmar' | 'rejeitar', ids? }.
// Sem ids, decide o que está pendente na conversa ativa do canal. A execução
// é a mesma do botão do card (samiq-confirmar.server.ts), com a sessão do
// corretor — o modelo nunca participa.

import { createFileRoute } from "@tanstack/react-router";
import { DecidirPropostasInput } from "@/lib/samiq-canal";
import { propostaDaConversa } from "@/lib/samiq-marquinhos";

export const Route = createFileRoute("/api/sami/propostas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const canal = await import("@/lib/samiq-canal.server");
        try {
          canal.autenticarCanalSami(request);
          const body = await canal.lerCorpoCanalSami(request, DecidirPropostasInput);
          const corretor = await canal.resolverCorretorPorTelefone(body.corretor_telefone);
          const canalMemoria = body.canal ?? "whatsapp";
          if (canalMemoria === "marquinhos") await canal.autorizarCanalMarquinhos(corretor);
          const memoria = await import("@/lib/samiq-memoria.server");
          const conversa = await memoria.conversaAtivaSamiQ({ userId: corretor.id, canal: canalMemoria });
          const daConversa = conversa ? await memoria.propostasPendentesSamiQ({
            userId: corretor.id,
            conversaId: conversa.id,
          }) : [];
          const pendentes = body.ids ? propostaDaConversa(daConversa, new Set(body.ids)) : daConversa;
          const decisao = await canal.decidirPendentes({
            canalMemoria,
            corretor,
            decisao: body.decisao,
            pendentes,
            conversaId: conversa?.id ?? null,
            mensagem: body.decisao === "confirmar" ? "CONFIRMAR" : "CANCELAR",
          });
          return canal.jsonCanal({
            ok: true,
            tipo: "decisao",
            texto: decisao.texto,
            decisao: body.decisao,
            resultados: decisao.resultados,
            pendentes: pendentes.length,
            corretor: { id: corretor.id, nome: corretor.nome },
          });
        } catch (error) {
          return canal.responderErroCanal(error);
        }
      },
    },
  },
});
