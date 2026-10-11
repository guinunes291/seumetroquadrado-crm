// Tabela de fluxo da VIBRA por empreendimento, copiada do simulador oficial do
// canal (Vibra Parcerias · Canal Parceria Equipe Grego,
// simulador-vibra.corretorgregosp.workers.dev), versão de out/2026.
//
// COMO ATUALIZAR quando a Vibra mandar a tabela do mês: abra o código-fonte do
// simulador oficial, copie o objeto `EMPREENDIMENTOS` inteiro e cole no lugar
// do de baixo, sem mexer no formato (o `prettier-ignore` mantém uma linha por
// empreendimento, igual à fonte, para o diff com o simulador ficar legível).
// Depois atualize CONFERIDA_EM e suba a `versao` da Vibra em construtoras.ts.
//
// O que cada campo quer dizer (lido do simulador oficial):
//   atoData     mês-base da tabela: o 1º ato. As quantidades g1/g2/g3 valem
//               para quem assina NESTE mês (ver "perde uma mensal" em vibra.ts)
//   g1, g2, g3  nº de mensais em cada faixa (teto de 28%, 22% e 18% da renda
//               por parcela), em sequência, a partir do 5º mês (depois dos 4 atos)
//   anuais      1 ou 2 parcelas em dezembro (teto: 100% da renda cada),
//               a partir de anualData; a 2ª cai 12 meses depois
//   unicaQtd    parcela única (0 ou 1) em unicaData, teto unicaPct × renda
//   posChave    nº de parcelas depois das chaves a partir de posChaveIni
//               (teto 10% da renda cada e 5% do imóvel no total)
//   entrega     previsão de entrega
//   retencao    fração do financiamento que entra no fluxo: 0,99 = a Vibra
//               retém 1% para a correção do INCC até a assinatura na Caixa

export interface LinhaTabelaVibra {
  atoData: string;
  g1: number;
  g2: number;
  g3: number;
  anuais: number;
  anualData: string;
  unicaQtd: number;
  unicaPct: number;
  posChave: number;
  entrega: string;
  posChaveIni: string;
  unicaData: string | null;
  retencao: number;
}

/** Dia em que esta cópia foi conferida com o simulador oficial. */
export const CONFERIDA_EM = "2026-10-11";
export const FONTE_TABELA_VIBRA = "simulador Vibra Parcerias, Canal Parceria Equipe Grego";

