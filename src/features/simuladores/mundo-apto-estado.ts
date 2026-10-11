// Estado da aba Mundo Apto e os textos de saída (resumo, WhatsApp). Sem
// React: a tela só renderiza; as conversões ficam testáveis.

import { competenciaAtual, rotuloMes, type Competencia } from "@/lib/simuladores/fluxo";
import {
  empreendimentoMA,
  IDS_LINHAS_MA,
  MODALIDADES_MA,
  PARCELA_MINIMA_MA,
  PRAZO_MINIMO_MA,
  type EntradaMA,
  type IdLinhaMA,
  type IntermediariaMA,
  type LinhaResultadoMA,
  type ModalidadeMA,
  type ResultadoMA,
} from "@/lib/simuladores/mundo-apto";
import { brl, type PrefillFluxo } from "./estado";

export interface FormMA {
  /** Nome do empreendimento na tabela de vencimentos da política. */
  empreendimento: string | null;
  unidadeId: string | null;
  rotuloUnidade: string;
  modalidade: ModalidadeMA;
  intermediaria: IntermediariaMA;
  hoje: Competencia;
  /** "" = o habite-se da política (mês da única). */
  habiteSe: Competencia | "";
  /** Renda LÍQUIDA familiar (a política usa a líquida). */
  renda: number;
  valorImovel: number;
  financiamento: number;
  subsidio: number;
  fgts: number;
  /** null = automático (o mínimo para fechar 36 meses). */
  posParcelas: number | null;
  parcelas: Record<IdLinhaMA, number>;
}

export const PARCELAS_MA_ZERADAS = Object.fromEntries(IDS_LINHAS_MA.map((id) => [id, 0])) as Record<
  IdLinhaMA,
  number
>;

export function formInicialMA(
  prefill?: PrefillFluxo,
  hoje: Competencia = competenciaAtual(),
): FormMA {
  return {
    empreendimento: null,
    unidadeId: null,
    rotuloUnidade: "",
    modalidade: "associativo",
    intermediaria: "anual",
    hoje,
    habiteSe: "",
    renda: prefill?.renda ?? 0,
    valorImovel: prefill?.valor ?? 0,
    financiamento: prefill?.financiamento ?? 0,
    subsidio: prefill?.subsidio ?? 0,
    fgts: prefill?.fgts ?? 0,
    posParcelas: null,
    parcelas: { ...PARCELAS_MA_ZERADAS },
  };
}

export function entradaMADoForm(f: FormMA): EntradaMA {
  return {
    empreendimento: empreendimentoMA(f.empreendimento),
    modalidade: f.modalidade,
    intermediaria: f.intermediaria,
    hoje: f.hoje || competenciaAtual(),
    habiteSe: f.habiteSe,
    renda: f.renda,
    valorImovel: f.valorImovel,
    financiamento: f.financiamento,
    subsidio: f.subsidio,
    fgts: f.fgts,
    posParcelas: f.posParcelas,
    parcelas: f.parcelas,
  };
}

// ----------------------------------------------------------------------------
// Textos
// ----------------------------------------------------------------------------

const mesesTexto = (meses: Competencia[]) => {
  if (meses.length === 0) return "";
  if (meses.length <= 3) {
    const r = meses.map(rotuloMes);
    return r.length === 1 ? r[0] : `${r.slice(0, -1).join(", ")} e ${r[r.length - 1]}`;
  }
  return `${rotuloMes(meses[0])} a ${rotuloMes(meses[meses.length - 1])}`;
};

/** "fev/2027 a mai/2027", "jun/2027 e dez/2027". */
export function quandoLinhaMA(l: Pick<LinhaResultadoMA, "tipo" | "meses">): string {
  if (l.tipo === "anual" || l.tipo === "semestral") return mesesTexto(l.meses);
  if (l.meses.length <= 1) return l.meses.map(rotuloMes).join("");
  return `${rotuloMes(l.meses[0])} a ${rotuloMes(l.meses[l.meses.length - 1])}`;
}

/** O teto da linha pela política, para a coluna "com o valor máximo permitido". */
export function tetoLinhaMA(l: LinhaResultadoMA, r: ResultadoMA): string {
  const regras = MODALIDADES_MA[r.modalidade];
  if (l.tetoFixo != null) return `${brl(l.tetoFixo)} por mês`;
  const partes: string[] = [];
  if (l.tetoRenda != null) {
    const p = `${Math.round(l.tetoRenda * 100)}% da renda líquida`;
    partes.push(l.teto != null ? `máx. ${brl(l.teto)} cada (${p})` : `máx. ${p} cada`);
  }
  if (l.id === "mensal" && regras.mensalMax != null) {
    partes.push(`até ${Math.round(regras.mensalMax * 100)}% do preço no total`);
  }
  if (l.id === "mensal" && regras.mensalMin != null) {
    partes.push(`no mínimo ${Math.round(regras.mensalMin * 100)}% do preço`);
  }
  if (l.tipo === "anual" && regras.anualMax != null) {
    partes.push(`até ${Math.round(regras.anualMax * 100)}% do preço`);
  }
  if (l.id === "pos" && regras.posMax != null) {
    partes.push(
      `até ${Math.round(regras.posMax * 100)}% do preço, até ${regras.posMaxParcelas} meses`,
    );
  }
  if (l.id === "ato" && regras.atoMin != null) {
    partes.push(`no mínimo ${Math.round(regras.atoMin * 100)}% do preço`);
  }
  return partes.length > 0 ? partes.join("; ") : "valor livre";
}

