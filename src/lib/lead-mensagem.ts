// Lógica pura (testável) por trás da sugestão de mensagem de WhatsApp por IA.
// O server fn (lead-mensagem-ia.functions.ts) só faz I/O + chamada ao modelo;
// aqui ficam os objetivos comerciais e a montagem da instrução enviada à IA.

export type ObjetivoMensagem =
  | "primeiro_contato"
  | "confirmar_visita"
  | "pos_visita"
  | "quebrar_objecao"
  | "enviar_empreendimento"
  | "reativar"
  | "cobrar_documentos";

export const OBJETIVOS_MENSAGEM: { value: ObjetivoMensagem; label: string; instrucao: string }[] = [
  {
    value: "primeiro_contato",
    label: "Primeiro contato",
    instrucao:
      "Faça o primeiro contato: apresente-se de forma breve e entenda o momento de compra do cliente.",
  },
  {
    value: "confirmar_visita",
    label: "Confirmar visita",
    instrucao:
      "Confirme a visita já agendada, reforce o entusiasmo e peça uma confirmação simples (sim/não).",
  },
  {
    value: "pos_visita",
    label: "Pós-visita",
    instrucao:
      "Agradeça a visita, pergunte a impressão do cliente e proponha o próximo passo (proposta ou análise de crédito).",
  },
  {
    value: "quebrar_objecao",
    label: "Quebrar objeção",
    instrucao:
      "Responda com empatia à objeção informada e reconduza a conversa para o próximo passo, sem pressionar.",
  },
  {
    value: "enviar_empreendimento",
    label: "Apresentar empreendimento",
    instrucao:
      "Apresente o empreendimento de interesse destacando o encaixe com o perfil e convide para uma visita.",
  },
  {
    value: "reativar",
    label: "Reativar lead frio",
    instrucao:
      "Reative um cliente que parou de responder, de forma leve e sem soar insistente, dando um motivo para retomar.",
  },
  {
    value: "cobrar_documentos",
    label: "Cobrar documentos",
    instrucao:
      "Cobre, de forma cordial, os documentos pendentes para dar andamento à análise de crédito.",
  },
];

const OBJETIVO_FALLBACK = OBJETIVOS_MENSAGEM[0];

/** Resolve o objetivo (com fallback seguro) a partir da chave. */
export function resolverObjetivo(objetivo?: string | null) {
  return OBJETIVOS_MENSAGEM.find((o) => o.value === objetivo) ?? OBJETIVO_FALLBACK;
}

/**
 * Monta a instrução específica enviada à IA, combinando o objetivo comercial
 * com a objeção do cliente (e a resposta-padrão da biblioteca, quando houver).
 */
export function montarInstrucao(args: {
  objetivo?: string | null;
  objecao?: string | null;
  respostaBiblioteca?: string | null;
}): string {
  const obj = resolverObjetivo(args.objetivo);
  const partes = [obj.instrucao];
  if (args.objecao && args.objecao.trim()) {
    partes.push(`O cliente levantou a objeção: "${args.objecao.trim()}".`);
    if (args.respostaBiblioteca && args.respostaBiblioteca.trim()) {
      partes.push(
        `Use como base de argumento (adapte o tom, não copie literalmente): "${args.respostaBiblioteca.trim()}".`,
      );
    }
  }
  return partes.join(" ");
}
