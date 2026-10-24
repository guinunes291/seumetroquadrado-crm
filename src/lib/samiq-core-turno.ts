// Sami — o que o turno prepara antes de chamar o modelo: as entradas
// redigidas do turno com ferramentas (pergunta, histórico, homônimo escolhido,
// localização) e o prompt único das ações rápidas sem ferramentas.
// Recortado de samiq-core.server.ts sem mudança de comportamento.

import {
  displayNameForSamiQ,
  mapaPiiValido,
  redactSamiQPii,
  redigirTextoDoCorretor,
} from "@/lib/samiq-governance";
import type { SAMIQ_ACTION_META, SamiQCanal, SamiQInput } from "@/lib/samiq";
import type { CitarClienteSamiQ } from "@/lib/samiq-tools.server";
import type { ClienteCitado } from "@/lib/samiq-contexto";
import { escolherCandidato } from "@/lib/samiq-canal";
import {
  LIMITE_HISTORICO,
  LIMITE_PERGUNTA,
  MAX_CONTEXT_CHARS,
  type ResponderSamiQArgs,
} from "./samiq-core-config";

export function prepararTurnoComFerramentas({
  data,
  canal,
  args,
  citados,
}: {
  data: SamiQInput;
  canal: SamiQCanal;
  args: ResponderSamiQArgs;
  citados: Array<Omit<ClienteCitado, "em">>;
}) {
  // Texto do corretor: nomes passam (D12); telefone, e-mail e CPF viram
  // marcadores numerados que só o servidor desfaz (cadastro e busca).
  // v8.2: os marcadores das mensagens anteriores (30 min) continuam valendo e
  // a numeração segue de onde parou, para "sim, é outro cliente" cadastrar com
  // o [TELEFONE_1] da mensagem anterior.
  const mapaAnterior = mapaPiiValido(args.contexto?.pii, args.agora ?? new Date());
  const { texto: perguntaSegura, mapa: mapaPii } = data.pergunta
    ? redigirTextoDoCorretor(data.pergunta, LIMITE_PERGUNTA[canal], mapaAnterior)
    : { texto: "", mapa: mapaAnterior };
  // Histórico: o do WhatsApp vem do banco já redigido; o do painel vem do
  // browser. Nomes ficam (sem eles "ela", "a mesma" perdem o dono).
  const historicoSeguro = (data.historico ?? []).map((message) => ({
    role: message.role,
    content: redactSamiQPii(message.content, LIMITE_HISTORICO[canal]),
  }));
  const contexto = args.contexto ?? {};
  const recentes = args.recentes ?? { pendentes: [], executadas: [] };

  const citar: CitarClienteSamiQ = (c) => {
    const i = citados.findIndex((x) => x.id === c.id);
    if (i >= 0) citados.splice(i, 1);
    citados.push({ id: c.id, nome: displayNameForSamiQ(c.nome), etapa: c.etapa ?? null });
  };
  // "a 2" depois de "qual Maria? 1) ... 2) ...": libera SÓ o escolhido.
  const escolhido = contexto.ambiguos?.length
    ? escolherCandidato(data.pergunta ?? "", contexto.ambiguos)
    : null;
  const liberados = escolhido ? new Set([escolhido]) : undefined;
  // Trava de homônimos lê o texto CRU do corretor (este turno e os dele antes).
  const textoDoCorretor = [
    ...(data.historico ?? []).filter((m) => m.role === "user").map((m) => m.content),
    data.pergunta ?? "",
  ].join("\n");
  const localizacao = args.localizacao ?? null;
  const contextoExecucao = {
    localizacao: localizacao
      ? {
          latitude: localizacao.latitude,
          longitude: localizacao.longitude,
          precisao: localizacao.precisao ?? null,
        }
      : null,
  };

  return {
    perguntaSegura,
    mapaPii,
    historicoSeguro,
    contexto,
    recentes,
    citar,
    escolhido,
    liberados,
    textoDoCorretor,
    localizacao,
    contextoExecucao,
  };
}

export function promptSemFerramentas({
  meta,
  reservation,
  doCanal,
  perguntaSegura,
  ctx,
  contextJson,
  historicoSeguro,
}: {
  meta: (typeof SAMIQ_ACTION_META)[keyof typeof SAMIQ_ACTION_META];
  reservation: { actionPrompt: string; promptVersion: string };
  doCanal: string[];
  perguntaSegura: string;
  ctx: Record<string, unknown>;
  contextJson: string;
  historicoSeguro: Array<{ role: "user" | "assistant"; content: string }>;
}): string {
  const parts: string[] = [`Ação solicitada: ${meta.label}.`, reservation.actionPrompt, ...doCanal];
  if (perguntaSegura) parts.push(`Detalhe do corretor: ${perguntaSegura}`);
  if (Object.keys(ctx).length > 0) {
    parts.push(
      `Contexto minimizado (${reservation.promptVersion}):\n${contextJson.slice(0, MAX_CONTEXT_CHARS)}`,
    );
  }
  if (historicoSeguro.length) {
    parts.push(
      `Conversa recente:\n${historicoSeguro
        .map((message) => `${message.role === "user" ? "Corretor" : "SamiQ"}: ${message.content}`)
        .join("\n")}`,
    );
  }
  return parts.join("\n\n");
}
