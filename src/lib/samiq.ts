// Núcleo PURO do SamiQ — o copiloto do corretor. Aqui vivem o contrato de
// entrada (zod), o catálogo de ações, as instruções por ação e a derivação de
// sugestões estruturadas (botões de navegar/copiar). A execução com IA fica em
// samiq.functions.ts (server); este módulo é testável sem rede.
//
// Doutrina: o SamiQ SUGERE, o corretor decide. Nada aqui escreve no banco nem
// envia mensagem — as sugestões viram texto copiável ou navegação.

import { z } from "zod";

export const SAMIQ_ACTIONS = [
  "resumo_cliente",
  "mensagem_sugerida",
  "responder_objecao",
  "proximo_passo",
  "projeto_ideal",
  "checklist_docs",
  "recuperar_frio",
  "script_ligacao",
  "analise_funil",
  "prioridade_dia",
  "pergunta_livre",
] as const;

export type SamiQAction = (typeof SAMIQ_ACTIONS)[number];

export const SamiQInputSchema = z.object({
  action: z.enum(SAMIQ_ACTIONS),
  leadId: z.string().uuid().optional(),
  /** Pergunta livre ou detalhe da ação (ex.: a objeção do cliente). */
  pergunta: z.string().max(500).optional(),
  /** Últimos turnos do chat (cap 6) para continuidade da conversa. */
  historico: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(1200),
      }),
    )
    .max(6)
    .optional(),
});

export type SamiQInput = z.infer<typeof SamiQInputSchema>;

export type SamiQSugestao = {
  label: string;
  /** Navegação interna (ex.: abrir o dossiê do lead). */
  to?: string;
  /** Texto pronto para copiar (mensagem, script). */
  copyText?: string;
};

export type SamiQResposta = {
  texto: string;
  sugestoes: SamiQSugestao[];
};

type ActionMeta = {
  label: string;
  /** Precisa de um lead em contexto para fazer sentido. */
  precisaLead: boolean;
  /** Instrução específica anexada ao prompt. */
  instrucao: string;
};

export const SAMIQ_ACTION_META: Record<SamiQAction, ActionMeta> = {
  resumo_cliente: {
    label: "Resumo do cliente",
    precisaLead: true,
    instrucao:
      "Resuma este cliente em até 6 linhas: quem é, o que busca, capacidade financeira, momento no funil, objeções e o risco principal. Termine com UMA recomendação prática.",
  },
  mensagem_sugerida: {
    label: "Mensagem de WhatsApp",
    precisaLead: true,
    instrucao:
      "Escreva UMA mensagem de WhatsApp pronta para enviar a este cliente, adequada ao momento dele no funil. Máximo 5 linhas curtas, primeiro nome, tom cordial e próximo, com chamada clara para o próximo passo. Responda apenas com o texto da mensagem.",
  },
  responder_objecao: {
    label: "Responder objeção",
    precisaLead: true,
    instrucao:
      "O cliente levantou a objeção descrita pelo corretor. Proponha uma resposta empática e segura em até 4 linhas (use a resposta da biblioteca, se fornecida, como base) e sugira a pergunta de avanço seguinte.",
  },
  proximo_passo: {
    label: "Próximo melhor passo",
    precisaLead: true,
    instrucao:
      "Diga qual é o próximo melhor passo comercial com este cliente e por quê, em até 4 linhas. Seja específico (o que fazer, quando, por qual canal).",
  },
  projeto_ideal: {
    label: "Projeto ideal",
    precisaLead: true,
    instrucao:
      "Com base no perfil do cliente (renda, entrada, FGTS, interesse) e no catálogo fornecido, indique os 2–3 empreendimentos mais compatíveis, com 1 linha de argumento para cada. Se a renda for insuficiente para todos, diga isso com franqueza e sugira o caminho.",
  },
  checklist_docs: {
    label: "Checklist de documentos",
    precisaLead: true,
    instrucao:
      "Monte o checklist de documentos deste cliente para análise de crédito MCMV, considerando o status atual da documentação fornecido. Liste o que falta primeiro, depois o que já está ok. Termine com a mensagem curta de cobrança que o corretor pode enviar.",
  },
  recuperar_frio: {
    label: "Recuperar lead frio",
    precisaLead: true,
    instrucao:
      "Este lead esfriou. Proponha uma abordagem de reativação: o melhor gancho com base no histórico e UMA mensagem de WhatsApp de reaproximação (máx. 4 linhas), sem parecer cobrança.",
  },
  script_ligacao: {
    label: "Roteiro de ligação",
    precisaLead: true,
    instrucao:
      "Monte um roteiro de ligação curto para este cliente: abertura (10s), 3 perguntas-chave para o momento dele no funil, contorno da objeção mais provável e fechamento com compromisso. Use tópicos curtos.",
  },
  analise_funil: {
    label: "Análise do meu funil",
    precisaLead: false,
    instrucao:
      "Analise a distribuição do funil deste corretor (contagens por etapa fornecidas): aponte o maior gargalo, o que está saudável e 2 ações práticas para esta semana. Máximo 8 linhas.",
  },
  prioridade_dia: {
    label: "Prioridades de hoje",
    precisaLead: false,
    instrucao:
      "Com base na fila priorizada fornecida (top leads por score), diga em ordem quem o corretor deve atacar primeiro hoje e com qual abordagem em 1 linha cada. Máximo 6 itens.",
  },
  pergunta_livre: {
    label: "Pergunta livre",
    precisaLead: false,
    instrucao:
      "Responda à pergunta do corretor com objetividade e foco em vendas imobiliárias MCMV em São Paulo. Se a pergunta depender de dados que você não tem, diga o que falta.",
  },
};

export const SAMIQ_SYSTEM_PROMPT =
  "Você é o SamiQ, copiloto comercial da imobiliária Seu Metro Quadrado (SMQ), especialista em vendas " +
  "de imóveis Minha Casa Minha Vida e lançamentos em São Paulo. Fala português do Brasil, direto e prático, " +
  "como um gerente comercial experiente que respeita o tempo do corretor. " +
  "Regras: não invente dados que não estão no contexto; não prometa condições de financiamento específicas; " +
  "não use markdown pesado (sem tabelas; use hífens para listas); nunca se refira ao cliente como 'lead' ao " +
  "sugerir mensagens para ele; mensagens sugeridas devem estar prontas para envio e serão SEMPRE revisadas pelo corretor.";

/** Sugestões estruturadas por ação — derivadas em código, nunca pelo modelo. */
export function sugestoesPara(
  action: SamiQAction,
  texto: string,
  leadId?: string,
): SamiQSugestao[] {
  const s: SamiQSugestao[] = [];
  const textoLimpo = texto.trim();
  switch (action) {
    case "mensagem_sugerida":
    case "recuperar_frio":
      s.push({ label: "Copiar mensagem", copyText: textoLimpo });
      break;
    case "responder_objecao":
    case "script_ligacao":
    case "checklist_docs":
      s.push({ label: "Copiar texto", copyText: textoLimpo });
      break;
    case "prioridade_dia":
      s.push({ label: "Abrir Atendimento", to: "/atendimento" });
      break;
    case "analise_funil":
      s.push({ label: "Abrir Pipeline", to: "/pipeline" });
      break;
    default:
      break;
  }
  if (leadId) s.push({ label: "Abrir dossiê", to: `/leads/${leadId}` });
  return s;
}
