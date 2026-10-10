// A conta do painel da pré-venda (como no vídeo de lançamento, com o que o SDR
// de fato faz no CRM): as cinco colunas depois da passagem, o texto da roleta
// e as etiquetas do "lead entregue". Pura, para ser testável
// (tests/pre-venda-lancamento.test.tsx).

import { quandoDaVisita } from "@/features/visitas/visita-derive";
import type { EntregaPainel, PainelSdr, RoletaPainel } from "./painel-client";

export type ChaveColuna = "a_confirmar" | "confirmada" | "realizada" | "pasta" | "venda";

export type ColunaPainel = {
  chave: ChaveColuna;
  rotulo: string;
  total: number;
  /** 0..1: o tamanho da barra, relativo à maior coluna. */
  fracao: number;
  /** O primeiro cliente da coluna, como o mini-cartão do vídeo. */
  destaque: { nome: string; detalhe: string } | null;
  dica: string;
};

const ROTULOS: Record<ChaveColuna, { rotulo: string; dica: string }> = {
  a_confirmar: {
    rotulo: "A confirmar",
    dica: "Visitas marcadas que você ainda confirma (D-1 e no dia).",
  },
  confirmada: {
    rotulo: "Confirmada",
    dica: "O cliente confirmou: o corretor vê a visita confirmada.",
  },
  realizada: { rotulo: "Realizada", dica: "Visitas com presença validada nesta semana da folha." },
  pasta: { rotulo: "Pasta", dica: "Clientes que entraram em análise de crédito nesta semana." },
  venda: { rotulo: "Venda", dica: "Vendas assinadas nesta semana." },
};

const curto = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}` : iso;
};

export function colunasDoPainel(p: PainelSdr, agora = new Date()): ColunaPainel[] {
  const base: Array<[ChaveColuna, number, ColunaPainel["destaque"]]> = [
    [
      "a_confirmar",
      p.a_confirmar.length,
      p.a_confirmar[0]
        ? {
            nome: p.a_confirmar[0].nome,
            detalhe: quandoDaVisita(p.a_confirmar[0].data_inicio, agora),
          }
        : null,
    ],
    [
      "confirmada",
      p.confirmada.length,
      p.confirmada[0]
        ? {
            nome: p.confirmada[0].nome,
            detalhe: quandoDaVisita(p.confirmada[0].data_inicio, agora),
          }
        : null,
    ],
    [
      "realizada",
      p.realizada.length,
      p.realizada[0]
        ? { nome: p.realizada[0].nome, detalhe: p.realizada[0].corretor_nome ?? "visitou" }
        : null,
    ],
    [
      "pasta",
      p.pasta.length,
      p.pasta[0]
        ? { nome: p.pasta[0].nome, detalhe: `em análise desde ${curto(p.pasta[0].em)}` }
        : null,
    ],
    [
      "venda",
      p.venda.length,
      p.venda[0] ? { nome: p.venda[0].nome, detalhe: `assinou em ${curto(p.venda[0].em)}` } : null,
    ],
  ];
  const maior = Math.max(1, ...base.map(([, n]) => n));
  return base.map(([chave, total, destaque]) => ({
    chave,
    total,
    fracao: total / maior,
    destaque,
    ...ROTULOS[chave],
  }));
}

/** "sáb 10/10 a sex 16/10" — a semana da folha do SDR. */
export function rotuloSemana(semana: { de: string; ate: string }): string {
  return `sáb ${curto(semana.de)} a sex ${curto(semana.ate)}`;
}

export type TextoRoleta = { numero: string; titulo: string; detalhe: string; alerta: boolean };

/**
 * A roleta para o SDR é um número, não uma fila: a vez de cada corretor
 * depende da agenda no horário da visita e de quem já tentou o cliente, e o
 * corretor de origem tem prioridade — "o próximo da vez" seria uma promessa
 * falsa ao cliente.
 */
export function textoRoleta(r: RoletaPainel): TextoRoleta {
  const regra = r.regra_semanal
    ? r.sombra
      ? "regra semanal em teste"
      : "regra semanal ativa"
    : "time montado pela gestão";
  if (r.aptos === 0) {
    return {
      numero: "0 corretores",
      titulo: "Sem corretores aptos nesta semana",
      detalhe: r.zona_estrita
        ? "A visita vai para o time da zona do cliente; sem ninguém livre lá, a gestão entrega."
        : "O agendamento não acha corretor: a gestão faz a entrega manual.",
      alerta: true,
    };
  }
  return {
    numero: `${r.aptos} ${r.aptos === 1 ? "corretor" : "corretores"}`,
    titulo: "Na roleta do SDR nesta semana",
    detalhe: `${regra}. Quem recebe sai no agendamento: agenda livre no horário e zona do cliente.`,
    alerta: false,
  };
}

/** As etiquetas do cartão "lead entregue" (o que o corretor recebeu). */
export function etiquetasDaEntrega(e: EntregaPainel, agora = new Date()): string[] {
  const out: string[] = [];
  if (e.renda_informada) out.push(`Renda ${e.renda_informada}`);
  if (e.tipo_renda) out.push(e.tipo_renda);
  if (e.usa_fgts != null) out.push(`FGTS ${e.usa_fgts ? "sim" : "não"}`);
  if (e.restricao_cpf === "nao") out.push("CPF sem restrição");
  else if (e.restricao_cpf === "sim") out.push("CPF com restrição");
  else if (e.restricao_cpf === "nao_sabe") out.push("CPF: não sabe");
  if (e.proxima_visita) out.push(`Visita ${quandoDaVisita(e.proxima_visita, agora)}`);
  return out;
}
