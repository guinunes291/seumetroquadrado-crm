// Aprovação de crédito com DADOS: o que o banco aprovou para o cliente, em
// campos próprios (migration 20260927120000), e o ENCAIXE dessa aprovação nos
// produtos do catálogo.
//
// Tudo aqui é PURO (sem banco, sem React) — testável e reusado por três
// consumidores: o card do lead (produtos que encaixam), o dialog de aprovação
// (validação/normalização) e o relatório de aprovados (filtro "cabe no
// produto novo").
//
// A regra do encaixe é a MESMA do motor de orçamento (lib/orcamento.ts,
// avaliarAderencia) — só que alimentada pelo valor APROVADO em vez da tabela
// APROVE estimada pela renda:
//   • o banco financia o MENOR entre o valor aprovado e 80% do imóvel;
//   • FGTS + subsídio + entrada abatem o restante;
//   • o que sobra o cliente parcela com a construtora — até 20% cabe, até 25%
//     é "cabe com esforço" (cenário otimista que o Mapa de Mercado já usa),
//     acima disso não cabe.
//
// PREÇO DA CONTA: sempre o "a partir de" do empreendimento no catálogo
// (decisão do dono, 2026-09-23). O "valor do imóvel" que vem na carta do banco
// NÃO é o imóvel do cliente: o analista simula no TETO DA FAIXA MCMV (ex.:
// R$ 275 mil na F2). Por isso ele fica guardado só como referência
// (valor_imovel_simulacao) e nunca limita nem entra na conta do encaixe.

import { consultarLinhaAprove, TETO_PARCELAMENTO_CONSTRUTORA } from "@/lib/orcamento";
import { parseValorBR } from "@/lib/simulador";

/** Parcelamento com a construtora aceito no cenário "com esforço". */
export const TETO_PARCELAMENTO_ESFORCO = 0.25;
/** Tolerância de arredondamento (0,5 ponto %), a mesma do avaliarAderencia. */
const TOLERANCIA = 0.005;

export type Modalidade = "mcmv" | "sbpe" | "pro_cotista" | "outro";
export type SistemaAmortizacao = "price" | "sac";

export const MODALIDADE_LABEL: Record<Modalidade, string> = {
  mcmv: "Minha Casa Minha Vida",
  sbpe: "SBPE",
  pro_cotista: "Pró-Cotista",
  outro: "Outro",
};

/** Os dados que a carta de aprovação traz — todos opcionais no banco. */
export type DadosAprovacao = {
  banco: string | null;
  modalidade: Modalidade | null;
  sistema_amortizacao: SistemaAmortizacao | null;
  valor_financiamento: number | null;
  valor_parcela: number | null;
  prazo_meses: number | null;
  taxa_juros_anual: number | null;
  valor_fgts: number | null;
  valor_subsidio: number | null;
  valor_entrada: number | null;
  /**
   * "Valor do imóvel" da carta: o analista simula no teto da faixa, não no
   * imóvel do cliente. Só referência — não limita o encaixe.
   */
  valor_imovel_simulacao: number | null;
  renda_familiar: number | null;
  faixa_mcmv: "1" | "2" | "3" | "4" | null;
  qtd_participantes: number | null;
  cotista_fgts: boolean | null;
  possui_dependente: boolean | null;
  data_aprovacao: string | null;
  validade_ate: string | null;
};

export const DADOS_APROVACAO_VAZIOS: DadosAprovacao = {
  banco: null,
  modalidade: null,
  sistema_amortizacao: null,
  valor_financiamento: null,
  valor_parcela: null,
  prazo_meses: null,
  taxa_juros_anual: null,
  valor_fgts: null,
  valor_subsidio: null,
  valor_entrada: null,
  valor_imovel_simulacao: null,
  renda_familiar: null,
  faixa_mcmv: null,
  qtd_participantes: null,
  cotista_fgts: null,
  possui_dependente: null,
  data_aprovacao: null,
  validade_ate: null,
};

