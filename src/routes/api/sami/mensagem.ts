// POST /api/sami/mensagem: o WhatsApp da Sami entra no cérebro único (Onda S4;
// v8, o CRM inteiro no WhatsApp).
//
// Chamador: o fluxo n8n (servidor a servidor) com header `x-sami-key`. Corpo:
// { corretor_telefone, texto, origem_midia?, lead_id?, nova_conversa?,
//   anexo_id?, localizacao?, mensagem_id?, contexto_canal? }.
// Resposta: sempre com `texto` pronto para enviar de volta ao corretor
// (vazio + ignorar=true quando é retentativa de uma mensagem ainda em curso).
//
// Três saídas:
// * comando curto (CONFIRMAR, CONFIRMAR 2, CANCELAR, DESFAZER, DESFAZER 1)
//   sobre a conversa ativa → decide na hora, sem modelo, com a sessão do
//   corretor (mesma execução do card do painel). "sim"/"ok" só decidem quando
//   a última mensagem da Sami pediu o OK; fora disso vão para a Sami;
// * retentativa do n8n (mesmo mensagem_id) → devolve a última resposta;
// * qualquer outra coisa → responderSamiQ (prompt versionado, ferramentas,
//   ações por risco, governança e memória iguais ao painel), canal 'whatsapp'.
//
// Áudio (D8): o n8n transcreve e manda `texto` com origem_midia 'audio'.

import { createFileRoute } from "@tanstack/react-router";
import {
  MensagemSamiInput,
  interpretarComandoCurto,
  numerosSoltos,
  textoNumeroSemComando,
  textoParaWhatsApp,
} from "@/lib/samiq-canal";
import {
  escolherPorNumero,
  localizacaoValida,
  type ContextoConversaSamiQ,
} from "@/lib/samiq-contexto";
import { descreverProposta, motivoSemDesfazer } from "@/lib/samiq-propostas";

/** Itens na ordem dos ids (a numeração que o corretor viu), sem os que sumiram. */
function naOrdem<T extends { id: string }>(
  ids: ReadonlyArray<string>,
  itens: ReadonlyArray<T>,
): T[] {
  return ids.map((id) => itens.find((p) => p.id === id)).filter((p): p is T => !!p);
}

