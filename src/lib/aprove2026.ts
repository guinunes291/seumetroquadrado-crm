// ============================================================================
// aprove2026.ts  —  Tabela oficial "APROVE 2026" (parâmetros de crédito)
// ----------------------------------------------------------------------------
// Esta é a TABELA DE CONSULTA do potencial de crédito por renda.
// Substitui o cálculo SAC: em vez de calcular, a gente CONSULTA esta tabela.
//
// Cada linha representa um degrau de renda (de R$100 em R$100, com alguns
// pontos de virada de faixa em .01). Para cada renda, a tabela já traz:
//   - parcela    : parcela PRICE da Caixa (~30% da renda)
//   - finSem     : VALOR DE FINANCIAMENTO p/ cliente SEM redutor
//                  (SEM 36 meses de registro em carteira)
//   - finCom     : VALOR DE FINANCIAMENTO p/ cliente COM redutor
//                  (COM 36 meses de registro -> taxa menor -> financia mais)
//   - subComDep  : SUBSÍDIO se o cliente TEM dependente   (só Faixa 1; null = não contempla)
//   - subSemDep  : SUBSÍDIO se o cliente NÃO tem dependente (só Faixa 1; null = não contempla)
//   - avaliacao  : VALOR MÁXIMO de avaliação do imóvel para aquele segmento
//   - faixa      : 1..4 (MCMV) | 5 = SBPE/R2V
//   - segmento   : HIS1 | HIS2 | HMP | R2V
//
// FONTE: tabela "Parâmetros APROVE 2026" fornecida pela operação.
// ATUALIZAÇÃO: quando a CCFGTS/Caixa atualizar, substitua o array abaixo.
//   (Toda a regra de negócio fica em orcamento.ts; aqui é SÓ dado.)
// ============================================================================

export type SegmentoAprove = "HIS1" | "HIS2" | "HMP" | "R2V";

export interface LinhaAprove {
  renda: number;        // teto de renda daquele degrau
  parcela: number;      // parcela PRICE estimada (Caixa)
  taxaSem: string;      // taxa efetiva sem redutor (texto, ex.: "8,47%")
  finSem: number;       // financiamento sem redutor
  taxaCom: string;      // taxa efetiva com redutor
  finCom: number;       // financiamento com redutor
  subComDep: number | null; // subsídio com dependente
  subSemDep: number | null; // subsídio sem dependente
  avaliacao: number;    // valor máx. de avaliação do imóvel (teto do segmento)
  faixa: number;        // 1..4 | 5 (SBPE/R2V)
  segmento: SegmentoAprove;
}

// Renda mínima e máxima cobertas pela tabela.
export const RENDA_MIN_APROVE = 1700;
export const RENDA_MAX_APROVE = 25000;

