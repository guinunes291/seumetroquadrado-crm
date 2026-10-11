// Estado da tela de Simuladores e as conversões puras entre o que o corretor
// digita e o que o motor (lib/simuladores/fluxo) recebe — mais os textos de
// saída (WhatsApp, Excel). Sem React de propósito: a tela só renderiza; as
// regras de conversão ficam testáveis (tests/simuladores-estado.test.ts).

import {
  competenciaAtual,
  rotuloMes,
  simularFluxo,
  somarMeses,
  type EntradaFluxo,
  type ModoFluxo,
  type ParcelaFluxo,
  type RegrasFluxo,
  type ResultadoFluxo,
} from "@/lib/simuladores/fluxo";

export interface FormFluxo {
  projetoId: string | null;
  unidadeId: string | null;
  /** "Apto 101 · Bloco A" — vai no resumo do WhatsApp. */
  rotuloUnidade: string;
  valorImovel: number;
  /** YYYY-MM ou "" (sem previsão). */
  entrega: string;
  /** Mês do ato (YYYY-MM). Padrão: o mês corrente. */
  hoje: string;
  /** YYYY-MM ou "" (automático: entrega − regra). */
  ultimaMensal: string;
  renda: number;
  tem36: boolean;
  temDependente: boolean;
  financiamento: number;
  subsidio: number;
  fgts: number;
  parcelaBanco: number;
  modo: ModoFluxo;
  ato: number;
  chaves: number;
  mensalFixa: number;
  intermediariaValor: number;
  posChavesParcelas: number;
}

/** O que um link (dossiê, ?valor=...) pode trazer já preenchido. */
export type PrefillFluxo = {
  valor?: number;
  renda?: number;
  financiamento?: number;
  subsidio?: number;
  fgts?: number;
  parcela?: number;
};

export function formInicial(prefill?: PrefillFluxo, hoje: string = competenciaAtual()): FormFluxo {
  return {
    projetoId: null,
    unidadeId: null,
    rotuloUnidade: "",
    valorImovel: prefill?.valor ?? 0,
    entrega: "",
    hoje,
    ultimaMensal: "",
    renda: prefill?.renda ?? 0,
    tem36: false,
    temDependente: false,
    financiamento: prefill?.financiamento ?? 0,
    subsidio: prefill?.subsidio ?? 0,
    fgts: prefill?.fgts ?? 0,
    parcelaBanco: prefill?.parcela ?? 0,
    modo: "fechar_nas_mensais",
    ato: 0,
    chaves: 0,
    mensalFixa: 0,
    intermediariaValor: 0,
    posChavesParcelas: 0,
  };
}

/**
 * Trocar de construtora troca o produto: projeto, unidade e datas são dela.
 * O que é do CLIENTE (renda, banco, FGTS) e a negociação (ato, chaves) ficam —
 * é assim que o corretor compara o mesmo cliente em duas construtoras.
 */
export function formParaOutraConstrutora(f: FormFluxo): FormFluxo {
  return {
    ...f,
    projetoId: null,
    unidadeId: null,
    rotuloUnidade: "",
    entrega: "",
    ultimaMensal: "",
  };
}

export function entradaDoForm(f: FormFluxo, regras: RegrasFluxo): EntradaFluxo {
  return {
    hoje: f.hoje || competenciaAtual(),
    entrega: f.entrega,
    ultimaMensal: f.ultimaMensal || null,
    valorImovel: f.valorImovel,
    financiamento: f.financiamento,
    subsidio: f.subsidio,
    fgts: f.fgts,
    ato: f.ato,
    intermediariaValor: regras.intermediarias === "nenhuma" ? 0 : f.intermediariaValor,
    chaves: f.chaves,
    posChavesParcelas: regras.posChavesPermitido ? f.posChavesParcelas : 0,
    modo: f.modo,
    mensalFixa: f.mensalFixa,
    renda: f.renda,
    parcelaBanco: f.parcelaBanco,
    regras,
  };
}

// ----------------------------------------------------------------------------
// "Quanto custa esperar"
// ----------------------------------------------------------------------------

export interface CenarioEspera {
  hoje: string;
  mensais: number;
  mensal: number;
  chaves: number;
  /** Diferença da mensal (ou das chaves, no modo mensal fixa) para o 1º cenário. */
  diferenca: number;
}

