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
  const detalhe = [
    local || null,
    empreendimento.precoLabel ? `a partir de ${empreendimento.precoLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const linha = `${empreendimento.nome}${detalhe ? ` (${detalhe})` : ""}`;
  const book = empreendimento.bookUrl
    ? `\n\nBook do empreendimento: ${empreendimento.bookUrl}`
    : "";
  return (
    `Oi, ${primeiroNome}! Separei um empreendimento que combina com o que você procura: ${linha}.` +
    ` Quer que eu te mande o book e a tabela completa?${book}`
  );
}

export const WHATSAPP_TITULO_EMPREENDIMENTO = "Empreendimento enviado via WhatsApp";

/**
 * Endereço de um stand de vendas para mandar ao cliente (Mapa de Lojas). Leva
 * a rota pelo ENDEREÇO, não pelo pino do mapa — o pino pode ser estimado. A
 * observação do stand ("sem decorado", "decorado de 2 dorm") vai junto porque
 * evita a viagem perdida de quem foi ver um decorado que não existe.
 */
export function mensagemLoja(loja: {
  construtora: string;
  nome: string;
  endereco: string;
  bairro?: string | null;
  obs?: string | null;
  rotaUrl: string;
}): string {
  const local = [loja.endereco, loja.bairro].filter(Boolean).join(" — ");
  const obs = loja.obs ? `\nBom saber: ${loja.obs.replace(/\.?\s*$/, ".")}` : "";
  return (
    `Olá! Segue o endereço do stand de vendas da ${loja.construtora} (${loja.nome}):\n` +
    `${local}\n` +
    `Como chegar: ${loja.rotaUrl}` +
    obs +
    `\n\nMe avise quando estiver a caminho que eu deixo tudo pronto para te receber.`
  );
}
