// Estado da aba Longitude e os textos de saída (resumo, WhatsApp). Sem
// React: a tela só renderiza; as conversões ficam testáveis.

import { competenciaAtual, rotuloMes, type Competencia } from "@/lib/simuladores/fluxo";
import {
  empreendimentoLongitude,
  IDS_LINHAS_LONGITUDE,
  PRIMEIRA_PARCELA_MAX_RENDA,
  type EntradaLongitude,
  type IdLinhaLongitude,
  type LinhaLongitude,
  type PremissasLongitude,
  type ResultadoLongitude,
} from "@/lib/simuladores/longitude";
import { PREMISSAS_PADRAO_LONGITUDE } from "@/lib/simuladores/tabela-longitude";
import { brl, pct, type PrefillFluxo } from "./estado";

export interface FormLongitude {
  empreendimento: string | null;
  unidadeId: string | null;
  rotuloUnidade: string;
  /** Premissas em uso: as do empreendimento, com os ajustes do corretor. */
  premissas: PremissasLongitude;
  hoje: Competencia;
  entrega: Competencia | "";
  /** Renda total dos proponentes. */
  renda: number;
  valorTabela: number;
  /** 0 = igual ao valor de tabela. */
  valorAvaliacao: number;
  financiamento: number;
  subsidio: number;
  fgts: number;
  /** 0 = 30% da renda (o padrão do simulador oficial). */
  primeiraParcela: number;
  posParcelas: number | null;
  parcelas: Record<IdLinhaLongitude, number>;
}

export const PARCELAS_LONGITUDE_ZERADAS = Object.fromEntries(
  IDS_LINHAS_LONGITUDE.map((id) => [id, 0]),
) as Record<IdLinhaLongitude, number>;

export function formInicialLongitude(
  prefill?: PrefillFluxo,
  hoje: Competencia = competenciaAtual(),
): FormLongitude {
  return {
    empreendimento: null,
    unidadeId: null,
    rotuloUnidade: "",
    premissas: { ...PREMISSAS_PADRAO_LONGITUDE },
    hoje,
    entrega: "",
    renda: prefill?.renda ?? 0,
    valorTabela: prefill?.valor ?? 0,
    valorAvaliacao: 0,
    financiamento: prefill?.financiamento ?? 0,
    subsidio: prefill?.subsidio ?? 0,
    fgts: prefill?.fgts ?? 0,
    primeiraParcela: prefill?.parcela ?? 0,
    posParcelas: null,
    parcelas: { ...PARCELAS_LONGITUDE_ZERADAS },
  };
}

/** A 1ª parcela do banco: a informada (até 30% da renda) ou os 30%. */
export function primeiraParcelaEfetiva(f: Pick<FormLongitude, "renda" | "primeiraParcela">) {
  const max = f.renda * PRIMEIRA_PARCELA_MAX_RENDA;
  return f.primeiraParcela > 0 ? Math.min(f.primeiraParcela, max || f.primeiraParcela) : max;
}

export function entradaLongitudeDoForm(f: FormLongitude): EntradaLongitude {
  return {
    empreendimento: empreendimentoLongitude(f.empreendimento),
    premissas: f.premissas,
    hoje: f.hoje || competenciaAtual(),
    entrega: f.entrega,
    renda: f.renda,
    valorTabela: f.valorTabela,
    valorAvaliacao: f.valorAvaliacao,
    financiamento: f.financiamento,
    subsidio: f.subsidio,
    fgts: f.fgts,
    primeiraParcela: primeiraParcelaEfetiva(f),
    posParcelas: f.posParcelas,
    parcelas: f.parcelas,
  };
}

// ----------------------------------------------------------------------------
// Textos
// ----------------------------------------------------------------------------

export function quandoLinhaLongitude(l: Pick<LinhaLongitude, "tipo" | "meses">): string {
  if (l.meses.length === 0) return "";
  if (l.meses.length === 1) return rotuloMes(l.meses[0]);
  if (l.tipo === "anual") {
    const r = l.meses.map(rotuloMes);
    return `${r.slice(0, -1).join(", ")} e ${r[r.length - 1]}`;
  }
  return `${rotuloMes(l.meses[0])} a ${rotuloMes(l.meses[l.meses.length - 1])}`;
}

