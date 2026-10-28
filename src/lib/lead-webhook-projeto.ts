// Regra (Guilherme, 28/10/2026): o n8n da Sami usa o token do projeto Sabará
// como porta padrão. Lead do chatbot que chega por token de PROJETO sem dizer o
// empreendimento não pertence ao projeto do token: entra sem projeto.
export function chatbotSemProdutoInformado(args: {
  viaCampanha: boolean;
  origem: string | null | undefined;
  empreendimento?: string | null;
  empreendimentoInteresse?: string | null;
}): boolean {
  const informado =
    (args.empreendimento?.trim() || null) ?? (args.empreendimentoInteresse?.trim() || null);
  return !args.viaCampanha && args.origem === "chatbot" && !informado;
}
