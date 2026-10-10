// ============================================================================
// amortizacao.ts  —  Motor ÚNICO de amortização de financiamento (SAC e PRICE)
// ----------------------------------------------------------------------------
// Gera a planilha mês a mês de um contrato habitacional do SFH (Caixa, FGTS/
// MCMV ou SBPE) com tudo que muda o valor da parcela de verdade:
//
//   1. Taxa de juros NOMINAL ou EFETIVA (o contrato da Caixa traz as duas; a
//      mensal é sempre nominal / 12, e a efetiva é (1 + mensal)^12 − 1).
//   2. Correção monetária do saldo (TR, IPCA ou zero na taxa fixa), aplicada
//      ANTES dos juros, todo mês, no aniversário do contrato.
//   3. SAC: amortização = saldo corrigido / prazo restante (constante se a TR
//      for zero, sobe junto com a TR se não for). Juros caem, parcela cai.
//   4. PRICE: prestação (amortização + juros) recalculada sobre o saldo
//      corrigido e o prazo restante. Sem TR, ela é fixa do 1º ao último mês.
//   5. Seguros: MIP sobre o SALDO DEVEDOR (taxa pela idade de cada proponente,
//      ponderada pela participação na cobertura, e a idade AVANÇA no contrato);
//      DFI sobre o VALOR DO IMÓVEL (base corrigida pelo mesmo índice).
//   6. Taxa de administração mensal em R$.
//   7. Fase de obra (compra na planta, crédito associativo): só juros sobre o
//      valor JÁ LIBERADO conforme a evolução da obra + atualização monetária +
//      seguros + taxa adm. Sem amortização. A amortização começa depois.
//   8. Amortização extraordinária (FGTS a cada 2 anos, 13º, bônus): reduzir o
//      PRAZO (mantém a parcela) ou reduzir a PARCELA (mantém o prazo).
//   9. CET estimado (taxa interna de retorno do fluxo real do cliente).
//
// Ordem dos fatos dentro de um mês de amortização (é a ordem do contrato):
//   saldo anterior → corrige pelo índice → juros sobre o saldo corrigido →
//   amortização → seguros e taxa → parcela paga → amortização extra (se houver)
//
// Arredondamento: cada componente é arredondado ao centavo no mês em que nasce
// (como no extrato do banco). A última parcela absorve o resíduo para o saldo
// fechar exatamente em zero.
//
// Responsabilidade técnica: é uma SIMULAÇÃO COMERCIAL. Taxas de seguro mudam
// por seguradora e por proposta; a tabela de MIP padrão abaixo é ESTIMATIVA.
// Para bater com a proposta da Caixa, informe a taxa de MIP/DFI da proposta.
// ============================================================================

export type SistemaAmortizacao = "SAC" | "PRICE";
export type TipoTaxa = "nominal" | "efetiva";
export type ModoAmortizacaoExtra = "reduzir_prazo" | "reduzir_parcela";

export interface Proponente {
  nome?: string;
  /** Idade em anos na assinatura (pode ter fração: 34,5 = 34 anos e 6 meses). */
  idade: number;
  /** Participação na cobertura do MIP (0..1). A soma dos proponentes deve dar 1. */
  participacao: number;
}

export interface FaixaMip {
  /** Idade (anos completos) até a qual a taxa vale, inclusive. */
  idadeAte: number;
  /** Fração mensal sobre o saldo devedor (0,00015 = 0,015% a.m.). */
  taxaMensal: number;
}

/**
 * Tabela de MIP por idade — ESTIMATIVA (a mesma da skill analise-credito-mcmv e
 * de mcmv-estimativa.ts). Cada seguradora tem a sua; substitua pela taxa da
 * proposta sempre que tiver.
 */
export const TABELA_MIP_ESTIMADA: readonly FaixaMip[] = [
  { idadeAte: 30, taxaMensal: 0.0001 },
  { idadeAte: 40, taxaMensal: 0.00015 },
  { idadeAte: 50, taxaMensal: 0.0003 },
  { idadeAte: 60, taxaMensal: 0.0007 },
  { idadeAte: 200, taxaMensal: 0.0015 },
];

