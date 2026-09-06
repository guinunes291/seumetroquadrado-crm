// POST /api/sami/mensagem — o WhatsApp da Sami entra no cérebro único (Onda S4).
//
// Chamador: o fluxo n8n (servidor-a-servidor) com header `x-sami-key`. Corpo:
// { corretor_telefone, texto, origem_midia?, lead_id?, nova_conversa? }.
// Resposta: sempre com `texto` pronto para enviar de volta ao corretor.
//
// Duas saídas:
// * resposta curta (CONFIRMAR/CANCELAR) a um pacote pendente → decide na hora,
//   sem modelo, com a sessão do corretor (mesma execução do card do painel);
// * qualquer outra coisa → responderSamiQ (prompt versionado, ferramentas,
//   propostas, governança e memória iguais ao painel), canal 'whatsapp'.
//
// Áudio (D8): o n8n transcreve e manda `texto` com origem_midia 'audio'.

import { createFileRoute } from "@tanstack/react-router";
import { MensagemSamiInput, interpretarRespostaCurta, textoParaWhatsApp } from "@/lib/samiq-canal";
import { descreverProposta } from "@/lib/samiq-propostas";

export const Route = createFileRoute("/api/sami/mensagem")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const canal = await import("@/lib/samiq-canal.server");
        try {
          canal.autenticarCanalSami(request);
          const body = await canal.lerCorpoCanalSami(request, MensagemSamiInput);
          const corretor = await canal.resolverCorretorPorTelefone(body.corretor_telefone);
          const memoria = await import("@/lib/samiq-memoria.server");
          const conversa = body.nova_conversa
            ? null
            : await memoria.conversaAtivaSamiQ({ userId: corretor.id, canal: "whatsapp" });

          // 1) "CONFIRMAR" / "CANCELAR" sobre o pacote pendente: sem gastar modelo.
          const intencao = interpretarRespostaCurta(body.texto);
          if (intencao && conversa) {
            const pendentes = await memoria.propostasPendentesSamiQ({
              userId: corretor.id,
              conversaId: conversa.id,
            });
            if (pendentes.length > 0) {
              const decisao = await canal.decidirPendentes({
                corretor,
                decisao: intencao,
                pendentes,
                conversaId: conversa.id,
                mensagem: body.texto,
              });
              return canal.jsonCanal({
                ok: true,
                tipo: "decisao",
                texto: decisao.texto,
                decisao: intencao,
                resultados: decisao.resultados,
                conversa_id: conversa.id,
                corretor: { id: corretor.id, nome: corretor.nome },
              });
            }
          }

          // 2) Pergunta ou relato → o mesmo cérebro do painel.
          const historico = conversa
            ? await memoria.historicoDaConversaSamiQ({
                userId: corretor.id,
                conversaId: conversa.id,
              })
            : [];
          const resposta = await canal.comSessaoDoCorretor(corretor, async (supabase) => {
            const { responderSamiQ } = await import("@/lib/samiq-core.server");
            return responderSamiQ({
              supabase,
              userId: corretor.id,
              canal: "whatsapp",
              origemMidia: body.origem_midia,
              data: {
                action: "pergunta_livre",
                pergunta: body.texto,
                historico,
                conversaId: conversa?.id,
                leadId: body.lead_id,
              },
            });
          });
          const propostas = (resposta.propostas ?? []).map((p) => ({
            id: p.id,
            tipo: p.tipo,
            ...descreverProposta(p.payload, p.leadNome),
          }));
          return canal.jsonCanal({
            ok: true,
            tipo: "resposta",
            texto: textoParaWhatsApp(resposta),
            resposta: {
              texto: resposta.texto,
              propostas,
              conversa_id: resposta.conversaId ?? null,
              execution_id: resposta.executionId ?? null,
              fallback: resposta.fallback === true,
              custo_mes_pct: resposta.custoMesPct ?? null,
              ferramentas: resposta.ferramentas ?? [],
            },
            corretor: { id: corretor.id, nome: corretor.nome },
          });
        } catch (error) {
          return canal.responderErroCanal(error);
        }
      },
    },
  },
});