/** A aprovação tem o mínimo para calcular encaixe (valor financiado). */
export function temDadosDeAprovacao(
  d: Pick<DadosAprovacao, "valor_financiamento"> | null | undefined,
): boolean {
  return d?.valor_financiamento != null && d.valor_financiamento > 0;
}

/**
 * Valida o que o corretor vai gravar. Financiamento e parcela são
 * OBRIGATÓRIOS: são o coração do relatório ("aprovados entre X e Y") e do
 * encaixe — uma aprovação sem eles é só um status, e isso o fluxo antigo já
 * fazia. Devolve a lista de erros (vazia = ok).
 */
export function validarDadosAprovacao(d: DadosAprovacao): string[] {
  const erros: string[] = [];
  if (!d.valor_financiamento || d.valor_financiamento <= 0) {
    erros.push("Informe o valor de financiamento aprovado.");
  }
  if (!d.valor_parcela || d.valor_parcela <= 0) {
    erros.push("Informe o valor da parcela aprovada.");
  }
  if (d.valor_financiamento && d.valor_parcela && d.valor_parcela >= d.valor_financiamento) {
    erros.push("A parcela não pode ser maior que o financiamento — confira os valores.");
  }
  if (d.prazo_meses != null && (d.prazo_meses < 1 || d.prazo_meses > 480)) {
    erros.push("Prazo deve estar entre 1 e 480 meses.");
  }
  if (d.taxa_juros_anual != null && (d.taxa_juros_anual < 0 || d.taxa_juros_anual > 100)) {
    erros.push("Taxa de juros deve estar em % ao ano (ex.: 7,66).");
  }
  if (d.data_aprovacao && d.validade_ate && d.validade_ate < d.data_aprovacao) {
    erros.push("A validade não pode ser anterior à data da aprovação.");
  }
  return erros;
}

/** Recursos do cliente fora o financiamento: FGTS + subsídio + entrada. */
export function recursosProprios(d: DadosAprovacao): number {
  return (d.valor_fgts ?? 0) + (d.valor_subsidio ?? 0) + (d.valor_entrada ?? 0);
}

/** Poder de compra = financiamento + FGTS + subsídio + entrada (igual à coluna gerada). */
export function poderDeCompra(d: DadosAprovacao): number {
  return (d.valor_financiamento ?? 0) + recursosProprios(d);
}

/**
 * Maior preço de imóvel que "cabe" (construtora ≤ 20%). Derivação: com o
 * financiamento limitado a 80% do imóvel, preço − min(F, 0,8·P) − R ≤ 0,2·P
 * vale para todo P ≤ (F + R) / 0,8. NÃO é limitado pelo valor do imóvel da
 * carta: aquele é o teto da faixa usado na simulação, não um limite do cliente.
 */
export function tetoDeImovel(d: DadosAprovacao): number {
  return Math.round(poderDeCompra(d) / (1 - TETO_PARCELAMENTO_CONSTRUTORA));
}

/**
 * Faixa MCMV pela renda familiar (tabela APROVE 2026, degrau igual ou
 * inferior). O retorno da Caixa (Simulador – Detalhamento) não traz a faixa;
 * a renda sim. Acima da F4 (SBPE/R2V) ou abaixo da tabela → null.
 */
export function faixaPelaRenda(renda: number | null): DadosAprovacao["faixa_mcmv"] {
  if (!renda || renda <= 0) return null;
  const linha = consultarLinhaAprove(renda);
  if (!linha || linha.faixa < 1 || linha.faixa > 4) return null;
  return String(linha.faixa) as DadosAprovacao["faixa_mcmv"];
}

/**
 * Defesa contra a armadilha do simulador da Caixa: lá, "Valor de entrada" é a
 * DIFERENÇA imóvel − financiamento (o que falta cobrir), não dinheiro do
 * cliente. Se a leitura trouxer uma entrada que bate com essa diferença
 * (±R$ 5), ela é descartada — senão o poder de compra infla até o valor do
 * imóvel e todo produto "cabe". Pura; usada na saída da IA.
 */
