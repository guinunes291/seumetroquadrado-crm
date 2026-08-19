// Rótulos de exibição das origens de lead.
//
// O valor gravado no banco continua sendo o enum (`chatbot`, `google_sheets`…).
// Aqui fica só a tradução para a tela — por decisão de nomenclatura, a origem
// `chatbot` é apresentada como "Marquinhos".

export const ORIGEM_LABEL: Record<string, string> = {
  chatbot: "Marquinhos",
  google_sheets: "Google Sheets",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  site: "Site",
  indicacao: "Indicação",
  captacao_corretor: "Captação corretor",
  investimento_corretor: "Investimento corretor",
  telefone: "Telefone",
  plantao: "Plantão",
  agendamento_self_service: "Agendamento self-service",
  importacao: "Importação",
  impulso_smq: "Impulso SMQ",
  outro: "Outro",
};

/** Nome legível de uma origem; desconhecidas caem no próprio código sem "_". */
export function origemLabel(origem: string | null | undefined): string {
  if (!origem) return "—";
  return ORIGEM_LABEL[origem] ?? origem.replace(/_/g, " ");
}