export const Route = createFileRoute("/api/sami/mensagem")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const canal = await import("@/lib/samiq-canal.server");
        let falhou: (() => Promise<void>) | null = null;
        try {
          canal.autenticarCanalSami(request);
          const body = await canal.lerCorpoCanalSami(request, MensagemSamiInput);
          const corretor = await canal.resolverCorretorPorTelefone(body.corretor_telefone);
          const quem = { id: corretor.id, nome: corretor.nome };
          // Fila no banco: retentativa recebe a resposta guardada (nada grava
          // duas vezes, o recibo não se perde) e mensagens seguidas do mesmo
          // corretor rodam uma de cada vez, na ordem em que chegaram.
          const fila = await canal.entrarNaFilaDoCanal({
            corretorId: corretor.id,
            mensagemId: body.mensagem_id,
          });
          if (fila.tipo === "repetida") {
            return canal.jsonCanal({ ...fila.resposta, repetida: true });
          }
          if (fila.tipo === "em_andamento") {
            return canal.jsonCanal(
              { ok: true, tipo: "em_andamento", ignorar: true, texto: "" },
              202,
            );
          }
          falhou = fila.falhou;
          /** Responde e guarda a resposta para uma eventual retentativa. */
          const responder = async (corpo: Record<string, unknown>) => {
            await fila.concluir(corpo);
            return canal.jsonCanal(corpo);
          };
          const memoria = await import("@/lib/samiq-memoria.server");
          const agora = new Date();
          const conversa = body.nova_conversa
            ? null
            : await memoria.conversaAtivaSamiQ({ userId: corretor.id, canal: "whatsapp" });
          const lido: ContextoConversaSamiQ = conversa
            ? await memoria.lerContextoDaConversaSamiQ({
                userId: corretor.id,
                conversaId: conversa.id,
              })
            : {};

          const contexto: ContextoConversaSamiQ = {
            ...lido,
            ultima_mensagem_id: body.mensagem_id ?? lido.ultima_mensagem_id ?? null,
            ...(body.localizacao
              ? {
                  localizacao: {
                    latitude: body.localizacao.latitude,
                    longitude: body.localizacao.longitude,
                    precisao: body.localizacao.precisao ?? null,
                    em: agora.toISOString(),
                  },
                }
              : {}),
          };

          // 1) Comandos curtos: decidem sem gastar modelo.
          const comando = interpretarComandoCurto(body.texto);
          if (comando && conversa) {
            if (comando.acao === "desfazer") {
              const ids = contexto.executadas ?? [];
              const escolhidos = escolherPorNumero(ids, comando.itens);
              if (escolhidos === null) {
                return responder({
                  ok: true,
                  tipo: "desfazer",
                  texto: `O último recibo tem ${ids.length} ${ids.length === 1 ? "item" : "itens"}. Mande DESFAZER com um número dessa lista (ex.: DESFAZER 1).`,
                  conversa_id: conversa.id,
                  corretor: quem,
                });
              }
              const apontadas = naOrdem(
                escolhidos,
                await memoria.acoesPorIdsSamiQ({ userId: corretor.id, ids: escolhidos }),
              );
              const acoes = apontadas.filter((a) => motivoSemDesfazer(a, agora) === null);
              // DESFAZER sem número pega o recibo todo: o que não volta fica calado.
              // Com número, o corretor apontou o item: explica por que não volta.
              const ignoradas = comando.itens.length
                ? apontadas.flatMap((a) => {
                    const motivo = motivoSemDesfazer(a, agora);
                    return motivo ? [{ acao: a, motivo }] : [];
                  })
                : [];
              const r = await canal.desfazerPeloCanal({
                corretor,
                acoes,
                ignoradas,
                conversaId: conversa.id,
                mensagem: body.texto,
                contexto,
                mensagemId: body.mensagem_id,
              });
              return responder({
                ok: true,
                tipo: "desfazer",
                texto: r.texto,
                resultados: r.resultados,
                conversa_id: conversa.id,
                corretor: quem,
              });
            }

            // Numeração do CONFIRMAR 2 = a lista que o corretor viu por último.
            const mostrados = contexto.pendentes?.length
              ? contexto.pendentes
              : (
                  await memoria.propostasPendentesSamiQ({
                    userId: corretor.id,
                    conversaId: conversa.id,
                  })
                ).map((p) => p.id);
            const aindaPendentes = mostrados.length
              ? naOrdem(
                  mostrados,
                  await memoria.propostasPendentesSamiQ({ userId: corretor.id, ids: mostrados }),
                )
              : [];
            if (aindaPendentes.length > 0 && (comando.forte || contexto.pediu_decisao)) {
              const escolhidosIds = escolherPorNumero(mostrados, comando.itens);
              if (escolhidosIds === null) {
                return responder({
                  ok: true,
                  tipo: "decisao",
                  texto: `A lista tem ${mostrados.length} ${mostrados.length === 1 ? "item" : "itens"}. Mande CONFIRMAR ou CANCELAR com um número dela (ex.: CONFIRMAR 1).`,
                  conversa_id: conversa.id,
                  corretor: quem,
                });
              }
              const escolhidas = naOrdem(escolhidosIds, aindaPendentes);
              const restantes = aindaPendentes.filter(
                (p) => !escolhidas.some((e) => e.id === p.id),
              );
              const decisao = await canal.decidirPendentes({
                corretor,
                decisao: comando.acao,
                pendentes: escolhidas,
                restantes,
                conversaId: conversa.id,
                mensagem: body.texto,
                contexto,
                mensagemId: body.mensagem_id,
              });
              return responder({
                ok: true,
                tipo: "decisao",
                texto:
                  escolhidas.length === 0
                    ? "Esse item já foi decidido. Me conte o que mais aconteceu que eu registro."
                    : decisao.texto,
                decisao: comando.acao,
                resultados: decisao.resultados,
                conversa_id: conversa.id,
                corretor: quem,
              });
            }
            if (comando.forte && comando.acao === "confirmar" && aindaPendentes.length === 0) {
              return responder({
                ok: true,
                tipo: "decisao",
                texto:
                  "Não há nada esperando confirmação. Me conte o que aconteceu com o cliente que eu registro.",
                decisao: comando.acao,
                resultados: [],
                conversa_id: conversa.id,
                corretor: quem,
              });
            }
          }

          // 1b) "2" logo depois de "Preciso do seu OK": confirma ou descarta? Pergunta sem modelo.
          const soNumeros = comando ? null : numerosSoltos(body.texto);
          if (
            soNumeros &&
            conversa &&
            contexto.pediu_decisao &&
            (contexto.pendentes?.length ?? 0) > 0 &&
            // "2" depois de "qual Maria? 1) ... 2) ..." é a escolha do cliente.
            !contexto.ambiguos?.length
          ) {
            return responder({
              ok: true,
              tipo: "decisao",
              texto: textoNumeroSemComando(soNumeros),
              conversa_id: conversa.id,
              corretor: quem,
            });
          }

          // 2) Pergunta, relato, arquivo ou localização → o mesmo cérebro do painel.
          const historico = conversa
            ? await memoria.historicoDaConversaSamiQ({
                userId: corretor.id,
                conversaId: conversa.id,
              })
            : [];
          const pendentes = contexto.pendentes?.length
            ? naOrdem(
                contexto.pendentes,
                await memoria.propostasPendentesSamiQ({
                  userId: corretor.id,
                  ids: contexto.pendentes,
                }),
              )
            : [];
          // Último recibo NA NUMERAÇÃO QUE O CORRETOR VIU ("desfaz o 3" = item 3
          // do recibo). Se nada mais volta, nem entra no cabeçalho.
          const doRecibo = contexto.executadas?.length
            ? naOrdem(
                contexto.executadas,
                await memoria.acoesPorIdsSamiQ({ userId: corretor.id, ids: contexto.executadas }),
              )
            : [];
          const executadas = doRecibo.some((a) => motivoSemDesfazer(a, agora) === null)
            ? doRecibo
            : [];
          const anexosServer = await import("@/lib/samiq-anexos.server");
          const anexos = (
            await anexosServer.anexosPendentes({ corretorId: corretor.id, maxIdadeMs: 30 * 60_000 })
          ).map((a) => ({ ...a, agora: a.id === body.anexo_id }));
          if (body.anexo_id && !anexos.some((a) => a.id === body.anexo_id)) {
            const a = await anexosServer.anexoPorId({ corretorId: corretor.id, id: body.anexo_id });
            if (a) anexos.unshift({ ...a, agora: true });
          }
          anexos.sort((a, b) => Number(b.agora) - Number(a.agora));
          const loc = body.localizacao
            ? { ...body.localizacao, agora: true }
            : (() => {
                const v = localizacaoValida(contexto, agora);
                return v
                  ? {
                      latitude: v.latitude,
                      longitude: v.longitude,
                      precisao: v.precisao,
                      agora: false,
                    }
                  : null;
              })();

          const resposta = await canal.comSessaoDoCorretor(corretor, async (supabase) => {
            const { responderSamiQ } = await import("@/lib/samiq-core.server");
            return responderSamiQ({
              supabase,
              userId: corretor.id,
              canal: "whatsapp",
              origemMidia: body.origem_midia,
              modoEscrita: "por_risco",
              corretorNome: corretor.nome,
              contexto,
              recentes: { pendentes, executadas },
              anexos,
              localizacao: loc,
              contextoCanal: body.contexto_canal ?? null,
              tempoMaximoMs: fila.prazoMs,
              agora,
              data: {
                action: "pergunta_livre",
                pergunta: body.texto,
                historico,
                conversaId: conversa?.id,
                leadId: body.lead_id,
              },
            });
          });
          const resumo = (itens: typeof resposta.propostas) =>
            (itens ?? []).map((p) => ({
              id: p.id,
              tipo: p.tipo,
              status: p.status,
              efeito: p.efeito ?? null,
              ...descreverProposta(p.payload, p.leadNome),
            }));
          return responder({
            ok: true,
            tipo: "resposta",
            texto: resposta.textoCanal ?? textoParaWhatsApp(resposta),
            resposta: {
              texto: resposta.texto,
              propostas: resumo(resposta.propostas),
              executadas: resumo(resposta.executadas),
              conversa_id: resposta.conversaId ?? null,
              execution_id: resposta.executionId ?? null,
              fallback: resposta.fallback === true,
              custo_mes_pct: resposta.custoMesPct ?? null,
              ferramentas: resposta.ferramentas ?? [],
            },
            corretor: quem,
          });
        } catch (error) {
          await falhou?.();
          return canal.responderErroCanal(error);
        }
      },
    },
  },
});
