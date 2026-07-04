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

/**
 * Mensagem de compartilhamento de um empreendimento (usada na Vitrine). Resume o
 * imóvel e oferece o material — opcionalmente já com o link do book. Fonte única
 * do texto que o corretor dispara ao cliente pelo painel da vitrine.
 */
export function mensagemEmpreendimento(
  nomeLead: string,
  empreendimento: {
    nome: string;
    bairro?: string | null;
    zona?: string | null;
    precoLabel?: string | null;
    bookUrl?: string | null;
  },
): string {
  const primeiroNome = nomeLead.split(" ")[0] ?? nomeLead;
  const local = [empreendimento.bairro, empreendimento.zona ? `Zona ${empreendimento.zona}` : null]
    .filter(Boolean)
    .join(", ");
  const detalhe = [local || null, empreendimento.precoLabel ? `a partir de ${empreendimento.precoLabel}` : null]
    .filter(Boolean)
    .join(" · ");
  const linha = `${empreendimento.nome}${detalhe ? ` (${detalhe})` : ""}`;
  const book = empreendimento.bookUrl ? `\n\nBook do empreendimento: ${empreendimento.bookUrl}` : "";
  return (
    `Oi, ${primeiroNome}! Separei um empreendimento que combina com o que você procura: ${linha}.` +
    ` Quer que eu te mande o book e a tabela completa?${book}`
  );
}

export const WHATSAPP_TITULO_EMPREENDIMENTO = "Empreendimento enviado via WhatsApp";