/** DFI mensal sobre o valor do imóvel — estimativa usada no CRM. */
export const DFI_MENSAL_PADRAO = 0.000038;
/** Taxa de administração mensal (R$) — padrão do CRM. */
export const TAXA_ADM_PADRAO = 25;
/** TR média mensal observada em 2026 (jan–out ≈ 0,17% a.m.). Em % ao mês. */
export const TR_MENSAL_REFERENCIA_2026 = 0.17;
/** Comprometimento máximo da renda bruta com o ENCARGO TOTAL da 1ª parcela. */
export const LIMITE_COMPROMETIMENTO_PADRAO = 0.3;
/** Idade máxima no fim do contrato: 80 anos e 6 meses (em meses). */
export const IDADE_MAXIMA_FIM_MESES = 966;

export type SeguroMip =
  | { modo: "tabela"; proponentes: Proponente[]; tabela?: readonly FaixaMip[] }
  | { modo: "taxa"; taxaMensal: number };

export interface AmortizacaoExtra {
  /** Nº da PARCELA de amortização em que o valor é abatido (depois de paga). */
  parcela: number;
  valor: number;
  modo: ModoAmortizacaoExtra;
  /** Repete a cada N parcelas (ex.: 24 para FGTS a cada 2 anos). */
  repetirACada?: number;
  /** Quantas vezes no total (com a primeira). Sem valor = até o fim. */
  vezes?: number;
}

export interface FaseObra {
  /** Duração da obra em meses (encargos de obra antes da 1ª amortização). */
  meses: number;
  /** Fração liberada na assinatura (0..1). Padrão 0. */
  liberacaoInicial?: number;
  /**
   * Fração ACUMULADA liberada ao fim de cada mês de obra (0..1), se o
   * cronograma físico-financeiro for conhecido. Sem isto: linear até 100%.
   */
  curvaLiberacao?: number[];
  /** Cobra MIP e DFI na obra. Padrão true. */
  cobrarSeguros?: boolean;
  /** Cobra taxa de administração na obra. Padrão true. */
  cobrarTaxaAdm?: boolean;
  /**
   * true (padrão): o cliente PAGA a atualização monetária na obra, e o saldo
   * chega à fase de amortização igual ao valor financiado. false: a correção
   * é incorporada (capitalizada) ao saldo.
   */
  pagarAtualizacaoMonetaria?: boolean;
}

export interface ParametrosFinanciamento {
  sistema: SistemaAmortizacao;
  valorFinanciado: number;
  /** Valor de avaliação/compra do imóvel — base do DFI. */
  valorImovel: number;
  /** Prazo de AMORTIZAÇÃO em meses (não inclui a fase de obra). */
  prazoMeses: number;
  /** Taxa de juros anual em % (ex.: 8,16). */
  taxaJurosAnual: number;
  /** Como a taxa anual foi informada. Na dúvida, o contrato Caixa traz as duas. */
  tipoTaxa: TipoTaxa;
  /**
   * Correção monetária do saldo, em % AO MÊS (ex.: 0,17 para TR). Número = taxa
   * constante; lista = série mês a mês (o último valor se repete). 0 = taxa fixa.
   */
  correcaoMensal?: number | number[];
  mip?: SeguroMip;
  /** DFI: fração mensal sobre o valor do imóvel. Padrão DFI_MENSAL_PADRAO. */
  dfiTaxaMensal?: number;
  /** Corrige a base do DFI pelo mesmo índice do saldo. Padrão true. */
  corrigirBaseDfi?: boolean;
  /** Taxa de administração mensal em R$. Padrão TAXA_ADM_PADRAO. */
  taxaAdministracao?: number;
  /** Tarifas pagas na contratação (avaliação, cadastro...) — entram no CET. */
  despesasIniciais?: number;
  faseObra?: FaseObra;
  amortizacoesExtras?: AmortizacaoExtra[];
  rendaFamiliar?: number;
  /** Padrão 0,30. */
  limiteComprometimento?: number;
  /** Mês da 1ª cobrança, "AAAA-MM" (só para rotular a planilha). */
  inicio?: string;
}