export function sanearEntradaDoSimulador(d: DadosAprovacao): DadosAprovacao {
  const { valor_entrada: e, valor_imovel_simulacao: im, valor_financiamento: f } = d;
  if (e != null && im != null && f != null && Math.abs(im - f - e) <= 5) {
    return { ...d, valor_entrada: null };
  }
  return d;
}

/** Aprovação vencida (validade anterior a hoje). `hoje` em AAAA-MM-DD. */
export function aprovacaoVencida(validadeAte: string | null, hoje: string): boolean {
  return !!validadeAte && validadeAte < hoje;
}

// ---------------------------------------------------------------------------
// Encaixe em produto
// ---------------------------------------------------------------------------

export type NivelEncaixe = "cabe" | "esforco" | "nao_cabe";

export type EncaixeImovel = {
  nivel: NivelEncaixe;
  /** Financiamento que efetivamente entra (≤ aprovado e ≤ 80% do imóvel). */
  financiamentoAplicado: number;
  /** O que o cliente parcela direto com a construtora (ato + mensais + chaves). */
  saldoConstrutora: number;
  /** saldoConstrutora / preço, em % com 1 casa. */
  percentualConstrutora: number;
  /** Motivos em PT-BR quando não é "cabe" limpo — vão direto para a tela. */
  alertas: string[];
};

/**
 * Encaixe de UM imóvel (preço) na aprovação. `rendaMinima` é a do
 * empreendimento, quando cadastrada: renda aprovada abaixo dela rebaixa
 * "cabe" para "esforço" (a construtora pode barrar na análise interna).
 */
export function avaliarEncaixe(
  preco: number,
  d: DadosAprovacao,
  opts: { rendaMinima?: number | null } = {},
): EncaixeImovel {
  const alertas: string[] = [];
  const fatorFinanciamento = 1 - TETO_PARCELAMENTO_CONSTRUTORA; // 0,80
  const financiamentoAplicado = Math.min(d.valor_financiamento ?? 0, fatorFinanciamento * preco);
  const saldo = Math.max(0, preco - financiamentoAplicado - recursosProprios(d));
  const pct = preco > 0 ? saldo / preco : 1;

  let nivel: NivelEncaixe =
    pct <= TETO_PARCELAMENTO_CONSTRUTORA + TOLERANCIA
      ? "cabe"
      : pct <= TETO_PARCELAMENTO_ESFORCO + TOLERANCIA
        ? "esforco"
        : "nao_cabe";

  if (nivel === "esforco") {
    alertas.push("Parcelamento com a construtora acima de 20% — depende de condição comercial.");
  }
  if (nivel === "nao_cabe") {
    alertas.push(
      `Construtora teria de parcelar ${(pct * 100).toFixed(0)}% do imóvel (limite 25%).`,
    );
  }

  if (
    nivel === "cabe" &&
    opts.rendaMinima &&
    d.renda_familiar &&
    d.renda_familiar < opts.rendaMinima
  ) {
    nivel = "esforco";
    alertas.push("Renda aprovada abaixo da renda mínima pedida pelo empreendimento.");
  }

  return {
    nivel,
    financiamentoAplicado: Math.round(financiamentoAplicado),
    saldoConstrutora: Math.round(saldo),
    percentualConstrutora: Math.round(pct * 1000) / 10,
    alertas,
  };
}

export type ProdutoCandidato = {
  id: string;
  nome: string;
  construtora: string | null;
  bairro: string | null;
  cidade: string | null;
  /** "A partir de" do empreendimento — o ÚNICO preço usado na conta. */
  preco_a_partir: number | null;
  renda_minima: number | null;
};

