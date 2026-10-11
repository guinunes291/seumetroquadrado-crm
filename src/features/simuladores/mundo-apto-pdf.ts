// PDF da simulação Mundo Apto: a folha comum dos simuladores por linhas
// (fluxo-linhas-pdf) com os dados da modalidade, o teto de cada parcela pela
// política e a conferência da política regra a regra. Carregado em lazy no
// clique.

import { imprimirHtml } from "@/lib/pdf-print";
import { rotuloMes } from "@/lib/simuladores/fluxo";
import {
  MODALIDADES_MA,
  textoStatusMA,
  type CenarioEsperaMA,
  type ResultadoMA,
} from "@/lib/simuladores/mundo-apto";
import { brl, pct } from "./estado";
import { montarHtmlFolha, secaoConferencia } from "./fluxo-linhas-pdf";
import { notasMA, quandoLinhaMA, tetoLinhaMA, type FormMA } from "./mundo-apto-estado";

export interface DadosPdfMA {
  form: FormMA;
  resultado: ResultadoMA;
  cenarios: CenarioEsperaMA[];
  geradoEm?: Date;
}

export function tituloPdfMA(f: Pick<FormMA, "empreendimento" | "hoje">): string {
  const alvo = ["Mundo Apto", f.empreendimento].filter(Boolean).join(" ");
  return `Fluxo de pagamento ${alvo} ${rotuloMes(f.hoje).replace("/", " ")}`;
}

function conferencia(r: ResultadoMA): string {
  return secaoConferencia(
    "Conferência da política",
    r.conferencias.map((c) => ({
      rotulo: c.rotulo,
      atual: c.atual,
      limite: c.limite,
      situacao: c.ok ? "atende" : c.bloqueia ? "não atende" : "a confirmar",
      nota: c.nota,
    })),
  );
}

export function montarHtmlMA(d: DadosPdfMA): string {
  const { form: f, resultado: r } = d;
  const regras = MODALIDADES_MA[f.modalidade];
  const geradoEm = (d.geradoEm ?? new Date()).toLocaleDateString("pt-BR");
  const dados: [string, string][] = [
    ["Modalidade", regras.rotulo],
    ["Valor do imóvel", brl(f.valorImovel)],
  ];
  if (regras.temBanco) {
    dados.push(
      ["Renda líquida", brl(f.renda)],
      ["Financiamento", brl(f.financiamento)],
      ["Subsídio", brl(f.subsidio)],
      ["FGTS", brl(f.fgts)],
    );
  }
  dados.push(
    ["Com a construtora", brl(r.saldoConstrutora)],
    ["Habite-se", r.habiteSe ? rotuloMes(r.habiteSe) : "a confirmar"],
    ["Prazo do contrato", r.prazoMeses > 0 ? `${r.prazoMeses} meses` : "-"],
  );
  return montarHtmlFolha({
    titulo: tituloPdfMA(f),
    marca: "Mundo Apto Parcerias · Simulação de pagamento",
    h1: f.empreendimento ?? "Mundo Apto",
    sub: `${f.rotuloUnidade ? `${f.rotuloUnidade} · ` : ""}assinatura em ${rotuloMes(f.hoje)} · gerado em ${geradoEm}`,
    dados,
    dadoForte: dados.findIndex(([k]) => k === "Com a construtora"),
    linhas: r.linhas.map((l) => ({
      rotulo: l.rotulo,
      teto: tetoLinhaMA(l, r),
      qtd: l.qtd,
      valor: l.valor,
      total: l.total,
      quando: l.qtd > 0 ? quandoLinhaMA(l) : (l.indisponivel ?? "não tem"),
      tom: l.qtd === 0 ? "off" : l.excedeu ? "fora" : l.teto != null && l.valor > 0 ? "ok" : "",
    })),
    totalFluxo: r.totalFluxo,
    rodapeFluxo: [
      { rotulo: "Ato + entradas", valor: brl(r.totalEntradas) },
      ...(r.proSoluto.teto != null
        ? [
            {
              rotulo: "Pró-soluto (sem ato e entradas, máximo 25%)",
              valor: pct(r.proSoluto.pct),
              alerta: r.proSoluto.excedeu,
            },
          ]
        : []),
    ],
    status: {
      texto: textoStatusMA(r),
      tom: r.status === "fechou" ? "fechou" : r.status === "incompleto" ? "" : "pendente",
    },
    notas: notasMA(r),
    secaoExtra: conferencia(r),
    cenarios: !regras.temBanco || f.renda > 0 ? d.cenarios : [],
    cronograma: r.cronograma.map((p) => ({ ...p, destaque: p.tipo !== "mensal" })),
    assinatura: true,
    rodape:
      "Esta simulação não tem valor contratual. Valores sujeitos à análise de crédito, à disponibilidade da unidade e a alteração sem aviso prévio. Regras da Política de Análise de Crédito da Mundo Apto de 09/04/2026 (Tabelão out/2026).",
  });
}

export function imprimirMA(d: DadosPdfMA): Promise<void> {
  return imprimirHtml(montarHtmlMA(d), { tituloIframe: "Fluxo de pagamento Mundo Apto" });
}
