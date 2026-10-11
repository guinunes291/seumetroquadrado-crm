// Parâmetros da LONGITUDE por empreendimento, copiados do código do
// simulador oficial (simulador.longitude.com.br, arquivo simulador.js,
// lista `empreendimentosFallback`).
//
// ATENÇÃO: no simulador oficial esses números são o FALLBACK. Os vigentes
// vêm do painel da Longitude (cadastro do empreendimento e configuração por
// score de crédito B2E, que o CRM não consulta). Por isso a tela abre com
// estes valores, mostra todos eles e deixa o corretor ajustar para o que o
// simulador oficial mostrar. Empreendimento fora da lista usa o padrão do
// próprio código (PREMISSAS_PADRAO_LONGITUDE).
//
// COMO ATUALIZAR: confira no simulador oficial (ou com o gerente) as
// premissas de cada empreendimento e troque aqui; suba a `versao` da
// Longitude em construtoras.ts.

export interface PremissasLongitude {
  /** Total de parcelas do pró-soluto (pré-chaves + pós-chaves). */
  parcelasMax: number;
  /** Teto de CADA parcela pré-chaves, em fração da renda. */
  comprometimentoPre: number;
  /** Teto do total do pós-chaves, em fração do valor final da venda. */
  proSolutoPosMax: number;
  /** Teto de (parcela pós-chaves + 1ª parcela do financiamento) sobre a renda. */
  comprometimentoTotal: number;
  /** Mínimo de (ato + FGTS + subsídio + financiamento) sobre o valor final. */
  referenciaMinima: number;
  /** Ato mínimo em R$ (0 = sem mínimo cadastrado). */
  atoMinimo: number;
}

/** Padrão do código quando o empreendimento não traz o próprio valor. */
export const PREMISSAS_PADRAO_LONGITUDE: PremissasLongitude = {
  parcelasMax: 60,
  comprometimentoPre: 0.2599,
  proSolutoPosMax: 0.0899,
  comprometimentoTotal: 0.45,
  referenciaMinima: 0.6,
  atoMinimo: 0,
};

export interface EmpreendimentoLongitude {
  nome: string;
  regiao: string;
  status: string;
  premissas: PremissasLongitude;
  /** Fora da lista do código: premissas do padrão. */
  outro?: boolean;
}

export const CONFERIDA_EM_LONGITUDE = "2026-10-11";
export const FONTE_LONGITUDE =
  "código do simulador Longitude (regras); premissas por empreendimento do fallback do código";

const p = (
  parcelasMax: number,
  comprometimentoPre: number,
  proSolutoPosMax: number,
  comprometimentoTotal: number,
): PremissasLongitude => ({
  ...PREMISSAS_PADRAO_LONGITUDE,
  parcelasMax,
  comprometimentoPre,
  proSolutoPosMax,
  comprometimentoTotal,
});

// Mesma ordem e mesmos números de `empreendimentosFallback` (o campo
// `comprometimentoPos` de lá é o pró-soluto pós-chaves, como o próprio
// código lê: pro_soluto_pos_chaves ?? comprometimento_pos_chaves).
// prettier-ignore
export const EMPREENDIMENTOS_LONGITUDE: readonly EmpreendimentoLongitude[] = [
  { nome: "Vibe",              regiao: "Itaim Paulista",    status: "Em obras",   premissas: p(82, 0.3599, 0.0899, 0.45) },
  { nome: "Zen",               regiao: "Guaianases",        status: "Em obras",   premissas: p(72, 0.3599, 0.0899, 0.45) },
  { nome: "Cittá",             regiao: "Cidade Tiradentes", status: "Lançamento", premissas: p(60, 0.2599, 0.0499, 0.4) },
  { nome: "Estação Dom Bosco", regiao: "Itaquera",          status: "Lançamento", premissas: p(48, 0.2599, 0.0899, 0.45) },
  { nome: "Perus",             regiao: "Perus",             status: "Lançamento", premissas: p(60, 0.2599, 0.0499, 0.4) },
  { nome: "Rio Branco",        regiao: "Centro",            status: "Lançamento", premissas: p(60, 0.2599, 0.0499, 0.4) },
  { nome: "Tietê",             regiao: "Piqueri",           status: "Lançamento", premissas: p(60, 0.2599, 0.0499, 0.4) },
];

export const OUTRO_EMPREENDIMENTO_LONGITUDE: EmpreendimentoLongitude = {
  nome: "Outro empreendimento",
  regiao: "",
  status: "",
  premissas: { ...PREMISSAS_PADRAO_LONGITUDE },
  outro: true,
};

/** Nome no catálogo do CRM quando não casa pelo nome normalizado. */
export const NOMES_NO_CATALOGO_LONGITUDE: Record<string, readonly string[]> = {
  Zen: ["Zen Residence"],
};