export type ProdutoEncaixado = {
  produto: ProdutoCandidato;
  /** Preço usado na conta: o "a partir de" do catálogo. */
  precoReferencia: number;
  encaixe: EncaixeImovel;
};

const ORDEM_NIVEL: Record<NivelEncaixe, number> = { cabe: 0, esforco: 1, nao_cabe: 2 };

/**
 * Encaixe de UM empreendimento, sempre pelo "a partir de" cadastrado no
 * catálogo. Sem preço (sob consulta) → null: fica fora da conta.
 */
export function encaixarProduto(p: ProdutoCandidato, d: DadosAprovacao): ProdutoEncaixado | null {
  if (!p.preco_a_partir || p.preco_a_partir <= 0) return null;
  return {
    produto: p,
    precoReferencia: p.preco_a_partir,
    encaixe: avaliarEncaixe(p.preco_a_partir, d, { rendaMinima: p.renda_minima }),
  };
}

/**
 * Ranqueia o catálogo para a aprovação: "cabe" primeiro, depois "com
 * esforço"; dentro de cada grupo, o imóvel MAIS CARO primeiro — o objetivo é
 * mostrar o melhor produto que o crédito do cliente compra, não o mais
 * barato (esse o corretor acha sozinho). "Não cabe" fica de fora da lista e
 * só entra na contagem.
 */
export function rankearProdutos(
  produtos: ProdutoCandidato[],
  d: DadosAprovacao,
  limite = 6,
): {
  sugestoes: ProdutoEncaixado[];
  totalCabe: number;
  totalEsforco: number;
  totalAvaliados: number;
} {
  const avaliados = produtos
    .map((p) => encaixarProduto(p, d))
    .filter((x): x is ProdutoEncaixado => x !== null);
  const aproveitaveis = avaliados
    .filter((x) => x.encaixe.nivel !== "nao_cabe")
    .sort(
      (a, b) =>
        ORDEM_NIVEL[a.encaixe.nivel] - ORDEM_NIVEL[b.encaixe.nivel] ||
        b.precoReferencia - a.precoReferencia,
    );
  return {
    sugestoes: aproveitaveis.slice(0, limite),
    totalCabe: avaliados.filter((x) => x.encaixe.nivel === "cabe").length,
    totalEsforco: avaliados.filter((x) => x.encaixe.nivel === "esforco").length,
    totalAvaliados: avaliados.length,
  };
}

// ---------------------------------------------------------------------------
// Formulário ⇄ dados
// ---------------------------------------------------------------------------

/** Estado do formulário: tudo string (inputs), convertido em `formParaDados`. */
export type FormAprovacao = Record<
  | "banco"
  | "valor_financiamento"
  | "valor_parcela"
  | "prazo_meses"
  | "taxa_juros_anual"
  | "valor_fgts"
  | "valor_subsidio"
  | "valor_entrada"
  | "valor_imovel_simulacao"
  | "renda_familiar"
  | "qtd_participantes"
  | "data_aprovacao"
  | "validade_ate",
  string
> & {
  modalidade: Modalidade | "";
  sistema_amortizacao: SistemaAmortizacao | "";
  faixa_mcmv: "1" | "2" | "3" | "4" | "";
  cotista_fgts: boolean;
  possui_dependente: boolean;
};

const num = (s: string): number | null => {
  const n = parseValorBR(s);
  return n == null || n < 0 ? null : n;
};
const int = (s: string): number | null => {
  const n = num(s);
  return n == null ? null : Math.round(n);
};
const data = (s: string): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export function formParaDados(f: FormAprovacao): DadosAprovacao {
  return {
    banco: f.banco.trim() || null,
    modalidade: f.modalidade || null,
    sistema_amortizacao: f.sistema_amortizacao || null,
    valor_financiamento: num(f.valor_financiamento),
    valor_parcela: num(f.valor_parcela),
    prazo_meses: int(f.prazo_meses),
    taxa_juros_anual: num(f.taxa_juros_anual),
    valor_fgts: num(f.valor_fgts),
    valor_subsidio: num(f.valor_subsidio),
    valor_entrada: num(f.valor_entrada),
    valor_imovel_simulacao: num(f.valor_imovel_simulacao),
    renda_familiar: num(f.renda_familiar),
    faixa_mcmv: f.faixa_mcmv || null,
    qtd_participantes: int(f.qtd_participantes),
    cotista_fgts: f.cotista_fgts,
    possui_dependente: f.possui_dependente,
    data_aprovacao: data(f.data_aprovacao),
    validade_ate: data(f.validade_ate),
  };
}

