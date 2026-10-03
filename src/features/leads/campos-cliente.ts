// Rótulos dos campos que o registro filho herda da mãe (registro mãe,
// docs/ops/registro-mae.md). Puro: usado pela tela do Buscar oportunidade e
// pelo webhook de leads (servidor), que não pode importar o cliente do
// navegador.

const ROTULO_CAMPO: Record<string, string> = {
  renda_informada: "renda",
  renda_estimada: "renda estimada",
  tipo_renda: "tipo de renda",
  faixa_mcmv: "faixa MCMV",
  usa_fgts: "FGTS",
  tem_fgts: "FGTS",
  fgts_valor: "valor do FGTS",
  entrada_disponivel: "entrada",
  decisor: "decisor",
  zona: "zona",
  bairro: "bairro",
  dorms_desejados: "dormitórios",
  precisa_vaga: "vaga",
  prioridades: "prioridades",
  objecoes: "objeções",
  resumo_qualificacao: "qualificação",
  projeto_nome: "empreendimento de interesse",
  construtora: "construtora",
  consentimento_lgpd: "consentimento LGPD",
};

/** Rótulos dos campos que vêm prontos no registro novo. */
export function rotulosHerdados(campos: string[]): string[] {
  return [...new Set(campos.map((c) => ROTULO_CAMPO[c]).filter(Boolean))];
}