export interface LinhaPlanilha {
  /** Sequência geral de meses (obra + amortização), começando em 1. */
  mes: number;
  fase: "obra" | "amortizacao";
  /** Nº da parcela de amortização (null na obra). */
  parcela: number | null;
  /** "nov/2026" quando `inicio` foi informado. */
  competencia: string | null;
  saldoInicial: number;
  /** Fração do financiamento liberada (só na obra). */
  liberado: number | null;
  correcao: number;
  saldoCorrigido: number;
  juros: number;
  amortizacao: number;
  /** Amortização + juros (+ atualização paga, na obra). */
  prestacao: number;
  mip: number;
  dfi: number;
  taxaAdm: number;
  /** O que o cliente paga no mês: prestação + MIP + DFI + taxa adm. */
  encargoTotal: number;
  amortizacaoExtra: number;
  saldoFinal: number;
  /** Prazo restante depois deste mês (em parcelas). */
  prazoRestante: number;
}

export interface ResumoSimulacao {
  sistema: SistemaAmortizacao;
  taxaMensal: number;
  taxaNominalAnual: number;
  taxaEfetivaAnual: number;
  mesesObra: number;
  prazoContratado: number;
  /** Parcelas de amortização efetivamente pagas (cai com amortização extra). */
  parcelasPagas: number;
  /** Encargo total da 1ª parcela de amortização — é o que a Caixa compara à renda. */
  primeiraParcela: number;
  /** Só amortização + juros da 1ª parcela. */
  primeiraPrestacao: number;
  ultimaParcela: number;
  maiorParcela: number;
  menorParcela: number;
  /** Maior encargo mensal na fase de obra (0 se não houver obra). */
  maiorEncargoObra: number;
  totalEncargosObra: number;
  totalPago: number;
  totalJuros: number;
  totalCorrecao: number;
  totalMip: number;
  totalDfi: number;
  totalTaxaAdm: number;
  totalAmortizado: number;
  totalAmortizacaoExtra: number;
  /** CET estimado (inclui seguros, taxa, tarifas e a correção projetada). */
  cetMensal: number | null;
  cetAnual: number | null;
  /** primeiraParcela / renda. null sem renda. */
  comprometimento: number | null;
  /** Renda mínima para a 1ª parcela caber no limite. */
  rendaMinima: number;
  /** Valor financiado / valor do imóvel. */
  ltv: number;
}

export interface ResultadoSimulacao {
  linhas: LinhaPlanilha[];
  resumo: ResumoSimulacao;
  avisos: string[];
}

// ----------------------------------------------------------------------------
// Matemática financeira básica
// ----------------------------------------------------------------------------

/**
 * Arredonda ao centavo, meio centavo para cima (como o extrato do banco).
 * O toPrecision(15) limpa o ruído binário antes de arredondar: 66.666,68 ÷ 8
 * vale 8.333,335 exato, mas o float guarda 8.333,33499999… e o Math.round
 * puro daria 8.333,33 em vez de 8.333,34.
 */
export function centavos(v: number): number {
  if (!Number.isFinite(v)) return v;
  const x = Number((Math.abs(v) * 100).toPrecision(15));
  return (Math.sign(v) * Math.round(x)) / 100;
}

/** Taxa mensal (fração) a partir da anual em %. */
export function taxaMensalDe(taxaAnualPct: number, tipo: TipoTaxa): number {
  const a = taxaAnualPct / 100;
  return tipo === "nominal" ? a / 12 : Math.pow(1 + a, 1 / 12) - 1;
}

/** Nominal a.a. (%) → efetiva a.a. (%). Ex.: 8,16 → 8,46. */
export function nominalParaEfetiva(nominalPct: number): number {
  return (Math.pow(1 + nominalPct / 100 / 12, 12) - 1) * 100;
}

/** Efetiva a.a. (%) → nominal a.a. (%). Ex.: 8,46 → 8,16. */
export function efetivaParaNominal(efetivaPct: number): number {
  return (Math.pow(1 + efetivaPct / 100, 1 / 12) - 1) * 12 * 100;
}

/** Prestação PRICE (amortização + juros) — fórmula do sistema francês. */
export function pmt(saldo: number, taxaMensal: number, meses: number): number {
  if (saldo <= 0 || meses <= 0) return 0;
  if (taxaMensal === 0) return saldo / meses;
  return (saldo * taxaMensal) / (1 - Math.pow(1 + taxaMensal, -meses));
}