export const TABELA_APROVE_2026: LinhaAprove[] = [
  { renda: 1700, parcela: 509.99, taxaSem: "4,85%", finSem: 98615.39, taxaCom: "4,33%", finCom: 105162.27, subComDep: 55000, subSemDep: 16500, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 1800, parcela: 539.99, taxaSem: "4,85%", finSem: 104647.29, taxaCom: "4,33%", finCom: 111594.6, subComDep: 55000, subSemDep: 16500, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 1900, parcela: 569.99, taxaSem: "4,85%", finSem: 110679.19, taxaCom: "4,33%", finCom: 118026.93, subComDep: 55000, subSemDep: 16500, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 2000, parcela: 599.99, taxaSem: "4,85%", finSem: 116711.09, taxaCom: "4,33%", finCom: 124459.26, subComDep: 50777, subSemDep: 15233, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 2100, parcela: 629.99, taxaSem: "4,85%", finSem: 122742.99, taxaCom: "4,33%", finCom: 130891.59, subComDep: 44812, subSemDep: 13443, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 2160.01, parcela: 629.99, taxaSem: "5,11%", finSem: 122464.69, taxaCom: "4,59%", finCom: 130454.43, subComDep: 41729, subSemDep: 12518, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 2200, parcela: 659.99, taxaSem: "5,11%", finSem: 124802.43, taxaCom: "4,59%", finCom: 132944.7, subComDep: 39562, subSemDep: 11868, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 2300, parcela: 689.99, taxaSem: "5,11%", finSem: 130648.25, taxaCom: "4,59%", finCom: 139171.9, subComDep: 34440, subSemDep: 10332, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 2400, parcela: 719.99, taxaSem: "5,11%", finSem: 136494.07, taxaCom: "4,59%", finCom: 145399.1, subComDep: 29735, subSemDep: 8920, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 2500, parcela: 749.99, taxaSem: "5,11%", finSem: 142339.89, taxaCom: "4,59%", finCom: 151626.3, subComDep: 25438, subSemDep: 7631, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 2600, parcela: 779.99, taxaSem: "5,11%", finSem: 148185.71, taxaCom: "4,59%", finCom: 157853.5, subComDep: 21538, subSemDep: 6461, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 2700, parcela: 809.99, taxaSem: "5,11%", finSem: 154031.53, taxaCom: "4,59%", finCom: 164080.7, subComDep: 18026, subSemDep: 5407, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 2800, parcela: 839.99, taxaSem: "5,11%", finSem: 159877.35, taxaCom: "4,59%", finCom: 170307.9, subComDep: 14893, subSemDep: 4467, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 2850.01, parcela: 839.99, taxaSem: "5,37%", finSem: 153138.16, taxaCom: "4,85%", finCom: 162956.18, subComDep: 13589, subSemDep: 4076, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 2900, parcela: 869.99, taxaSem: "5,37%", finSem: 155971.83, taxaCom: "4,85%", finCom: 165971.52, subComDep: 12242, subSemDep: 3672, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 3000, parcela: 899.99, taxaSem: "5,37%", finSem: 161640.3, taxaCom: "4,85%", finCom: 172003.41, subComDep: 9818, subSemDep: 2945, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 3100, parcela: 929.99, taxaSem: "5,37%", finSem: 167308.77, taxaCom: "4,85%", finCom: 178035.3, subComDep: 7744, subSemDep: 2323, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 3200, parcela: 959.99, taxaSem: "5,37%", finSem: 172977.24, taxaCom: "4,85%", finCom: 184067.19, subComDep: 6011, subSemDep: 1803, avaliacao: 275000, faixa: 1, segmento: "HIS1" },
  { renda: 3200.01, parcela: 959.99, taxaSem: "5,64%", finSem: 167817.8, taxaCom: "5,11%", finCom: 178389.71, subComDep: 6072, subSemDep: 1821, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 3300, parcela: 989.99, taxaSem: "5,64%", finSem: 173316.63, taxaCom: "5,11%", finCom: 184234.94, subComDep: 4659, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 3400, parcela: 1019.99, taxaSem: "5,64%", finSem: 178816.01, taxaCom: "5,11%", finCom: 190080.76, subComDep: 3571, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 3500, parcela: 1049.99, taxaSem: "5,64%", finSem: 184315.39, taxaCom: "5,11%", finCom: 195926.58, subComDep: 2799, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 3500.01, parcela: 1049.99, taxaSem: "6,16%", finSem: 173749.93, taxaCom: "5,64%", finCom: 184315.95, subComDep: 2858, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 3600, parcela: 1079.99, taxaSem: "6,16%", finSem: 178933.54, taxaCom: "5,64%", finCom: 189814.78, subComDep: 2384, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 3700, parcela: 1109.99, taxaSem: "6,16%", finSem: 184117.67, taxaCom: "5,64%", finCom: 195314.16, subComDep: 2214, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 3800, parcela: 1139.99, taxaSem: "6,16%", finSem: 189301.8, taxaCom: "5,64%", finCom: 200813.54, subComDep: 2192, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 3900, parcela: 1169.99, taxaSem: "6,16%", finSem: 194485.93, taxaCom: "5,64%", finCom: 206312.92, subComDep: 2171, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 4000, parcela: 1199.99, taxaSem: "6,16%", finSem: 199670.06, taxaCom: "5,64%", finCom: 211812.3, subComDep: 2149, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 4000.01, parcela: 1199.99, taxaSem: "7,22%", finSem: 178491.12, taxaCom: "6,69%", finCom: 188601.32, subComDep: null, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 4100, parcela: 1229.99, taxaSem: "7,22%", finSem: 183124.89, taxaCom: "6,69%", finCom: 193497.56, subComDep: null, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 4200, parcela: 1259.99, taxaSem: "7,22%", finSem: 187759.13, taxaCom: "6,69%", finCom: 198394.29, subComDep: null, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 4300, parcela: 1289.99, taxaSem: "7,22%", finSem: 192393.37, taxaCom: "6,69%", finCom: 203291.02, subComDep: null, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 4400, parcela: 1319.99, taxaSem: "7,22%", finSem: 197027.61, taxaCom: "6,69%", finCom: 208187.75, subComDep: null, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 4500, parcela: 1349.99, taxaSem: "7,22%", finSem: 201661.85, taxaCom: "6,69%", finCom: 213084.48, subComDep: null, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 4600, parcela: 1379.99, taxaSem: "7,22%", finSem: 206296.09, taxaCom: "6,69%", finCom: 217981.21, subComDep: null, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 4700, parcela: 1409.99, taxaSem: "7,22%", finSem: 210930.33, taxaCom: "6,69%", finCom: 220000, subComDep: null, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 4800, parcela: 1439.99, taxaSem: "7,22%", finSem: 215564.57, taxaCom: "6,69%", finCom: 220000, subComDep: null, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 4863, parcela: 1458.89, taxaSem: "7,22%", finSem: 218484.11, taxaCom: "6,69%", finCom: 220000, subComDep: null, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS1" },
  { renda: 4900, parcela: 1468.71, taxaSem: "7,22%", finSem: 220000, taxaCom: "6,69%", finCom: 220000, subComDep: null, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS2" },
  { renda: 5000, parcela: 1468.71, taxaSem: "7,22%", finSem: 220000, taxaCom: "6,69%", finCom: 220000, subComDep: null, subSemDep: null, avaliacao: 275000, faixa: 2, segmento: "HIS2" },
  { renda: 5000.01, parcela: 1499.99, taxaSem: "8,47%", finSem: 198538.68, taxaCom: "7,93%", finCom: 208894.58, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 5100, parcela: 1529.99, taxaSem: "8,47%", finSem: 202645.95, taxaCom: "7,93%", finCom: 213216.09, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 5200, parcela: 1559.99, taxaSem: "8,47%", finSem: 206753.22, taxaCom: "7,93%", finCom: 217537.6, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 5300, parcela: 1589.99, taxaSem: "8,47%", finSem: 210860.49, taxaCom: "7,93%", finCom: 221859.11, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 5400, parcela: 1619.99, taxaSem: "8,47%", finSem: 214967.76, taxaCom: "7,93%", finCom: 226180.62, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 5500, parcela: 1649.99, taxaSem: "8,47%", finSem: 219075.03, taxaCom: "7,93%", finCom: 230502.13, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 5600, parcela: 1679.99, taxaSem: "8,47%", finSem: 223182.3, taxaCom: "7,93%", finCom: 234823.64, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 5700, parcela: 1709.99, taxaSem: "8,47%", finSem: 227289.57, taxaCom: "7,93%", finCom: 239145.15, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 5800, parcela: 1739.99, taxaSem: "8,47%", finSem: 231396.84, taxaCom: "7,93%", finCom: 243466.66, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 5900, parcela: 1769.99, taxaSem: "8,47%", finSem: 235504.11, taxaCom: "7,93%", finCom: 247788.17, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 6000, parcela: 1799.99, taxaSem: "8,47%", finSem: 239611.38, taxaCom: "7,93%", finCom: 252109.68, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 6100, parcela: 1829.99, taxaSem: "8,47%", finSem: 243718.65, taxaCom: "7,93%", finCom: 256431.19, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 6200, parcela: 1859.99, taxaSem: "8,47%", finSem: 247825.92, taxaCom: "7,93%", finCom: 260752.7, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 6300, parcela: 1889.99, taxaSem: "8,47%", finSem: 251933.19, taxaCom: "7,93%", finCom: 265074.21, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 6400, parcela: 1919.99, taxaSem: "8,47%", finSem: 256040.46, taxaCom: "7,93%", finCom: 269395.72, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 6500, parcela: 1949.99, taxaSem: "8,47%", finSem: 260147.73, taxaCom: "7,93%", finCom: 273717.23, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 6600, parcela: 1979.99, taxaSem: "8,47%", finSem: 264255, taxaCom: "7,93%", finCom: 278038.74, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 6700, parcela: 2009.99, taxaSem: "8,47%", finSem: 268362.27, taxaCom: "7,93%", finCom: 282360.25, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 6800, parcela: 2039.99, taxaSem: "8,47%", finSem: 272469.54, taxaCom: "7,93%", finCom: 286681.76, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 6900, parcela: 2069.99, taxaSem: "8,47%", finSem: 276576.81, taxaCom: "7,93%", finCom: 291003.27, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 7000, parcela: 2099.99, taxaSem: "8,47%", finSem: 280684.08, taxaCom: "7,93%", finCom: 295324.78, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 7100, parcela: 2129.99, taxaSem: "8,47%", finSem: 284791.35, taxaCom: "7,93%", finCom: 299646.29, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 7200, parcela: 2159.99, taxaSem: "8,47%", finSem: 288898.62, taxaCom: "7,93%", finCom: 303967.8, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 7300, parcela: 2189.99, taxaSem: "8,47%", finSem: 293005.89, taxaCom: "7,93%", finCom: 308289.31, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 7400, parcela: 2219.99, taxaSem: "8,47%", finSem: 297113.16, taxaCom: "7,93%", finCom: 312610.82, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 7500, parcela: 2249.99, taxaSem: "8,47%", finSem: 301220.43, taxaCom: "7,93%", finCom: 316932.33, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 7600, parcela: 2279.99, taxaSem: "8,47%", finSem: 305327.7, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 7700, parcela: 2309.99, taxaSem: "8,47%", finSem: 309434.97, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 7800, parcela: 2339.99, taxaSem: "8,47%", finSem: 313542.24, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 7900, parcela: 2369.99, taxaSem: "8,47%", finSem: 317649.51, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 8000, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 8100, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 8200, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 8300, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 8400, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 8500, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 8600, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 8700, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 8800, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 8900, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 9000, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 9100, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 9200, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 9300, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 9400, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 9500, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 9600, parcela: 2390.72, taxaSem: "8,47%", finSem: 320000, taxaCom: "7,93%", finCom: 320000, subComDep: null, subSemDep: null, avaliacao: 400000, faixa: 3, segmento: "HIS2" },
  { renda: 9600.01, parcela: 2879.99, taxaSem: "10,47%", finSem: 323945.33, taxaCom: "10,47%", finCom: 323945.33, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HIS2" },
  { renda: 9700, parcela: 2909.99, taxaSem: "10,47%", finSem: 327400.52, taxaCom: "10,47%", finCom: 327400.52, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HIS2" },
  { renda: 9726, parcela: 2917.79, taxaSem: "10,47%", finSem: 328298.96, taxaCom: "10,47%", finCom: 328298.96, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HIS2" },
  { renda: 9800, parcela: 2939.99, taxaSem: "10,47%", finSem: 330856.05, taxaCom: "10,47%", finCom: 330856.05, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 9900, parcela: 2969.99, taxaSem: "10,47%", finSem: 334311.59, taxaCom: "10,47%", finCom: 334311.59, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 10000, parcela: 2999.99, taxaSem: "10,47%", finSem: 337767.13, taxaCom: "10,47%", finCom: 337767.13, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 10100, parcela: 3029.99, taxaSem: "10,47%", finSem: 341222.67, taxaCom: "10,47%", finCom: 341222.67, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 10200, parcela: 3059.99, taxaSem: "10,47%", finSem: 344678.21, taxaCom: "10,47%", finCom: 344678.21, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 10300, parcela: 3089.99, taxaSem: "10,47%", finSem: 348133.75, taxaCom: "10,47%", finCom: 348133.75, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 10400, parcela: 3119.99, taxaSem: "10,47%", finSem: 351589.29, taxaCom: "10,47%", finCom: 351589.29, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 10500, parcela: 3149.99, taxaSem: "10,47%", finSem: 355044.83, taxaCom: "10,47%", finCom: 355044.83, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 10600, parcela: 3179.99, taxaSem: "10,47%", finSem: 358500.37, taxaCom: "10,47%", finCom: 358500.37, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 10700, parcela: 3209.99, taxaSem: "10,47%", finSem: 361955.91, taxaCom: "10,47%", finCom: 361955.91, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 10800, parcela: 3239.99, taxaSem: "10,47%", finSem: 365411.45, taxaCom: "10,47%", finCom: 365411.45, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 10900, parcela: 3269.99, taxaSem: "10,47%", finSem: 368866.99, taxaCom: "10,47%", finCom: 368866.99, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 11000, parcela: 3299.99, taxaSem: "10,47%", finSem: 372322.53, taxaCom: "10,47%", finCom: 372322.53, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 11100, parcela: 3329.99, taxaSem: "10,47%", finSem: 375778.07, taxaCom: "10,47%", finCom: 375778.07, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 11200, parcela: 3359.99, taxaSem: "10,47%", finSem: 379233.61, taxaCom: "10,47%", finCom: 379233.61, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 11300, parcela: 3389.99, taxaSem: "10,47%", finSem: 382689.15, taxaCom: "10,47%", finCom: 382689.15, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 11400, parcela: 3419.99, taxaSem: "10,47%", finSem: 386144.69, taxaCom: "10,47%", finCom: 386144.69, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 11500, parcela: 3449.99, taxaSem: "10,47%", finSem: 389600.23, taxaCom: "10,47%", finCom: 389600.23, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 11600, parcela: 3479.99, taxaSem: "10,47%", finSem: 393055.77, taxaCom: "10,47%", finCom: 393055.77, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 11700, parcela: 3509.99, taxaSem: "10,47%", finSem: 396511.31, taxaCom: "10,47%", finCom: 396511.31, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 11800, parcela: 3539.99, taxaSem: "10,47%", finSem: 399966.85, taxaCom: "10,47%", finCom: 399966.85, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 11900, parcela: 3569.99, taxaSem: "10,47%", finSem: 403422.39, taxaCom: "10,47%", finCom: 403422.39, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 12000, parcela: 3599.99, taxaSem: "10,47%", finSem: 406877.93, taxaCom: "10,47%", finCom: 406877.93, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 12100, parcela: 3629.99, taxaSem: "10,47%", finSem: 410333.47, taxaCom: "10,47%", finCom: 410333.47, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 12200, parcela: 3659.99, taxaSem: "10,47%", finSem: 413789.01, taxaCom: "10,47%", finCom: 413789.01, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 12300, parcela: 3689.99, taxaSem: "10,47%", finSem: 417244.55, taxaCom: "10,47%", finCom: 417244.55, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 12400, parcela: 3719.99, taxaSem: "10,47%", finSem: 420700.09, taxaCom: "10,47%", finCom: 420700.09, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 12500, parcela: 3749.99, taxaSem: "10,47%", finSem: 424155.63, taxaCom: "10,47%", finCom: 424155.63, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 12600, parcela: 3779.99, taxaSem: "10,47%", finSem: 427611.17, taxaCom: "10,47%", finCom: 427611.17, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 12700, parcela: 3809.99, taxaSem: "10,47%", finSem: 431066.71, taxaCom: "10,47%", finCom: 431066.71, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 12800, parcela: 3839.99, taxaSem: "10,47%", finSem: 434522.25, taxaCom: "10,47%", finCom: 434522.25, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 12900, parcela: 3869.99, taxaSem: "10,47%", finSem: 437977.79, taxaCom: "10,47%", finCom: 437977.79, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 13000, parcela: 3899.99, taxaSem: "10,47%", finSem: 441433.33, taxaCom: "10,47%", finCom: 441433.33, subComDep: null, subSemDep: null, avaliacao: 600000, faixa: 4, segmento: "HMP" },
  { renda: 13000.01, parcela: 3249.99, taxaSem: "11,49%", finSem: 332051.67, taxaCom: "11,49%", finCom: 332051.67, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 13100, parcela: 3274.99, taxaSem: "11,49%", finSem: 334665.58, taxaCom: "11,49%", finCom: 334665.58, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 13200, parcela: 3299.99, taxaSem: "11,49%", finSem: 337279.74, taxaCom: "11,49%", finCom: 337279.74, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 13300, parcela: 3324.99, taxaSem: "11,49%", finSem: 339893.9, taxaCom: "11,49%", finCom: 339893.9, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 13400, parcela: 3349.99, taxaSem: "11,49%", finSem: 342508.06, taxaCom: "11,49%", finCom: 342508.06, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 13500, parcela: 3374.99, taxaSem: "11,49%", finSem: 345122.22, taxaCom: "11,49%", finCom: 345122.22, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 13600, parcela: 3399.99, taxaSem: "11,49%", finSem: 347736.38, taxaCom: "11,49%", finCom: 347736.38, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 13700, parcela: 3424.99, taxaSem: "11,49%", finSem: 350350.54, taxaCom: "11,49%", finCom: 350350.54, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 13800, parcela: 3449.99, taxaSem: "11,49%", finSem: 352964.7, taxaCom: "11,49%", finCom: 352964.7, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 13900, parcela: 3474.99, taxaSem: "11,49%", finSem: 355578.86, taxaCom: "11,49%", finCom: 355578.86, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 14000, parcela: 3499.99, taxaSem: "11,49%", finSem: 358193.02, taxaCom: "11,49%", finCom: 358193.02, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 14100, parcela: 3524.99, taxaSem: "11,49%", finSem: 360807.18, taxaCom: "11,49%", finCom: 360807.18, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 14200, parcela: 3549.99, taxaSem: "11,49%", finSem: 363421.34, taxaCom: "11,49%", finCom: 363421.34, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 14300, parcela: 3574.99, taxaSem: "11,49%", finSem: 366035.5, taxaCom: "11,49%", finCom: 366035.5, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 14400, parcela: 3599.99, taxaSem: "11,49%", finSem: 368649.66, taxaCom: "11,49%", finCom: 368649.66, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 14500, parcela: 3624.99, taxaSem: "11,49%", finSem: 371263.82, taxaCom: "11,49%", finCom: 371263.82, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 14600, parcela: 3649.99, taxaSem: "11,49%", finSem: 373877.98, taxaCom: "11,49%", finCom: 373877.98, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 14700, parcela: 3674.99, taxaSem: "11,49%", finSem: 376492.14, taxaCom: "11,49%", finCom: 376492.14, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 14800, parcela: 3699.99, taxaSem: "11,49%", finSem: 379106.3, taxaCom: "11,49%", finCom: 379106.3, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 14900, parcela: 3724.99, taxaSem: "11,49%", finSem: 381720.46, taxaCom: "11,49%", finCom: 381720.46, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 15000, parcela: 3749.99, taxaSem: "11,49%", finSem: 384334.62, taxaCom: "11,49%", finCom: 384334.62, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 15100, parcela: 3774.99, taxaSem: "11,49%", finSem: 386948.78, taxaCom: "11,49%", finCom: 386948.78, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 15200, parcela: 3799.99, taxaSem: "11,49%", finSem: 389562.94, taxaCom: "11,49%", finCom: 389562.94, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 15300, parcela: 3824.99, taxaSem: "11,49%", finSem: 392177.1, taxaCom: "11,49%", finCom: 392177.1, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 15400, parcela: 3849.99, taxaSem: "11,49%", finSem: 394791.26, taxaCom: "11,49%", finCom: 394791.26, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 15500, parcela: 3874.99, taxaSem: "11,49%", finSem: 397405.42, taxaCom: "11,49%", finCom: 397405.42, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 15600, parcela: 3899.99, taxaSem: "11,49%", finSem: 400019.58, taxaCom: "11,49%", finCom: 400019.58, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 15700, parcela: 3924.99, taxaSem: "11,49%", finSem: 402633.74, taxaCom: "11,49%", finCom: 402633.74, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 15800, parcela: 3949.99, taxaSem: "11,49%", finSem: 405247.9, taxaCom: "11,49%", finCom: 405247.9, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 15900, parcela: 3974.99, taxaSem: "11,49%", finSem: 407862.06, taxaCom: "11,49%", finCom: 407862.06, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 16000, parcela: 3999.99, taxaSem: "11,49%", finSem: 410476.22, taxaCom: "11,49%", finCom: 410476.22, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 16210, parcela: 4052.49, taxaSem: "11,49%", finSem: 415966.15, taxaCom: "11,49%", finCom: 415966.15, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "HMP" },
  { renda: 17000, parcela: 4249.99, taxaSem: "11,49%", finSem: 436618.07, taxaCom: "11,49%", finCom: 436618.07, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "R2V" },
  { renda: 18000, parcela: 4499.99, taxaSem: "11,49%", finSem: 462759.73, taxaCom: "11,49%", finCom: 462759.73, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "R2V" },
  { renda: 19000, parcela: 4749.99, taxaSem: "11,49%", finSem: 488901.39, taxaCom: "11,49%", finCom: 488901.39, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "R2V" },
  { renda: 20000, parcela: 4999.99, taxaSem: "11,49%", finSem: 515043.05, taxaCom: "11,49%", finCom: 515043.05, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "R2V" },
  { renda: 21000, parcela: 5249.99, taxaSem: "11,49%", finSem: 541184.71, taxaCom: "11,49%", finCom: 541184.71, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "R2V" },
  { renda: 22000, parcela: 5499.99, taxaSem: "11,49%", finSem: 567326.37, taxaCom: "11,49%", finCom: 567326.37, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "R2V" },
  { renda: 23000, parcela: 5749.99, taxaSem: "11,49%", finSem: 593468.03, taxaCom: "11,49%", finCom: 593468.03, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "R2V" },
  { renda: 24000, parcela: 5812.46, taxaSem: "11,49%", finSem: 600000, taxaCom: "11,49%", finCom: 600000, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "R2V" },
  { renda: 25000, parcela: 5812.46, taxaSem: "11,49%", finSem: 600000, taxaCom: "11,49%", finCom: 600000, subComDep: null, subSemDep: null, avaliacao: 750000, faixa: 5, segmento: "R2V" },];
