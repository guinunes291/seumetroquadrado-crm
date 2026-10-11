// Estado da aba Vibra e os textos de saída (resumo, WhatsApp). Sem React:
// a tela só renderiza; as conversões ficam testáveis.

import { competenciaAtual, rotuloMes, type Competencia } from "@/lib/simuladores/fluxo";
import {
  empreendimentoVibra,
  IDS_LINHAS_VIBRA,
  REGRAS_VIBRA,
  type EntradaVibra,
  type IdLinhaVibra,
  type LinhaResultadoVibra,
  type ResultadoVibra,
} from "@/lib/simuladores/vibra";
import { brl, pct, type PrefillFluxo } from "./estado";

export type Documentacao = "gratis" | "cliente";

export interface FormVibra {
  /** Nome do empreendimento na tabela da Vibra. */
  empreendimento: string | null;
  unidadeId: string | null;
  rotuloUnidade: string;
  /** Mês do 1º ato (YYYY-MM). Padrão: o mês corrente. */
  hoje: Competencia;
  renda: number;
  tem36: boolean;
  temDependente: boolean;
  valorImovel: number;
  financiamento: number;
  subsidioFgts: number;
  documentacao: Documentacao;
  /** Valor de CADA parcela por linha. */
  parcelas: Record<IdLinhaVibra, number>;
}

export const PARCELAS_ZERADAS = Object.fromEntries(IDS_LINHAS_VIBRA.map((id) => [id, 0])) as Record<
  IdLinhaVibra,
  number
>;

export function formInicialVibra(
  prefill?: PrefillFluxo,
  hoje: Competencia = competenciaAtual(),
): FormVibra {
  return {
    empreendimento: null,
    unidadeId: null,
    rotuloUnidade: "",
    hoje,
    renda: prefill?.renda ?? 0,
    tem36: false,
    temDependente: false,
    valorImovel: prefill?.valor ?? 0,
    financiamento: prefill?.financiamento ?? 0,
    // O simulador oficial pede subsídio e FGTS somados.
    subsidioFgts: (prefill?.subsidio ?? 0) + (prefill?.fgts ?? 0),
    documentacao: "gratis",
    parcelas: { ...PARCELAS_ZERADAS },
  };
}

export function entradaVibraDoForm(f: FormVibra): EntradaVibra {
  return {
    empreendimento: empreendimentoVibra(f.empreendimento),
    hoje: f.hoje || competenciaAtual(),
    renda: f.renda,
    valorImovel: f.valorImovel,
    financiamento: f.financiamento,
    subsidioFgts: f.subsidioFgts,
    parcelas: f.parcelas,
  };
}

// ----------------------------------------------------------------------------
// Textos
// ----------------------------------------------------------------------------

/** "fev/2027 a mar/2027", "dez/2027 e dez/2028", "jul/2028". */
export function quandoLinha(l: Pick<LinhaResultadoVibra, "tipo" | "meses">): string {
  if (l.meses.length === 0) return "";
  if (l.tipo === "anual" || l.meses.length === 1) {
    return [...new Set(l.meses)].map(rotuloMes).join(" e ");
  }
  return `${rotuloMes(l.meses[0])} a ${rotuloMes(l.meses[l.meses.length - 1])}`;
}

/** "máx. R$ 1.400,00 cada (28% da renda)", e no pós-chave o teto do total. */
export function tetoLinha(l: LinhaResultadoVibra, r: ResultadoVibra): string {
  if (l.tetoRenda == null) return "valor livre";
  const pctRenda = `${Math.round(l.tetoRenda * 100)}% da renda`;
  const cada = l.teto != null ? `máx. ${brl(l.teto)} cada (${pctRenda})` : `máx. ${pctRenda} cada`;
  if (l.tipo !== "pos_chave") return cada;
  return r.posChave.teto > 0
    ? `${cada} e ${brl(r.posChave.teto)} no total (5% do imóvel)`
    : `${cada} e 5% do imóvel no total`;
}

