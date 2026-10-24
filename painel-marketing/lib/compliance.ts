// Regras fixas da SMQ para qualquer texto que o Painel gere ou publique.
// Funções puras (sem banco e sem rede) para poder testar isoladas.
// O Auditor de Compliance (agente) roda depois destas regras e pega o que
// expressão regular não pega; estas regras nunca são relaxadas por ele.

export type Problema = { regra: string; trecho: string };

const REGRAS: { regra: string; padrao: RegExp }[] = [
  { regra: "Não usar travessão", padrao: /[—–]/ },
  {
    regra: "Não prometer aprovação de crédito",
    padrao:
      /(cr[eé]dito|financiamento)[^.!?\n]{0,40}(aprovad|garantid|certo|f[aá]cil)|(aprova[cç][aã]o|aprovado)[^.!?\n]{0,30}(garantid|certa|na hora|imediat|100)|sem consulta (ao|no) (spc|serasa)|nome sujo[^.!?\n]{0,30}(aprova|financ)/i,
  },
  {
    regra: "Não informar valor de aprovação",
    padrao: /(aprovad[oa]s?|aprova[cç][aã]o|cr[eé]dito aprovado)[^.!?\n]{0,40}R\$\s?\d/i,
  },
];

export function verificarTexto(texto: string): Problema[] {
  const achados: Problema[] = [];
  for (const { regra, padrao } of REGRAS) {
    const m = texto.match(padrao);
    if (m) achados.push({ regra, trecho: m[0] });
  }
  return achados;
}

// Preço só pode aparecer se vier da tabela oficial do empreendimento, com data.
// O Painel ainda não lê a tabela, então qualquer valor em reais no texto
// precisa ser conferido por uma pessoa antes de publicar.
export function temPreco(texto: string): boolean {
  return /R\$\s?\d|\d+\s?mil reais|parcelas? de\s?\d/i.test(texto);
}
