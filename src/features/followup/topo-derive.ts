// A conta do topo do Follow-Up (identidade Lançamento, como no vídeo de
// lançamento): a cadência por etapa, com o checklist do que fecha cada uma, e
// a régua de toques com quantos clientes estão em cada toque hoje. Pura, para
// ser testável sem montar React (tests/follow-up-lancamento.test.tsx).
//
// O checklist é o espelho de `cadencia_etapa_completa` no banco — Lead
// chegou, 1º e 2º follow-up fecham com 2 ligações válidas + 1 WhatsApp; o
// encerramento, com a mensagem. O vídeo mostra "Mensagem de abertura" e
// "WhatsApp" como dois itens no primeiro dia; no CRM a abertura É o WhatsApp
// do Lead chegou (o template cadencia_D0), e a tela não pode cobrar um toque
// que o motor não conta. A ordem é a da regra da Fila do Dia: liga primeiro,
// manda a mensagem depois — ela diz "acabei de tentar te ligar".

import type { CadenciaItem } from "@/features/cadencia/client";
import { ETAPAS_CADENCIA, rotuloPrazo, type EtapaCadencia } from "@/features/cadencia/templates";

type ItemCadencia = Pick<
  CadenciaItem,
  "etapa" | "ligacoes_validas" | "whatsapp_enviado" | "prazo" | "atrasado"
>;

type Passo = { rotulo: string; feito: (item: ItemCadencia) => boolean };

const LIGACAO_1: Passo = { rotulo: "1ª ligação", feito: (i) => i.ligacoes_validas >= 1 };
const LIGACAO_2: Passo = { rotulo: "2ª ligação", feito: (i) => i.ligacoes_validas >= 2 };
const WHATSAPP: Passo = { rotulo: "WhatsApp", feito: (i) => i.whatsapp_enviado };

export const PASSOS_DA_ETAPA: Record<EtapaCadencia, readonly Passo[]> = {
  D0: [LIGACAO_1, LIGACAO_2, { ...WHATSAPP, rotulo: "WhatsApp de abertura" }],
  D1: [LIGACAO_1, LIGACAO_2, WHATSAPP],
  D2: [LIGACAO_1, LIGACAO_2, WHATSAPP],
  D3: [{ ...WHATSAPP, rotulo: "Mensagem de encerramento" }],
};

export type PassoResumo = { rotulo: string; feitos: number };

export type ResumoEtapa = {
  etapa: EtapaCadencia;
  /** Clientes nesta etapa agora. */
  total: number;
  /** Prazo da etapa é hoje (calendário de São Paulo). */
  venceHoje: number;
  /** Prazo já passou — a etapa vencida em Lead chegou/D1/D2 vai à roleta. */
  venceram: number;
  /** Cada passo do checklist com quantos dos `total` já o cumpriram. */
  passos: PassoResumo[];
};

/** As quatro etapas, na ordem, mesmo as vazias: o processo aparece inteiro. */
export function resumoDaCadencia(itens: ItemCadencia[], agora = new Date()): ResumoEtapa[] {
  return ETAPAS_CADENCIA.map((etapa) => {
    const daEtapa = itens.filter((i) => i.etapa === etapa);
    return {
      etapa,
      total: daEtapa.length,
      venceHoje: daEtapa.filter(
        (i) => !i.atrasado && rotuloPrazo(i.prazo, i.atrasado, agora) === "vence hoje",
      ).length,
      venceram: daEtapa.filter((i) => i.atrasado).length,
      passos: PASSOS_DA_ETAPA[etapa].map((p) => ({
        rotulo: p.rotulo,
        feitos: daEtapa.filter(p.feito).length,
      })),
    };
  });
}

/**
 * Quantos clientes da fila de hoje estão em cada toque da régua — índice 0 é
 * o toque 1. O toque de cada um é o mesmo da fila: tentativas + 1, preso ao
 * teto (quem já deu todos fica no último, à espera do desfecho).
 */
export function toquesDeHoje(itens: { tentativas: number }[], maxToques: number): number[] {
  const contagem = Array.from({ length: maxToques }, () => 0);
  for (const i of itens) {
    const toque = Math.min(Math.max(0, Math.floor(i.tentativas)) + 1, maxToques);
    contagem[toque - 1] += 1;
  }
  return contagem;
}

/** "toques 3, 7 e 11 por ligação" — a legenda da régua vigente. */
export function legendaLigacoes(ligacaoNosToques: number[]): string | null {
  const t = [...new Set(ligacaoNosToques)].sort((a, b) => a - b);
  if (t.length === 0) return null;
  if (t.length === 1) return `toque ${t[0]} por ligação`;
  return `toques ${t.slice(0, -1).join(", ")} e ${t[t.length - 1]} por ligação`;
}