/** Número → texto do input em pt-BR ("185000.5" → "185.000,50"). */
const txt = (n: number | null, casas = 2): string =>
  n == null
    ? ""
    : n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });

export function dadosParaForm(d: Partial<DadosAprovacao>): FormAprovacao {
  const x = { ...DADOS_APROVACAO_VAZIOS, ...d };
  return {
    banco: x.banco ?? "",
    modalidade: x.modalidade ?? "",
    sistema_amortizacao: x.sistema_amortizacao ?? "",
    valor_financiamento: txt(x.valor_financiamento),
    valor_parcela: txt(x.valor_parcela),
    prazo_meses: x.prazo_meses == null ? "" : String(x.prazo_meses),
    taxa_juros_anual: txt(x.taxa_juros_anual, 3),
    valor_fgts: txt(x.valor_fgts),
    valor_subsidio: txt(x.valor_subsidio),
    valor_entrada: txt(x.valor_entrada),
    valor_imovel_simulacao: txt(x.valor_imovel_simulacao),
    renda_familiar: txt(x.renda_familiar),
    faixa_mcmv: x.faixa_mcmv ?? "",
    qtd_participantes: x.qtd_participantes == null ? "" : String(x.qtd_participantes),
    cotista_fgts: x.cotista_fgts ?? false,
    possui_dependente: x.possui_dependente ?? false,
    data_aprovacao: x.data_aprovacao ?? "",
    validade_ate: x.validade_ate ?? "",
  };
}

/**
 * Mescla o que a IA leu por cima do formulário: só preenche campo VAZIO —
 * o que o corretor já digitou nunca é sobrescrito pela leitura automática.
 */
export function mesclarExtracao(
  atual: FormAprovacao,
  lido: Partial<DadosAprovacao>,
): FormAprovacao {
  const doLido = dadosParaForm(lido);
  const out = { ...atual };
  for (const k of Object.keys(doLido) as (keyof FormAprovacao)[]) {
    const vAtual = atual[k];
    const vLido = doLido[k];
    if (typeof vAtual === "boolean") {
      if (!vAtual && vLido === true) (out as Record<string, unknown>)[k] = true;
    } else if (!vAtual && vLido) {
      (out as Record<string, unknown>)[k] = vLido;
    }
  }
  return out;
}

const brl0 = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Linha única para a timeline e para cópia rápida. */
export function resumoAprovacao(d: DadosAprovacao): string {
  const partes = [
    d.banco ? d.banco : null,
    d.valor_financiamento != null ? `financiamento ${brl0(d.valor_financiamento)}` : null,
    d.valor_parcela != null ? `parcela ${brl0(d.valor_parcela)}` : null,
    d.prazo_meses != null ? `${d.prazo_meses} meses` : null,
    d.valor_fgts ? `FGTS ${brl0(d.valor_fgts)}` : null,
    d.valor_subsidio ? `subsídio ${brl0(d.valor_subsidio)}` : null,
    d.valor_entrada ? `entrada ${brl0(d.valor_entrada)}` : null,
    d.faixa_mcmv ? `Faixa ${d.faixa_mcmv}` : null,
  ].filter(Boolean);
  const poder = poderDeCompra(d);
  return `${partes.join(" · ")}${poder > 0 ? ` — poder de compra ${brl0(poder)}` : ""}`;
}