/** As linhas do fluxo em ordem de leitura (resumo, WhatsApp e PDF). */
export function linhasDoFluxoMA(r: ResultadoMA): string[] {
  const out: string[] = [];
  const ativas = r.linhas.filter((l) => l.qtd > 0 && l.valor > 0);
  const ato = ativas.find((l) => l.id === "ato");
  if (ato) out.push(`Ato (${rotuloMes(ato.meses[0])}): ${brl(ato.valor)}`);
  const entradas = ativas.filter((l) => l.tipo === "entrada");
  if (entradas.length > 1 && entradas.every((x) => x.valor === entradas[0].valor)) {
    out.push(
      `${entradas.length} entradas de ${brl(entradas[0].valor)} (${mesesTexto(entradas.map((x) => x.meses[0]))})`,
    );
  } else {
    for (const x of entradas) out.push(`${x.rotulo} (${rotuloMes(x.meses[0])}): ${brl(x.valor)}`);
  }
  for (const l of ativas) {
    const n = l.qtd;
    const quando = quandoLinhaMA(l);
    if (l.tipo === "mensal") {
      out.push(
        `${n} ${n === 1 ? "mensal" : "mensais"} de ${brl(l.valor)} durante a obra (${quando})`,
      );
    } else if (l.tipo === "anual") {
      out.push(`${n} ${n === 1 ? "anual" : "anuais"} de ${brl(l.valor)} (${quando})`);
    } else if (l.tipo === "semestral") {
      out.push(`${n} ${n === 1 ? "semestral" : "semestrais"} de ${brl(l.valor)} (${quando})`);
    } else if (l.tipo === "unica") {
      out.push(`Parcela única no habite-se (${quando}): ${brl(l.total)}`);
    } else if (l.tipo === "pos_chave") {
      out.push(
        `${n} ${n === 1 ? "mensal" : "mensais"} pós habite-se de ${brl(l.valor)} (${quando})`,
      );
    }
  }
  return out;
}

export function notasMA(r: ResultadoMA): string[] {
  const regras = MODALIDADES_MA[r.modalidade];
  return [
    `${regras.rotulo}: ${regras.descricao}.`,
    regras.correcao,
    `Nenhuma parcela abaixo de ${brl(PARCELA_MINIMA_MA)}${regras.prazoMinimo ? `; contrato de no mínimo ${PRAZO_MINIMO_MA} meses` : ""}. Semestral ou anual, nunca as duas.`,
  ];
}

export function textoWhatsAppMA(ctx: { form: FormMA; resultado: ResultadoMA }): string {
  const { form: f, resultado: r } = ctx;
  const regras = MODALIDADES_MA[f.modalidade];
  const titulo = ["Mundo Apto", f.empreendimento].filter(Boolean).join(" · ");
  const out: string[] = [`*Simulação de fluxo: ${titulo}*`];
  if (f.rotuloUnidade) out.push(`Unidade: ${f.rotuloUnidade}`);
  out.push(`Valor do imóvel: ${brl(f.valorImovel)}`, `Modalidade: ${regras.rotulo}`);
  if (regras.temBanco) {
    const recursos = [
      f.financiamento > 0 ? `Financiamento: ${brl(f.financiamento)}` : null,
      f.subsidio > 0 ? `Subsídio: ${brl(f.subsidio)}` : null,
      f.fgts > 0 ? `FGTS: ${brl(f.fgts)}` : null,
    ].filter(Boolean);
    if (recursos.length) out.push(recursos.join(" · "));
  }
  out.push("", `*Com a construtora: ${brl(r.saldoConstrutora)}*`);
  for (const l of linhasDoFluxoMA(r)) out.push(`• ${l}`);
  out.push("");
  if (r.habiteSe) out.push(`Habite-se previsto: ${rotuloMes(r.habiteSe)}.`);
  out.push(
    regras.correcao,
    `Condição para assinatura em ${rotuloMes(f.hoje)}: a cada mês que passa sai uma mensal da obra.`,
    "Simulação sem valor contratual, sujeita à análise de crédito e à disponibilidade da unidade.",
  );
  return out.join("\n");
}