/** O mesmo fluxo assinado neste mês e nos próximos `meses − 1`. */
export function cenariosDeEspera(e: EntradaFluxo, meses = 4): CenarioEspera[] {
  const out: CenarioEspera[] = [];
  for (let k = 0; k < meses; k++) {
    const r = simularFluxo({ ...e, hoje: somarMeses(e.hoje, k) });
    if (!r.valido) break;
    const ref = e.modo === "mensal_fixa" ? r.chaves.valor : r.mensais.valor;
    const ref0 = out.length === 0 ? ref : e.modo === "mensal_fixa" ? out[0].chaves : out[0].mensal;
    out.push({
      hoje: somarMeses(e.hoje, k),
      mensais: r.mensais.quantidade,
      mensal: r.mensais.valor,
      chaves: r.chaves.valor,
      diferenca: Math.round((ref - ref0) * 100) / 100,
    });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Textos
// ----------------------------------------------------------------------------

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const pct = (v: number, casas = 1) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

const ROTULO_TIPO: Record<ParcelaFluxo["tipo"], string> = {
  ato: "Ato",
  mensal: "Mensal",
  intermediaria: "Intermediária",
  chaves: "Chaves",
  pos_chaves: "Pós-chaves",
};

export function rotuloParcela(p: ParcelaFluxo): string {
  const nome = ROTULO_TIPO[p.tipo];
  return p.totalDoTipo > 1 ? `${nome} ${p.numero}/${p.totalDoTipo}` : nome;
}

function periodo(a: string | null, b: string | null): string {
  if (!a || !b) return "";
  return a === b ? rotuloMes(a) : `${rotuloMes(a)} a ${rotuloMes(b)}`;
}

/** Linhas do fluxo em ordem de leitura (as mesmas do resumo e do WhatsApp). */
export function linhasDoFluxo(r: ResultadoFluxo): string[] {
  const linhas: string[] = [];
  const ato = r.parcelas.find((p) => p.tipo === "ato");
  if (ato) linhas.push(`Ato (${rotuloMes(ato.competencia)}): ${brl(ato.valor)}`);
  if (r.mensais.quantidade > 0 && r.mensais.valor > 0) {
    const n = r.mensais.quantidade;
    linhas.push(
      `${n} ${n === 1 ? "mensal" : "mensais"} de ${brl(r.mensais.valor)} (${periodo(r.mensais.primeira, r.mensais.ultima)})`,
    );
  }
  if (r.intermediarias.quantidade > 0) {
    const n = r.intermediarias.quantidade;
    linhas.push(
      `${n} ${n === 1 ? "intermediária" : "intermediárias"} de ${brl(r.intermediarias.valor)} (${r.intermediarias.meses.map(rotuloMes).join(", ")})`,
    );
  }
  if (r.chaves.valor > 0) {
    linhas.push(`Chaves (${rotuloMes(r.chaves.competencia)}): ${brl(r.chaves.valor)}`);
  }
  if (r.posChaves.quantidade > 0) {
    const n = r.posChaves.quantidade;
    linhas.push(
      `${n} ${n === 1 ? "parcela" : "parcelas"} pós-chaves de ${brl(r.posChaves.valor)} (${periodo(r.posChaves.primeira, r.posChaves.ultima)})`,
    );
  }
  return linhas;
}

export function textoWhatsApp(ctx: {
  construtora: string;
  projeto: string | null;
  form: FormFluxo;
  resultado: ResultadoFluxo;
  regras: RegrasFluxo;
}): string {
  const { form: f, resultado: r } = ctx;
  const titulo = [ctx.construtora, ctx.projeto].filter(Boolean).join(" · ");
  const out: string[] = [`*Simulação de fluxo: ${titulo}*`];
  if (f.rotuloUnidade) out.push(`Unidade: ${f.rotuloUnidade}`);
  out.push(`Valor do imóvel: ${brl(r.valorImovel)}`);
  const recursos = [
    r.recursos.financiamento > 0 ? `Financiamento: ${brl(r.recursos.financiamento)}` : null,
    r.recursos.subsidio > 0 ? `Subsídio: ${brl(r.recursos.subsidio)}` : null,
    r.recursos.fgts > 0 ? `FGTS: ${brl(r.recursos.fgts)}` : null,
  ].filter(Boolean);
  if (recursos.length) out.push(recursos.join(" · "));
  out.push("", `*Com a construtora: ${brl(r.saldoConstrutora)}*`);
  for (const l of linhasDoFluxo(r)) out.push(`• ${l}`);
  out.push("");
  out.push(
    "Valores de tabela, sujeitos à correção prevista no contrato (em geral o INCC até as chaves).",
  );
  if (r.posChaves.quantidade > 0) {
    out.push(
      `Pós-chaves com juros de ${pct(ctx.regras.jurosPosChavesPct, 2)} a.m. já incluídos, mais a correção do contrato.`,
    );
  }
  out.push(
    `Condição para assinatura em ${rotuloMes(f.hoje)}: a cada mês que passa o número de mensais diminui e o valor da mensal sobe.`,
    "Simulação sujeita à tabela vigente da construtora e à aprovação de crédito.",
  );
  return out.join("\n");
}