export function tetoLinhaLongitude(l: LinhaLongitude, f: FormLongitude): string {
  const pr = f.premissas;
  if (l.id === "ato") return pr.atoMinimo > 0 ? `mínimo ${brl(pr.atoMinimo)}` : "valor livre";
  if (l.id === "outros") return "pede aprovação";
  if (l.id === "periodicidade") return "R$ 100,00 pela regra dos 36 meses";
  if (l.id === "adimplencia") return "avaliação − tabela (fora do valor final)";
  const cada = (pctTxt: string) =>
    l.teto != null ? `máx. ${brl(l.teto)} cada (${pctTxt})` : `máx. ${pctTxt} cada`;
  if (l.id === "pre") return cada(`${pct(pr.comprometimentoPre * 100, 2)} da renda`);
  if (l.id === "anuais") return cada("100% da renda");
  return `${cada(`${pct(pr.comprometimentoTotal * 100, 0)} da renda − 1ª parcela`)}; total até ${pct(pr.proSolutoPosMax * 100, 2)} do valor`;
}

/** As linhas do fluxo em ordem de leitura (resumo, WhatsApp e PDF). */
export function linhasDoFluxoLongitude(r: ResultadoLongitude): string[] {
  const out: string[] = [];
  for (const l of r.linhas) {
    if (l.qtd === 0 || l.valor <= 0) continue;
    const n = l.qtd;
    const quando = quandoLinhaLongitude(l);
    if (l.id === "ato") out.push(`Ato (${quando}): ${brl(l.total)}`);
    else if (l.id === "pre") {
      out.push(
        `${n} ${n === 1 ? "parcela" : "parcelas"} pré-chaves de ${brl(l.valor)} (${quando})`,
      );
    } else if (l.id === "anuais") {
      out.push(`${n} ${n === 1 ? "anual" : "anuais"} de ${brl(l.valor)} (${quando})`);
    } else if (l.id === "pos") {
      out.push(
        `${n} ${n === 1 ? "parcela" : "parcelas"} pós-chaves de ${brl(l.valor)} (${quando})`,
      );
    } else if (l.id === "outros") out.push(`Outros: ${brl(l.total)}`);
    else if (l.id === "periodicidade") out.push(`Periodicidade (${quando}): ${brl(l.total)}`);
  }
  return out;
}

export function textoWhatsAppLongitude(ctx: {
  form: FormLongitude;
  resultado: ResultadoLongitude;
}): string {
  const { form: f, resultado: r } = ctx;
  const titulo = ["Longitude", f.empreendimento].filter(Boolean).join(" · ");
  const out: string[] = [`*Simulação de fluxo: ${titulo}*`];
  if (f.rotuloUnidade) out.push(`Unidade: ${f.rotuloUnidade}`);
  out.push(`Valor de tabela: ${brl(f.valorTabela)}`);
  const recursos = [
    f.financiamento > 0 ? `Financiamento: ${brl(f.financiamento)}` : null,
    f.subsidio > 0 ? `Subsídio: ${brl(f.subsidio)}` : null,
    f.fgts > 0 ? `FGTS: ${brl(f.fgts)}` : null,
  ].filter(Boolean);
  if (recursos.length) out.push(recursos.join(" · "));
  out.push("", `*Com a construtora: ${brl(Math.max(0, r.saldo))}*`);
  for (const l of linhasDoFluxoLongitude(r)) out.push(`• ${l}`);
  out.push("");
  if (f.entrega) out.push(`Previsão de entrega: ${rotuloMes(f.entrega)}.`);
  out.push(
    `Condição para assinatura em ${rotuloMes(f.hoje)}: a cada mês que passa sai uma parcela pré-chaves e entra uma pós-chaves.`,
    "Documento informativo: as condições dependem da análise e da aprovação da Longitude e das políticas vigentes na formalização.",
  );
  return out.join("\n");
}
