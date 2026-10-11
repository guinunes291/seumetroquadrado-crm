// PDF da simulação Vibra: a mesma folha do simulador oficial do canal (dados
// do cliente, fluxo com o teto de cada parcela, total, pró-soluto, status e as
// notas da Caixa), mais quanto custa esperar e o cronograma mês a mês. O HTML
// é o comum dos simuladores por linhas (fluxo-linhas-pdf). Carregado em lazy
// no clique.

import { imprimirHtml } from "@/lib/pdf-print";
import { rotuloMes } from "@/lib/simuladores/fluxo";
import {
  textoStatusVibra,
  VIGENCIA_VIBRA,
  type CenarioEsperaVibra,
  type ResultadoVibra,
} from "@/lib/simuladores/vibra";
import { brl, pct } from "./estado";
import { montarHtmlFolha } from "./fluxo-linhas-pdf";
import { notaCaixa, notaRetencao, quandoLinha, tetoLinha, type FormVibra } from "./vibra-estado";

export interface DadosPdfVibra {
  form: FormVibra;
  resultado: ResultadoVibra;
  cenarios: CenarioEsperaVibra[];
  geradoEm?: Date;
}

export function tituloPdfVibra(f: Pick<FormVibra, "empreendimento" | "hoje">): string {
  const alvo = ["Vibra", f.empreendimento].filter(Boolean).join(" ");
  return `Fluxo de pagamento ${alvo} ${rotuloMes(f.hoje).replace("/", " ")}`;
}

export function montarHtmlVibra(d: DadosPdfVibra): string {
  const { form: f, resultado: r } = d;
  const geradoEm = (d.geradoEm ?? new Date()).toLocaleDateString("pt-BR");
  return montarHtmlFolha({
    titulo: tituloPdfVibra(f),
    marca: "Vibra Residencial · Simulação de pagamento",
    h1: f.empreendimento ?? "Vibra",
    sub: `Vibra Parcerias · ${f.rotuloUnidade ? `${f.rotuloUnidade} · ` : ""}assinatura em ${rotuloMes(f.hoje)} · gerado em ${geradoEm}`,
    dados: [
      ["Renda mensal", brl(f.renda)],
      ["Valor total do imóvel", brl(f.valorImovel)],
      ["Financiado pelo banco", brl(f.financiamento)],
      ["Subsídio + FGTS", brl(f.subsidioFgts)],
      ["Financiamento líquido *", brl(r.financiamentoLiquido)],
      ["Total a pagar até a entrega", brl(r.totalAteEntrega)],
      ["Parcela possível depois da entrega (morando)", brl(r.potencialMorando)],
      ["Previsão de entrega", r.entrega ? rotuloMes(r.entrega) : "a confirmar"],
    ],
    dadoForte: 5,
    notaDados: `* ${notaRetencao(r)}`,
    linhas: r.linhas.map((l) => ({
      rotulo: l.rotulo,
      teto: tetoLinha(l, r),
      qtd: l.qtd,
      valor: l.valor,
      total: l.total,
      quando: l.qtd > 0 ? quandoLinha(l) : "não tem",
      tom: l.qtd === 0 ? "off" : l.excedeu ? "fora" : l.teto != null && l.valor > 0 ? "ok" : "",
    })),
    totalFluxo: r.totalFluxo,
    rodapeFluxo: [
      {
        rotulo: "Pró-soluto comprometido na proposta (máximo 15%)",
        valor: pct(r.proSoluto.pct),
        alerta: r.proSoluto.excedeu,
      },
    ],
    status: {
      texto: textoStatusVibra(r),
      tom: r.status === "fechou" ? "fechou" : r.status === "incompleto" ? "" : "pendente",
    },
    notas: [notaCaixa(f.documentacao)],
    cenarios: f.renda > 0 ? d.cenarios : [],
    cronograma: r.cronograma.map((p) => ({ ...p, destaque: p.tipo !== "mensal" })),
    assinatura: true,
    rodape: `Esta simulação não tem valor contratual. Valores sujeitos à aprovação bancária, à disponibilidade da unidade e a alteração sem aviso prévio. Regras do simulador do canal Vibra Parcerias (tabela de ${rotuloMes(VIGENCIA_VIBRA)}), com as mensais contadas para a assinatura em ${rotuloMes(f.hoje)}.`,
  });
}

export function imprimirVibra(d: DadosPdfVibra): Promise<void> {
  return imprimirHtml(montarHtmlVibra(d), { tituloIframe: "Fluxo de pagamento Vibra" });
}
