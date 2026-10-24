// POST /api/sami/anexo: arquivo que o corretor mandou no WhatsApp da Sami (v8).
//
// Chamador: o fluxo n8n (servidor a servidor) com header `x-sami-key`, em
// multipart/form-data: corretor_telefone, arquivo, legenda?, mensagem_id?, nome?.
// O arquivo vai para a ÁREA DE ESPERA do corretor (bucket privado, sem ficha
// de ninguém). Quem leva para a ficha do cliente é a ação anexar_documento,
// numa mensagem seguinte, com a sessão do corretor.
//
// Resposta: { anexo_id, silencioso, texto }.
//  * com legenda: o n8n chama /api/sami/mensagem com texto = legenda e o
//    anexo_id (a Sami já sabe de quem é e anexa na hora);
//  * sem legenda: `texto` pergunta de quem é, só no primeiro arquivo de uma
//    rajada (RG frente, RG verso e holerite em sequência = uma pergunta só).
// O conteúdo do arquivo nunca vai ao modelo.

import { createFileRoute } from "@tanstack/react-router";
import { textoDoAnexoRecebido } from "@/lib/samiq-canal";

export const Route = createFileRoute("/api/sami/anexo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const canal = await import("@/lib/samiq-canal.server");
        try {
          canal.autenticarCanalSami(request);
          const { campos, arquivo, mime } = await canal.lerArquivoCanalSami(request);
          const corretor = await canal.resolverCorretorPorTelefone(campos.corretor_telefone);
          const anexos = await import("@/lib/samiq-anexos.server");
          const guardado = await anexos.guardarAnexoDoWhatsApp({
            corretorId: corretor.id,
            arquivo,
            mime,
            nomeOriginal: campos.nome ?? null,
            legenda: campos.legenda ?? null,
            mensagemId: campos.mensagem_id ?? null,
          });
          await anexos.limparAnexosVencidos(corretor.id);
          // Outro arquivo sem uso nos últimos 2 minutos = rajada: não pergunta de novo.
          const recentes = await anexos.anexosPendentes({
            corretorId: corretor.id,
            maxIdadeMs: 2 * 60_000,
          });
          const rajada = recentes.some((a) => a.id !== guardado.id);
          const silencioso = guardado.reaproveitado || rajada || !!campos.legenda;
          return canal.jsonCanal({
            ok: true,
            tipo: "anexo",
            anexo_id: guardado.id,
            reaproveitado: guardado.reaproveitado,
            silencioso,
            texto: silencioso ? "" : textoDoAnexoRecebido({ mime, tamanho: arquivo.size }),
            corretor: { id: corretor.id, nome: corretor.nome },
          });
        } catch (error) {
          return canal.responderErroCanal(error);
        }
      },
    },
  },
});
