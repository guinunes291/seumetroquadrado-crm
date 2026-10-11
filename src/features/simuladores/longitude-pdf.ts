// PDF da simulação Longitude: a folha comum dos simuladores por linhas
// (fluxo-linhas-pdf) com o resumo do simulador oficial (renda, tabela,
// avaliação, 1ª parcela), o fluxo com o teto de cada linha, desconto ou ganho
// de preço e as premissas práticas regra a regra. Carregado em lazy no clique.

import { imprimirHtml } from "@/lib/pdf-print";
import { rotuloMes } from "@/lib/simuladores/fluxo";
import {
  textoStatusLongitude,
  type CenarioEsperaLongitude,
  type ResultadoLongitude,
} from "@/lib/simuladores/longitude";
import { brl, pct } from "./estado";
import { montarHtmlFolha, secaoConferencia } from "./fluxo-linhas-pdf";
import {
  primeiraParcelaEfetiva,
  quandoLinhaLongitude,
  tetoLinhaLongitude,
  type FormLongitude,
} from "./longitude-estado";

export interface DadosPdfLongitude {
  form: FormLongitude;
  resultado: ResultadoLongitude;
  cenarios: CenarioEsperaLongitude[];
  geradoEm?: Date;
}

export function tituloPdfLongitude(f: Pick<FormLongitude, "empreendimento" | "hoje">): string {
  const alvo = ["Longitude", f.empreendimento].filter(Boolean).join(" ");
  return `Fluxo de pagamento ${alvo} ${rotuloMes(f.hoje).replace("/", " ")}`;
}

export function montarHtmlLongitude(d: DadosPdfLongitude): string {
  const { form: f, resultado: r } = d;
  const geradoEm = (d.geradoEm ?? new Date()).toLocaleDateString("pt-BR");
  const diferenca =
    r.diferenca > 0.005
      ? { rotulo: "Desconto (pede aprovação)", valor: brl(r.diferenca), alerta: true }
      : r.diferenca < -0.005
        ? { rotulo: "Ganho de preço", valor: brl(-r.diferenca) }
        : { rotulo: "Desconto", valor: "sem desconto" };
  return montarHtmlFolha({
    titulo: tituloPdfLongitude(f),
    marca: "Longitude · Simulação de pagamento",
    h1: f.empreendimento ?? "Longitude",
    sub: `${f.rotuloUnidade ? `${f.rotuloUnidade} · ` : ""}assinatura em ${rotuloMes(f.hoje)} · gerado em ${geradoEm}`,
    dados: [
      ["Renda", brl(f.renda)],
      ["Valor de tabela", brl(f.valorTabela)],
      ["Valor de avaliação", brl(r.valorAvaliacao)],
      ["1ª parcela do financiamento", brl(primeiraParcelaEfetiva(f))],
      ["Recursos do banco", brl(r.recursos)],
      ["Com a construtora", brl(Math.max(0, r.saldo))],
      ["Previsão de entrega", f.entrega ? rotuloMes(f.entrega) : "a confirmar"],
      ["Valor final da venda", brl(r.valorFinal)],
    ],
    dadoForte: 5,
    linhas: r.linhas.map((l) => ({
      rotulo: l.rotulo,
      teto: tetoLinhaLongitude(l, f),
      qtd: l.qtd,
      valor: l.valor,
      total: l.total,
      quando: l.qtd > 0 ? quandoLinhaLongitude(l) : (l.indisponivel ?? "não tem"),
      tom: l.qtd === 0 ? "off" : l.excedeu ? "fora" : l.teto != null && l.valor > 0 ? "ok" : "",
    })),
    totalFluxo: r.valorFinal + (r.linhas.find((l) => l.id === "adimplencia")?.total ?? 0),
    rodapeFluxo: [
      { rotulo: "Valor final da venda (sem adimplência)", valor: brl(r.valorFinal) },
      diferenca,
      { rotulo: "Pró-soluto (tudo menos ato e banco)", valor: pct(r.proSoluto.pct, 2) },
    ],
    status: {
      texto: textoStatusLongitude(r),
      tom: r.status === "apto" ? "fechou" : r.status === "incompleto" ? "" : "pendente",
    },
    notas: [
      `Premissas: ${f.premissas.parcelasMax} parcelas de pró-soluto; pré-chaves até ${pct(f.premissas.comprometimentoPre * 100, 2)} da renda; pós-chaves até ${pct(f.premissas.proSolutoPosMax * 100, 2)} do valor; pós + 1ª parcela até ${pct(f.premissas.comprometimentoTotal * 100, 2)} da renda; referência mínima de ${pct(f.premissas.referenciaMinima * 100, 0)}.`,
    ],
    secaoExtra: secaoConferencia(
      "Premissas práticas",
      r.conferencias.map((c) => ({
        rotulo: c.rotulo,
        atual: c.atual,
        limite: c.limite,
        situacao: c.ok ? "atende" : c.nivel === "erro" ? "não atende" : "pede aprovação",
      })),
    ),
    cenarios: f.renda > 0 ? d.cenarios : [],
    cronograma: r.cronograma.map((p) => ({ ...p, destaque: p.tipo !== "mensal" })),
    assinatura: true,
    rodape:
      "Documento informativo: as condições apresentadas estão sujeitas à análise e às aprovações internas da Longitude e às políticas vigentes na formalização, sem configurar proposta definitiva ou garantia de aprovação.",
  });
}

export function imprimirLongitude(d: DadosPdfLongitude): Promise<void> {
  return imprimirHtml(montarHtmlLongitude(d), { tituloIframe: "Fluxo de pagamento Longitude" });
}
