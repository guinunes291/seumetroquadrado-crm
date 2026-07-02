// Ação compartilhada de WhatsApp para leads: mensagem padrão e título da interação.

/**
 * Mensagem padrão de primeiro contato via WhatsApp. Fonte única do texto que
 * antes vivia copiado em três pontos da lista de leads.
 */
export function mensagemPrimeiroContato(nome: string, projetoNome?: string | null): string {
  const primeiroNome = nome.split(" ")[0] ?? nome;
  const projeto = projetoNome ? ` sobre o ${projetoNome}` : "";
  return `Olá, ${primeiroNome}! Aqui é da Seu Metro Quadrado${projeto}. Recebemos seu contato e gostaríamos de te ajudar. Posso te chamar agora?`;
}

export const WHATSAPP_TITULO_PADRAO = "Mensagem enviada via WhatsApp";