/** Nº de meses para quitar `saldo` pagando `prestacao` (PRICE). */
export function nper(saldo: number, taxaMensal: number, prestacao: number): number {
  if (saldo <= 0) return 0;
  if (taxaMensal === 0) return saldo / prestacao;
  const x = 1 - (saldo * taxaMensal) / prestacao;
  if (x <= 0) return Infinity; // a prestação não cobre nem os juros
  return -Math.log(x) / Math.log(1 + taxaMensal);
}

/** Taxa interna de retorno mensal de um fluxo (índice = mês). Bisseção. */
export function tirMensal(fluxos: number[]): number | null {
  const vpl = (r: number) => fluxos.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
  let lo = -0.5;
  let hi = 1;
  let flo = vpl(lo);
  const fhi = vpl(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const fm = vpl(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (fm * flo > 0) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

// ----------------------------------------------------------------------------
// Seguros
// ----------------------------------------------------------------------------

function taxaPorIdade(idade: number, tabela: readonly FaixaMip[]): number {
  const anos = Math.floor(idade);
  const faixa = tabela.find((f) => anos <= f.idadeAte) ?? tabela[tabela.length - 1];
  return faixa?.taxaMensal ?? 0;
}

/**
 * Taxa de MIP do mês `mes` (1 = assinatura). Cada proponente paga a taxa da SUA
 * idade naquele mês sobre a SUA fatia da cobertura — é por isso que o MIP de
 * um casal 25/45 anos não é o de "35 anos".
 */
export function taxaMipNoMes(mip: SeguroMip, mes: number): number {
  if (mip.modo === "taxa") return mip.taxaMensal;
  const tabela = mip.tabela ?? TABELA_MIP_ESTIMADA;
  const soma = mip.proponentes.reduce((s, p) => s + p.participacao, 0) || 1;
  const anosDecorridos = (mes - 1) / 12;
  return mip.proponentes.reduce(
    (s, p) => s + (p.participacao / soma) * taxaPorIdade(p.idade + anosDecorridos, tabela),
    0,
  );
}

// ----------------------------------------------------------------------------
// Utilidades internas
// ----------------------------------------------------------------------------

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export function competencia(inicio: string | undefined, mes: number): string | null {
  if (!inicio) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(inicio);
  if (!m) return null;
  const base = Number(m[1]) * 12 + (Number(m[2]) - 1) + (mes - 1);
  return `${MESES_CURTOS[base % 12]}/${Math.floor(base / 12)}`;
}

function correcaoDoMes(correcao: number | number[] | undefined, mes: number): number {
  if (correcao == null) return 0;
  if (typeof correcao === "number") return correcao / 100;
  if (correcao.length === 0) return 0;
  return (correcao[Math.min(mes - 1, correcao.length - 1)] ?? 0) / 100;
}

/** Expande as amortizações recorrentes em um mapa parcela → lista de eventos. */
function expandirExtras(
  extras: AmortizacaoExtra[] | undefined,
  prazo: number,
): Map<number, { valor: number; modo: ModoAmortizacaoExtra }[]> {
  const mapa = new Map<number, { valor: number; modo: ModoAmortizacaoExtra }[]>();
  for (const e of extras ?? []) {
    if (!(e.valor > 0) || !(e.parcela >= 1)) continue;
    const passo = e.repetirACada && e.repetirACada > 0 ? e.repetirACada : 0;
    const vezes = passo ? (e.vezes ?? Infinity) : 1;
    for (let k = 0, p = e.parcela; k < vezes && p <= prazo; k++, p += passo || prazo + 1) {
      const lista = mapa.get(p) ?? [];
      lista.push({ valor: e.valor, modo: e.modo });
      mapa.set(p, lista);
    }
  }
  return mapa;
}

function fracaoLiberada(obra: FaseObra, mesObra: number): number {
  if (obra.curvaLiberacao && obra.curvaLiberacao.length > 0) {
    const v = obra.curvaLiberacao[Math.min(mesObra - 1, obra.curvaLiberacao.length - 1)] ?? 1;
    return Math.min(1, Math.max(0, v));
  }
  const ini = Math.min(1, Math.max(0, obra.liberacaoInicial ?? 0));
  return ini + (1 - ini) * (mesObra / obra.meses);
}

// ----------------------------------------------------------------------------
// O motor
// ----------------------------------------------------------------------------

export function simularFinanciamento(p: ParametrosFinanciamento): ResultadoSimulacao {
  const avisos: string[] = [];
  const i = taxaMensalDe(p.taxaJurosAnual, p.tipoTaxa);
  const dfiTaxa = p.dfiTaxaMensal ?? DFI_MENSAL_PADRAO;
  const taxaAdmBase = p.taxaAdministracao ?? TAXA_ADM_PADRAO;
  const corrigirDfi = p.corrigirBaseDfi ?? true;
  const limite = p.limiteComprometimento ?? LIMITE_COMPROMETIMENTO_PADRAO;
  const mip: SeguroMip = p.mip ?? {
    modo: "tabela",
    proponentes: [{ idade: 30, participacao: 1 }],
  };
  const prazo = Math.max(0, Math.round(p.prazoMeses));
  const valorFinanciado = centavos(Math.max(0, p.valorFinanciado));

  if (p.valorImovel > 0 && valorFinanciado > p.valorImovel) {
    avisos.push("O valor financiado é maior que o valor do imóvel.");
  }
  if (mip.modo === "tabela") {
    const soma = mip.proponentes.reduce((s, x) => s + x.participacao, 0);
    if (Math.abs(soma - 1) > 0.001) {
      avisos.push(
        `A participação dos proponentes soma ${(soma * 100).toFixed(0)}%; foi normalizada para 100%.`,
      );
    }
  }

  const linhas: LinhaPlanilha[] = [];
  let mes = 0;
  let fatorIndice = 1; // índice acumulado (corrige a base do DFI)
  let saldo = valorFinanciado;

  // ---------------------------- Fase de obra ----------------------------
  const obra = p.faseObra && p.faseObra.meses > 0 ? p.faseObra : null;
  if (obra) {
    const pagaCorrecao = obra.pagarAtualizacaoMonetaria ?? true;
    const comSeguros = obra.cobrarSeguros ?? true;
    const comTaxa = obra.cobrarTaxaAdm ?? true;
    let capitalizado = 0; // correção incorporada (só se não for paga)
    for (let o = 1; o <= obra.meses; o++) {
      mes++;
      const tr = correcaoDoMes(p.correcaoMensal, mes);
      fatorIndice *= 1 + tr;
      const fracao = fracaoLiberada(obra, o);
      const liberado = centavos(valorFinanciado * fracao + capitalizado);
      const correcao = centavos(liberado * tr);
      if (!pagaCorrecao) capitalizado = centavos(capitalizado + correcao);
      const saldoCorrigido = centavos(liberado + correcao);
      const juros = centavos(saldoCorrigido * i);
      const mipV = comSeguros ? centavos(saldoCorrigido * taxaMipNoMes(mip, mes)) : 0;
      const dfiV = comSeguros
        ? centavos(p.valorImovel * (corrigirDfi ? fatorIndice : 1) * dfiTaxa)
        : 0;
      const taxaAdm = comTaxa ? taxaAdmBase : 0;
      const prestacao = centavos(juros + (pagaCorrecao ? correcao : 0));
      linhas.push({
        mes,
        fase: "obra",
        parcela: null,
        competencia: competencia(p.inicio, mes),
        saldoInicial: liberado,
        liberado: fracao,
        correcao,
        saldoCorrigido,
        juros,
        amortizacao: 0,
        prestacao,
        mip: mipV,
        dfi: dfiV,
        taxaAdm,
        encargoTotal: centavos(prestacao + mipV + dfiV + taxaAdm),
        amortizacaoExtra: 0,
        saldoFinal: pagaCorrecao ? liberado : saldoCorrigido,
        prazoRestante: prazo,
      });
    }
    saldo = centavos(valorFinanciado + capitalizado);
  }

  // ------------------------- Fase de amortização -------------------------
  const extras = expandirExtras(p.amortizacoesExtras, prazo);
  let prazoRestante = prazo; // inclui o mês corrente
  let parcela = 0;
  while (saldo > 0.004 && prazoRestante > 0) {
    mes++;
    parcela++;
    const tr = correcaoDoMes(p.correcaoMensal, mes);
    fatorIndice *= 1 + tr;
    const saldoInicial = saldo;
    const correcao = centavos(saldoInicial * tr);
    const saldoCorrigido = centavos(saldoInicial + correcao);
    const juros = centavos(saldoCorrigido * i);

    let amortizacao: number;
    let prestacaoAlvo: number; // usada para "reduzir prazo" no PRICE
    if (prazoRestante === 1) {
      amortizacao = saldoCorrigido; // última parcela zera o saldo
      prestacaoAlvo = centavos(amortizacao + juros);
    } else if (p.sistema === "SAC") {
      amortizacao = centavos(saldoCorrigido / prazoRestante);
      prestacaoAlvo = centavos(amortizacao + juros);
    } else {
      prestacaoAlvo = centavos(pmt(saldoCorrigido, i, prazoRestante));
      amortizacao = centavos(prestacaoAlvo - juros);
    }
    amortizacao = Math.min(Math.max(0, amortizacao), saldoCorrigido);
    const prestacao = centavos(amortizacao + juros);

    const mipV = centavos(saldoCorrigido * taxaMipNoMes(mip, mes));
    const dfiV = centavos(p.valorImovel * (corrigirDfi ? fatorIndice : 1) * dfiTaxa);
    const encargoTotal = centavos(prestacao + mipV + dfiV + taxaAdmBase);

    let saldoFinal = centavos(saldoCorrigido - amortizacao);
    let novoPrazo = prazoRestante - 1;

    // Amortização extraordinária, depois da parcela paga.
    let extraTotal = 0;
    for (const ev of extras.get(parcela) ?? []) {
      if (saldoFinal <= 0) break;
      const valor = centavos(Math.min(ev.valor, saldoFinal));
      extraTotal = centavos(extraTotal + valor);
      saldoFinal = centavos(saldoFinal - valor);
      if (saldoFinal <= 0) {
        novoPrazo = 0;
        break;
      }
      if (ev.modo === "reduzir_prazo") {
        // Mantém o "tamanho" da parcela e recalcula quantos meses faltam.
        const n =
          p.sistema === "SAC"
            ? saldoFinal / Math.max(amortizacao, 0.01)
            : nper(saldoFinal, i, prestacaoAlvo);
        novoPrazo = Math.max(1, Math.min(novoPrazo, Math.ceil(n - 1e-9)));
      }
      // reduzir_parcela: mantém o prazo; a próxima parcela é recalculada sobre
      // o saldo menor (SAC: amortização menor; PRICE: nova prestação).
    }

    linhas.push({
      mes,
      fase: "amortizacao",
      parcela,
      competencia: competencia(p.inicio, mes),
      saldoInicial,
      liberado: null,
      correcao,
      saldoCorrigido,
      juros,
      amortizacao,
      prestacao,
      mip: mipV,
      dfi: dfiV,
      taxaAdm: taxaAdmBase,
      encargoTotal,
      amortizacaoExtra: extraTotal,
      saldoFinal,
      prazoRestante: novoPrazo,
    });

    saldo = saldoFinal;
    prazoRestante = novoPrazo;
  }

  // ------------------------------ Resumo ------------------------------
  const am = linhas.filter((l) => l.fase === "amortizacao");
  const ob = linhas.filter((l) => l.fase === "obra");
  const soma = (arr: LinhaPlanilha[], k: keyof LinhaPlanilha) =>
    centavos(arr.reduce((s, l) => s + (l[k] as number), 0));

  const primeira = am[0];
  const primeiraParcela = primeira?.encargoTotal ?? 0;
  const encargos = am.map((l) => l.encargoTotal);
  const totalPago = centavos(soma(linhas, "encargoTotal") + soma(linhas, "amortizacaoExtra"));

  // CET: o cliente recebe o crédito (menos tarifas) no mês 0 e paga cada
  // encargo e cada amortização extra no mês em que acontece.
  const fluxos = [valorFinanciado - (p.despesasIniciais ?? 0)];
  for (const l of linhas) fluxos.push(-(l.encargoTotal + l.amortizacaoExtra));
  const cetMensal = valorFinanciado > 0 && linhas.length > 0 ? tirMensal(fluxos) : null;

  const renda = p.rendaFamiliar && p.rendaFamiliar > 0 ? p.rendaFamiliar : null;
  const comprometimento = renda ? primeiraParcela / renda : null;

  if (comprometimento != null && comprometimento > limite) {
    avisos.push(
      `A 1ª parcela compromete ${(comprometimento * 100).toFixed(1)}% da renda (limite ${(limite * 100).toFixed(0)}%).`,
    );
  }
  if (mip.modo === "tabela") {
    const maisVelho = Math.max(...mip.proponentes.map((x) => x.idade));
    const fimMeses = maisVelho * 12 + (obra?.meses ?? 0) + prazo;
    if (fimMeses > IDADE_MAXIMA_FIM_MESES) {
      const maxPrazo = Math.max(
        0,
        Math.floor(IDADE_MAXIMA_FIM_MESES - maisVelho * 12 - (obra?.meses ?? 0)),
      );
      avisos.push(
        `Idade + prazo passa de 80 anos e 6 meses. Prazo máximo para o proponente mais velho: ${maxPrazo} meses.`,
      );
    }
  }
  if (p.sistema === "PRICE" && primeira && primeira.amortizacao <= 0) {
    avisos.push("A prestação não cobre os juros: o saldo não cai (amortização negativa).");
  }

  const resumo: ResumoSimulacao = {
    sistema: p.sistema,
    taxaMensal: i,
    taxaNominalAnual: i * 12 * 100,
    taxaEfetivaAnual: (Math.pow(1 + i, 12) - 1) * 100,
    mesesObra: ob.length,
    prazoContratado: prazo,
    parcelasPagas: am.length,
    primeiraParcela,
    primeiraPrestacao: primeira?.prestacao ?? 0,
    ultimaParcela: am[am.length - 1]?.encargoTotal ?? 0,
    maiorParcela: encargos.length ? Math.max(...encargos) : 0,
    menorParcela: encargos.length ? Math.min(...encargos) : 0,
    maiorEncargoObra: ob.length ? Math.max(...ob.map((l) => l.encargoTotal)) : 0,
    totalEncargosObra: soma(ob, "encargoTotal"),
    totalPago,
    totalJuros: soma(linhas, "juros"),
    totalCorrecao: soma(linhas, "correcao"),
    totalMip: soma(linhas, "mip"),
    totalDfi: soma(linhas, "dfi"),
    totalTaxaAdm: soma(linhas, "taxaAdm"),
    totalAmortizado: centavos(soma(am, "amortizacao") + soma(am, "amortizacaoExtra")),
    totalAmortizacaoExtra: soma(am, "amortizacaoExtra"),
    cetMensal,
    cetAnual: cetMensal == null ? null : (Math.pow(1 + cetMensal, 12) - 1) * 100,
    comprometimento,
    rendaMinima: limite > 0 ? centavos(primeiraParcela / limite) : 0,
    ltv: p.valorImovel > 0 ? valorFinanciado / p.valorImovel : 0,
  };

  return { linhas, resumo, avisos };
}

/** Roda SAC e PRICE com os mesmos parâmetros. */
export function compararSistemas(p: Omit<ParametrosFinanciamento, "sistema">) {
  return {
    SAC: simularFinanciamento({ ...p, sistema: "SAC" }),
    PRICE: simularFinanciamento({ ...p, sistema: "PRICE" }),
  };
}

/**
 * Maior valor financiável cuja 1ª parcela (encargo total) cabe em
 * renda × limite. Busca binária: a 1ª parcela cresce com o valor financiado.
 */
export function valorMaximoFinanciavel(
  p: Omit<ParametrosFinanciamento, "valorFinanciado" | "amortizacoesExtras">,
  renda: number,
): number {
  const limite = p.limiteComprometimento ?? LIMITE_COMPROMETIMENTO_PADRAO;
  const teto = renda * limite;
  const primeira = (v: number) =>
    simularFinanciamento({
      ...p,
      valorFinanciado: v,
      faseObra: undefined,
      rendaFamiliar: undefined,
    }).resumo.primeiraParcela;
  if (renda <= 0 || primeira(0.01) > teto) return 0;
  let lo = 0;
  let hi = 10_000_000;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (primeira(mid) <= teto) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / 100) * 100;
}