/** As linhas do fluxo em ordem de leitura (resumo, WhatsApp e PDF). */
export function linhasDoFluxoVibra(r: ResultadoVibra): string[] {
  const out: string[] = [];
  const ativas = r.linhas.filter((l) => l.qtd > 0 && l.valor > 0);
  const atos = ativas.filter((l) => l.tipo === "ato");
  if (atos.length > 1 && atos.every((a) => a.valor === atos[0].valor)) {
    out.push(
      `${atos.length} atos de ${brl(atos[0].valor)} (${rotuloMes(atos[0].meses[0])} a ${rotuloMes(atos[atos.length - 1].meses[0])})`,
    );
  } else {
    for (const a of atos)
      out.push(`${a.id.slice(3)}º ato (${rotuloMes(a.meses[0])}): ${brl(a.valor)}`);
  }
  for (const l of ativas) {
    const n = l.qtd;
    const quando = quandoLinha(l);
    if (l.tipo === "mensal") {
      out.push(`${n} ${n === 1 ? "mensal" : "mensais"} de ${brl(l.valor)} (${quando})`);
    } else if (l.tipo === "anual") {
      out.push(`${n} ${n === 1 ? "anual" : "anuais"} de ${brl(l.valor)} (${quando})`);
    } else if (l.tipo === "unica") {
      out.push(`Parcela única (${quando}): ${brl(l.total)}`);
    } else if (l.tipo === "pos_chave") {
      out.push(`${n} ${n === 1 ? "parcela" : "parcelas"} pós-chave de ${brl(l.valor)} (${quando})`);
    }
  }
  return out;
}

export function notaCaixa(doc: Documentacao): string {
  return (
    "Após a assinatura do financiamento começa a evolução de obras, paga diretamente à Caixa " +
    `Econômica Federal. Taxa da Caixa: até ${brl(REGRAS_VIBRA.taxaCaixaMax)}. ` +
    (doc === "cliente" ? "Documentação paga pelo cliente." : "Documentação grátis.")
  );
}

export function notaRetencao(r: ResultadoVibra): string {
  return `Do financiamento aprovado a Vibra desconta ${pct(r.retencaoPct, r.retencaoPct % 1 ? 1 : 0)} para cobrir a correção do INCC até o cliente assinar com o banco.`;
}

export function textoWhatsAppVibra(ctx: { form: FormVibra; resultado: ResultadoVibra }): string {
  const { form: f, resultado: r } = ctx;
  const titulo = ["Vibra", f.empreendimento].filter(Boolean).join(" · ");
  const out: string[] = [`*Simulação de fluxo: ${titulo}*`];
  if (f.rotuloUnidade) out.push(`Unidade: ${f.rotuloUnidade}`);
  out.push(`Valor do imóvel: ${brl(f.valorImovel)}`);
  if (f.financiamento > 0) {
    out.push(
      `Financiamento: ${brl(f.financiamento)} (${brl(r.financiamentoLiquido)} líquidos, ${pct(r.retencaoPct, r.retencaoPct % 1 ? 1 : 0)} retido para o INCC até a assinatura com o banco)`,
    );
  }
  if (f.subsidioFgts > 0) out.push(`Subsídio + FGTS: ${brl(f.subsidioFgts)}`);
  out.push("", `*Total até a entrega: ${brl(r.totalAteEntrega)}*`);
  for (const l of linhasDoFluxoVibra(r)) out.push(`• ${l}`);
  out.push("");
  if (r.entrega) out.push(`Previsão de entrega: ${rotuloMes(r.entrega)}.`);
  if (r.potencialMorando > 0) {
    out.push(
      `Depois da entrega, morando: parcela de até ${brl(r.potencialMorando)} (30% da renda).`,
    );
  }
  out.push(
    notaCaixa(f.documentacao),
    `Condição para assinatura em ${rotuloMes(f.hoje)}: a cada mês que passa sai uma mensal do fluxo.`,
    "Simulação sem valor contratual, sujeita à aprovação bancária e à disponibilidade da unidade.",
  );
  return out.join("\n");
}
