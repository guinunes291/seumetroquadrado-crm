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
};

// Metadados de UI. Modelo, system prompt e instruções por ação vivem na tabela
// versionada `samiq_prompt_versions`, nunca duplicados no bundle do cliente.
export const SAMIQ_ACTION_META: Record<SamiQAction, ActionMeta> = {
  resumo_cliente: {
    label: "Resumo do cliente",
    precisaLead: true,
  },
  mensagem_sugerida: {
    label: "Mensagem de WhatsApp",
    precisaLead: true,
  },
  responder_objecao: {
    label: "Responder objeção",
    precisaLead: true,
  },
  proximo_passo: {
    label: "Próximo melhor passo",
    precisaLead: true,
  },
  projeto_ideal: {
    label: "Projeto ideal",
    precisaLead: true,
  },
  checklist_docs: {
    label: "Checklist de documentos",
    precisaLead: true,
  },
  recuperar_frio: {
    label: "Recuperar lead frio",
    precisaLead: true,
  },
  script_ligacao: {
    label: "Roteiro de ligação",
    precisaLead: true,
  },
  analise_funil: {
    label: "Análise do meu funil",
    precisaLead: false,
  },
  prioridade_dia: {
    label: "Prioridades de hoje",
    precisaLead: false,
  },
  pergunta_livre: {
    label: "Pergunta livre",
    precisaLead: false,
  },
};

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