// prettier-ignore
export const EMPREENDIMENTOS: Record<string, LinhaTabelaVibra> = {
  "Parque Vila Sônia":        { atoData:'2026-10-01', g1:2, g2:8, g3:7, anuais:1, anualData:'2027-12-01', unicaQtd:1, unicaPct:0.5, posChave:24, entrega:'2028-11-01', posChaveIni:'2028-08-01', unicaData:'2028-07-01', retencao:0.99 },
  "Estação Vila Sônia":       { atoData:'2026-10-01', g1:0, g2:5, g3:8, anuais:1, anualData:'2027-12-01', unicaQtd:0, unicaPct:1,   posChave:18, entrega:'2028-05-01', posChaveIni:'2028-03-01', unicaData:null, retencao:0.99 },
  "Vista Butantã":            { atoData:'2026-10-01', g1:0, g2:4, g3:6, anuais:1, anualData:'2027-12-01', unicaQtd:0, unicaPct:1,   posChave:18, entrega:'2028-03-01', posChaveIni:'2028-01-01', unicaData:null, retencao:0.99 },
  "Pq. Cidade Universitária": { atoData:'2026-10-01', g1:0, g2:0, g3:4, anuais:0, anualData:'2027-12-01', unicaQtd:1, unicaPct:1,   posChave:20, entrega:'2027-09-01', posChaveIni:'2027-08-01', unicaData:'2027-07-01', retencao:0.99 },
  "Vibra Mooca":              { atoData:'2026-10-01', g1:2, g2:8, g3:8, anuais:1, anualData:'2027-12-01', unicaQtd:1, unicaPct:0.5, posChave:10, entrega:'2028-10-01', posChaveIni:'2028-08-01', unicaData:'2028-07-01', retencao:0.99 },
  "Conselheiro Carrão":       { atoData:'2026-10-01', g1:1, g2:7, g3:7, anuais:1, anualData:'2027-12-01', unicaQtd:1, unicaPct:0.5, posChave:12, entrega:'2028-10-01', posChaveIni:'2028-06-01', unicaData:'2028-05-01', retencao:0.99 },
  "Estação Vila Prudente":    { atoData:'2026-10-01', g1:0, g2:4, g3:7, anuais:0, anualData:'2027-12-01', unicaQtd:1, unicaPct:1,   posChave:18, entrega:'2028-04-01', posChaveIni:'2028-02-01', unicaData:'2028-01-01', retencao:0.99 },
  "São Mateus":               { atoData:'2026-10-01', g1:0, g2:0, g3:7, anuais:0, anualData:'2027-12-01', unicaQtd:1, unicaPct:1,   posChave:24, entrega:'2027-11-01', posChaveIni:'2027-09-01', unicaData:'2027-08-01', retencao:0.99 },
  "Marechal Tito":            { atoData:'2026-10-01', g1:0, g2:0, g3:5, anuais:0, anualData:'2027-12-01', unicaQtd:1, unicaPct:1,   posChave:28, entrega:'2028-01-01', posChaveIni:'2027-08-01', unicaData:'2027-07-01', retencao:0.99 },
  "Paes de Barros":           { atoData:'2026-10-01', g1:6, g2:8, g3:7, anuais:1, anualData:'2027-12-01', unicaQtd:1, unicaPct:0.5, posChave:12, entrega:'2029-03-01', posChaveIni:'2028-11-01', unicaData:'2028-10-01', retencao:0.985 },
  "Parque Vl. Prudente":      { atoData:'2026-10-01', g1:3, g2:7, g3:7, anuais:1, anualData:'2027-12-01', unicaQtd:1, unicaPct:0.5, posChave:18, entrega:'2028-12-01', posChaveIni:'2028-08-01', unicaData:'2028-07-01', retencao:0.99 },
  "Rio Bonito":               { atoData:'2026-10-01', g1:2, g2:8, g3:7, anuais:1, anualData:'2027-12-01', unicaQtd:1, unicaPct:0.5, posChave:12, entrega:'2028-12-01', posChaveIni:'2028-08-01', unicaData:'2028-07-01', retencao:0.99 },
  "Vibra Veleiros":           { atoData:'2026-10-01', g1:0, g2:0, g3:8, anuais:0, anualData:'2027-12-01', unicaQtd:1, unicaPct:1,   posChave:22, entrega:'2028-01-01', posChaveIni:'2027-10-01', unicaData:'2027-10-01', retencao:0.99 },
  "Nações Unidas":            { atoData:'2026-10-01', g1:0, g2:0, g3:4, anuais:0, anualData:'2027-12-01', unicaQtd:1, unicaPct:1,   posChave:24, entrega:'2027-09-01', posChaveIni:'2027-07-01', unicaData:'2027-06-01', retencao:0.99 },
  "Vibra João Dias":          { atoData:'2026-10-01', g1:0, g2:0, g3:5, anuais:0, anualData:'2027-12-01', unicaQtd:1, unicaPct:1,   posChave:24, entrega:'2027-09-01', posChaveIni:'2027-07-01', unicaData:'2027-06-01', retencao:0.99 },
  "Vibra Sabará":             { atoData:'2026-10-01', g1:2, g2:7, g3:6, anuais:1, anualData:'2027-12-01', unicaQtd:1, unicaPct:0.5, posChave:18, entrega:'2028-08-01', posChaveIni:'2028-06-01', unicaData:'2028-05-01', retencao:0.99 },
  "Estação Giovanni":         { atoData:'2026-10-01', g1:0, g2:2, g3:7, anuais:0, anualData:'2027-12-01', unicaQtd:1, unicaPct:1,   posChave:24, entrega:'2028-01-01', posChaveIni:'2027-12-01', unicaData:'2027-11-01', retencao:0.99 },
  "Estação Campo Limpo":      { atoData:'2026-10-01', g1:0, g2:4, g3:8, anuais:1, anualData:'2027-12-01', unicaQtd:0, unicaPct:1,   posChave:18, entrega:'2028-04-01', posChaveIni:'2028-02-01', unicaData:null, retencao:0.99 },
  "Jd. Bonfiglioli":          { atoData:'2026-10-01', g1:4, g2:6, g3:6, anuais:1, anualData:'2027-12-01', unicaQtd:1, unicaPct:0.5, posChave:18, entrega:'2028-11-01', posChaveIni:'2028-08-01', unicaData:'2028-06-01', retencao:0.985 },
  "Vibra Belenzinho":         { atoData:'2026-10-01', g1:6, g2:7, g3:7, anuais:1, anualData:'2027-12-01', unicaQtd:1, unicaPct:0.5, posChave:15, entrega:'2029-03-01', posChaveIni:'2028-11-01', unicaData:'2028-10-01', retencao:0.985 },
  "Vibra Vila Romana":        { atoData:'2026-10-01', g1:8, g2:8, g3:8, anuais:2, anualData:'2027-12-01', unicaQtd:0, unicaPct:1,   posChave:12, entrega:'2029-07-01', posChaveIni:'2029-02-01', unicaData:null, retencao:0.985 }
};

/**
 * Nome do projeto no catálogo do CRM quando ele NÃO casa com o da tabela pelo
 * nome normalizado (sem acento, sem "Vibra", Pq./Vl./Jd. por extenso). Serve
 * para a tela listar as unidades disponíveis do projeto certo. Casos
 * conferidos pela previsão de entrega, que bate nos dois cadastros:
 *   São Mateus      → "Estacao Sao Matheus" (entrega nov/2027)
 *   Vibra Mooca     → "Vibra Alto da Mooca" (entrega out/2028)
 *   Jd. Bonfiglioli → "Vibra JD Bonfigliori" (grafia do catálogo)
 */
export const NOMES_NO_CATALOGO: Record<string, readonly string[]> = {
  "São Mateus": ["Estacao Sao Matheus"],
  "Vibra Mooca": ["Vibra Alto da Mooca"],
  "Jd. Bonfiglioli": ["Vibra JD Bonfigliori"],
};
