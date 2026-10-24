// Sami — o fechamento do turno: recibo e pendentes do WhatsApp, ações que
// esperam o OK gravadas como pendentes, memória da conversa e a memória de
// trabalho (v8), e a resposta.
// Recortado de samiq-core.server.ts sem mudança de comportamento.

import {
  sugestoesPara,
  type SAMIQ_ACTION_META,
  type SamiQCanal,
  type SamiQInput,
  type SamiQResposta,
} from "@/lib/samiq";
import type { PropostaSamiQ } from "@/lib/samiq-propostas";
import type { PropostaColetada } from "@/lib/samiq-propostas.server";
import {
  ambiguosParaMemoria,
  mesclarClientes,
  type AmbiguosDoTurno,
  type ClienteCitado,
} from "@/lib/samiq-contexto";
import { falaComPergunta, textoParaWhatsApp } from "@/lib/samiq-canal";
import {
  gravarContextoTurnoSamiQ,
  gravarTurnoSamiQ,
  registrarPropostasSamiQ,
} from "./samiq-memoria.server";
import type { AcaoExecutada } from "./samiq-acoes.server";
import type { ControleDoTurno } from "./samiq-controle.server";
import type { ResponderSamiQArgs } from "./samiq-core-config";

export async function fecharTurnoSamiQ({
  executadas,
  controle,
  args,
  coletor,
  userId,
  reservation,
  data,
  canal,
  texto,
  meta,
  telemetria,
  citados,
  agora,
  ambiguos,
  fallback,
}: {
  executadas: AcaoExecutada[];
  controle: ControleDoTurno;
  args: ResponderSamiQArgs;
  coletor: PropostaColetada[];
  userId: string;
  reservation: { executionId: string; custoMesPct: number | null };
  data: SamiQInput;
  canal: SamiQCanal;
  texto: string;
  meta: (typeof SAMIQ_ACTION_META)[keyof typeof SAMIQ_ACTION_META];
  telemetria: { chamadas: number; erros: number; nomes: string[] };
  citados: Array<Omit<ClienteCitado, "em">>;
  agora: Date;
  ambiguos: AmbiguosDoTurno;
  fallback: boolean;
}): Promise<SamiQResposta> {
  // ----- WhatsApp: o texto final (resposta + recibo + pendentes) é o que
  // vai para a memória, para o "o 2" do próximo turno bater com o que o
  // corretor viu. -----
  const gravadas: PropostaSamiQ[] = [...executadas, ...controle.confirmadas];
  const gravadasOk = gravadas.filter((p) => p.status === "aceita" || p.status === "editada");
  const decididas = new Set<string>([
    ...controle.confirmadas.map((p) => p.id),
    ...controle.descartadas.map((p) => p.id),
  ]);
  const pendentesAntes = (args.recentes?.pendentes ?? []).filter((p) => !decididas.has(p.id));

  // ----- Ações que esperam o OK: persistem como 'pendente' ANTES do texto,
  // para a lista "Preciso do seu OK" só ter o que existe de fato. Conversa
  // nova liga depois, pelo execution_id (samiq_contexto_turno). -----
  let propostas: PropostaSamiQ[] = [];
  if (coletor.length > 0) {
    propostas = await registrarPropostasSamiQ({
      userId,
      executionId: reservation.executionId,
      conversaId: data.conversaId ?? null,
      coletadas: coletor,
    });
  }
  const naoGuardadas = Math.min(coletor.length, 20) - propostas.length;
  const mostrarPendentes = propostas.length > 0 || decididas.size > 0;
  const textoCanal =
    canal === "whatsapp"
      ? [
          textoParaWhatsApp({
            texto,
            executadas: gravadas,
            pendentes: mostrarPendentes ? [...pendentesAntes, ...propostas] : [],
            desfeitas: controle.desfeitas,
            descartadas: controle.descartadas,
          }),
          naoGuardadas > 0
            ? `Não consegui guardar ${naoGuardadas === 1 ? "1 item que precisava" : `${naoGuardadas} itens que precisavam`} do seu OK. Me diga de novo que eu preparo.`
            : null,
        ]
          .filter((p): p is string => !!p)
          .join("\n\n")
      : undefined;

  // ----- Memória (D11): o turno vai para a conversa do canal, já redigido -----
  const rotulo = data.pergunta
    ? data.action === "pergunta_livre"
      ? data.pergunta
      : `${meta.label}: ${data.pergunta}`
    : meta.label;
  const conversaId = await gravarTurnoSamiQ({
    userId,
    conversaId: data.conversaId ?? null,
    leadId: data.leadId ?? null,
    pergunta: rotulo,
    resposta: textoCanal ?? texto,
    ferramentas: telemetria.nomes,
    executionId: reservation.executionId,
    canal,
  });

  // Painel: conversa que nasceu agora recebe as pendentes do turno.
  if (conversaId && canal !== "whatsapp" && propostas.length > 0 && !data.conversaId) {
    await gravarContextoTurnoSamiQ({
      userId,
      conversaId,
      executionId: reservation.executionId,
      contexto: null,
    });
  }

  // ----- v8: memória de trabalho da conversa (só quando há conversa) -----
  const pendentesConversa = [...pendentesAntes, ...propostas];
  if (conversaId && canal === "whatsapp") {
    const contexto = args.contexto ?? {};
    await gravarContextoTurnoSamiQ({
      userId,
      conversaId,
      executionId: reservation.executionId,
      contexto: {
        ...contexto,
        clientes: mesclarClientes(contexto.clientes, [...citados].reverse(), agora),
        pendentes: pendentesConversa.map((p) => p.id),
        // DESFAZER N vale para o último recibo que o corretor viu.
        executadas: gravadasOk.length ? gravadasOk.map((p) => p.id) : (contexto.executadas ?? []),
        // "sim"/"ok" só decidem quando ESTA mensagem pediu o OK e a fala
        // da Sami não terminou perguntando outra coisa ("quer o briefing?").
        pediu_decisao: mostrarPendentes && pendentesConversa.length > 0 && !falaComPergunta(texto),
        ambiguos: ambiguosParaMemoria(ambiguos),
        localizacao: contexto.localizacao ?? null,
        anexo_pendente:
          (args.anexos ?? []).find(
            (a) =>
              !gravadasOk.some(
                (p) => p.payload.tipo === "anexar_documento" && p.payload.anexoId === a.id,
              ),
          )?.id ?? null,
      },
    });
  }

  return {
    texto,
    sugestoes: sugestoesPara(data.action, texto, data.leadId),
    executionId: reservation.executionId,
    conversaId,
    ferramentas: telemetria.nomes,
    fallback,
    custoMesPct: reservation.custoMesPct,
    propostas,
    executadas: gravadas,
    pendentes: pendentesConversa,
    textoCanal,
  };
}
