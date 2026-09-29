// Mensagens das RPCs da gestão viradas em frase de tela. As funções SQL
// levantam texto corrido sem acento ("motivo obrigatorio", "forbidden"); o
// gestor precisa ler o que fazer, não o nome da regra.
//
// Função pura de propósito: a tabela é testada sem montar componente.

type Regra = { contem: string[]; texto: string | ((bruto: string) => string) };

const REGRAS: Regra[] = [
  {
    contem: ["forbidden"],
    texto:
      "Você não tem permissão para esta ação. Gestor age só sobre a própria equipe, e ninguém age sobre si mesmo.",
  },
  { contem: ["feedback obrigatorio"], texto: "Escreva o feedback: pelo menos 1 foco de melhoria." },
  { contem: ["escolha aprovada ou refazer"], texto: "Escolha Aprovada ou Refazer." },
  { contem: ["pratica ja avaliada"], texto: "Esta prática já foi avaliada por outra pessoa." },
  { contem: ["motivo obrigatorio"], texto: "Escreva o motivo. Ele fica no histórico do corretor." },
  {
    contem: ["mestre exige nivel especialista"],
    texto: "Mestre só para quem já está em Especialista.",
  },
  { contem: ["mestre exige fases"], texto: "Mestre exige as fases 4 e 5 concluídas." },
  { contem: ["pessoa nao participa"], texto: "Esta pessoa não está inscrita na Academia." },
  { contem: ["bot de servico"], texto: "Conta de robô não entra na Academia." },
  { contem: ["identidade mcp"], texto: "Identidade de integração (MCP) não entra na Academia." },
  { contem: ["conta nao esta ativa"], texto: "A conta desta pessoa não está ativa." },
  {
    contem: ["modulo indisponivel"],
    texto: "O módulo ainda não foi publicado. Publique na tela de Conteúdo antes.",
  },
  { contem: ["recomendacao ja decidida"], texto: "Esta recomendação já foi decidida." },
  {
    contem: ["publique ao menos"],
    texto: "Publique pelo menos 1 aula antes de publicar o módulo.",
  },
  {
    contem: ["o quiz precisa"],
    texto: "O quiz precisa de pelo menos 5 questões ativas para o módulo ser publicado.",
  },
  {
    contem: ["revisao pendente"],
    texto: (bruto) => {
      const nota = bruto.split("revisao pendente:")[1]?.trim();
      return nota
        ? `Há uma revisão pendente: "${nota}". Resolva e clique em Marcar como revisado.`
        : "Há uma revisão pendente. Resolva e clique em Marcar como revisado.";
    },
  },
  { contem: ["titulo obrigatorio"], texto: "Dê um título ao encontro." },
  { contem: ["data e hora obrigatorias"], texto: "Escolha a data e a hora do encontro." },
  { contem: ["encontro nao encontrado"], texto: "Este encontro não existe mais." },
  {
    contem: ["statement timeout", "canceling statement"],
    texto: "O cálculo passou do tempo que a tela espera. Ele roda sozinho todo dia às 02:45.",
  },
  {
    contem: ["duplicate key"],
    texto: "Já existe um item com esta ordem neste módulo. Use outra ordem.",
  },
];

function textoBruto(erro: unknown): string {
  if (!erro) return "";
  if (typeof erro === "string") return erro;
  if (typeof erro === "object") {
    const e = erro as { message?: string; details?: string };
    return `${e.message ?? ""} ${e.details ?? ""}`;
  }
  return "";
}

export function mensagemDaGestao(erro: unknown): string {
  const bruto = textoBruto(erro);
  const baixo = bruto.toLowerCase();
  for (const r of REGRAS) {
    if (r.contem.some((c) => baixo.includes(c))) {
      return typeof r.texto === "function" ? r.texto(bruto) : r.texto;
    }
  }
  return "Não deu para completar a ação. Tente de novo em instantes.";
}
