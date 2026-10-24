// Sami — o cabeçalho da mensagem do turno com ferramentas: ação, agora,
// canal, cliente em contexto, citados, filas do CONFIRMAR/DESFAZER, anexos,
// localização, escolha do homônimo e avisos.
// Recortado de samiq-core.server.ts sem mudança de comportamento.

import {
  redactSamiQPii,
  primeiroNomeDoCorretor,
  type MapaPiiCorretor,
} from "@/lib/samiq-governance";
import type { SAMIQ_ACTION_META, SamiQCanal, SamiQInput } from "@/lib/samiq";
import { hojeSaoPaulo } from "@/lib/samiq-tools";
import {
  descreverProposta,
  motivoSemDesfazer,
  type MotivoSemDesfazer,
  type PropostaSamiQ,
} from "@/lib/samiq-propostas";
import { agoraParaModelo, calendarioParaModelo } from "@/lib/samiq-datas";
import { textoClientesCitados, type ContextoConversaSamiQ } from "@/lib/samiq-contexto";
import { leadStatusLabel } from "@/lib/leads";
import type {
  AnexoDoTurno,
  LocalizacaoDoTurno,
  RecentesDaConversa,
  ResponderSamiQArgs,
} from "./samiq-core-config";

const NAO_VOLTA_PARA_MODELO: Record<MotivoSemDesfazer, string> = {
  ja_desfeito: "já desfeito",
  nao_desfazivel: "não volta pelo DESFAZER",
  fora_do_prazo: "fora das 24 h",
};

/** Lista numerada do cabeçalho; com `agora`, marca o que não volta pelo DESFAZER. */
function linhaDeItens(itens: ReadonlyArray<PropostaSamiQ>, agora?: Date): string {
  return itens
    .map((p, i) => {
      const d = descreverProposta(p.payload, p.leadNome);
      const motivo = agora ? motivoSemDesfazer(p, agora) : null;
      return `${i + 1}) ${d.titulo}${d.detalhes.length ? ` (${d.detalhes.slice(0, 2).join(", ")})` : ""}${motivo ? ` [${NAO_VOLTA_PARA_MODELO[motivo]}]` : ""}`;
    })
    .join("; ");
}

function textoDoAnexo(a: AnexoDoTurno): string {
  const tipo = a.mime === "application/pdf" ? "PDF" : "imagem";
  const kb = Math.max(1, Math.round(a.tamanho / 1024));
  const tamanho = kb >= 1024 ? `${(kb / 1024).toFixed(1).replace(".", ",")} MB` : `${kb} KB`;
  const legenda = a.legenda ? redactSamiQPii(a.legenda, 200) : null;
  return `${a.agora ? "O corretor mandou um arquivo nesta mensagem" : "Arquivo recebido antes e ainda não anexado"}: ${tipo} de ${tamanho}${
    legenda ? `, legenda "${legenda}"` : ""
  } (anexoId ${a.id}). Você não vê o conteúdo. Para guardar na ficha use anexar_documento com esse anexoId e o tipo de documento; se não souber de qual cliente ou qual documento é, pergunte.`;
}

export function cabecalhoDoTurno({
  meta,
  reservation,
  agora,
  doCanal,
  args,
  data,
  safeContext,
  contexto,
  recentes,
  localizacao,
  escolhido,
  mapaPii,
  canal,
}: {
  meta: (typeof SAMIQ_ACTION_META)[keyof typeof SAMIQ_ACTION_META];
  reservation: { actionPrompt: string };
  agora: Date;
  doCanal: string[];
  args: ResponderSamiQArgs;
  data: SamiQInput;
  safeContext: Record<string, unknown>;
  contexto: ContextoConversaSamiQ;
  recentes: RecentesDaConversa;
  localizacao: LocalizacaoDoTurno | null;
  escolhido: string | null;
  mapaPii: MapaPiiCorretor;
  canal: SamiQCanal;
}): string[] {
  const citadosAntes = textoClientesCitados(contexto.clientes, leadStatusLabel);
  return [
    `Ação solicitada: ${meta.label}.`,
    reservation.actionPrompt,
    `Agora: ${agoraParaModelo(agora)} (São Paulo). Hoje é ${hojeSaoPaulo(agora)}. Próximos dias: ${calendarioParaModelo(agora)}. Datas nas ferramentas: AAAA-MM-DDTHH:MM no horário de São Paulo.`,
    ...doCanal,
    args.corretorNome
      ? primeiroNomeDoCorretor(args.corretorNome)
        ? `Corretor: ${primeiroNomeDoCorretor(args.corretorNome)}.`
        : "Corretor: perfil da empresa, sem nome de pessoa (não chame pelo nome)."
      : null,
    data.leadId
      ? `Cliente em contexto (id ${data.leadId}): ${JSON.stringify(safeContext.cliente ?? {}).slice(0, 2000)}`
      : null,
    citadosAntes
      ? `Clientes citados nesta conversa (o mais recente primeiro): ${citadosAntes}.`
      : null,
    !data.leadId && !citadosAntes
      ? 'Sem cliente em contexto: use buscar_clientes quando o corretor citar um nome. Se não achar e o corretor deu nome e telefone (ou pediu para criar), é cliente novo: criar_lead (grupo prospeccao). Pessoa citada há pouco nesta conversa é o "cliente" das mensagens seguintes.'
      : null,
    recentes.pendentes.length
      ? `Esperando o OK do corretor (numeração do CONFIRMAR): ${linhaDeItens(recentes.pendentes)}.`
      : null,
    recentes.executadas.length
      ? `Gravado recentemente (numeração do DESFAZER): ${linhaDeItens(recentes.executadas, agora)}.`
      : null,
    ...(args.anexos ?? []).slice(0, 5).map(textoDoAnexo),
    localizacao
      ? `${localizacao.agora ? "O corretor mandou a localização nesta mensagem" : "Localização recebida há poucos minutos"} (vale para o check-in na filial).`
      : canal === "whatsapp"
        ? "Sem localização recente: check-in na filial precisa dela (peça pelo clipe, Localização)."
        : null,
    escolhido
      ? `Na lista "qual cliente?" o corretor escolheu o cliente de id ${escolhido}: use esse id.`
      : null,
    // Chave de emergência ligada: o prompt fala de leves gravando na hora.
    canal === "whatsapp" && (args.modoEscrita ?? "confirmar_tudo") === "confirmar_tudo"
      ? "Hoje TODAS as ações esperam o CONFIRMAR do corretor: para registrar, cadastrar ou agendar, CHAME a ferramenta (ela deixa o item esperando o CONFIRMAR, nada grava na hora). Só diga que preparou o que uma ferramenta devolveu como pendente neste turno; sem ferramenta chamada, nada foi preparado."
      : null,
    Object.keys(mapaPii).length
      ? "Os marcadores [TELEFONE_n], [EMAIL_n] e [CPF_n] desta mensagem valem só nela: use-os direto nas ferramentas (buscar_clientes, criar_lead), sem pedir o dado de novo."
      : null,
    args.contextoCanal?.trim()
      ? `Contexto do WhatsApp (o que foi enviado fora do CRM; use para entender a mensagem, não responda a ele): ${redactSamiQPii(args.contextoCanal, 1500)}`
      : null,
  ].filter((l): l is string => !!l);
}
