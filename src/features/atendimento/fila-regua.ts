// Fila "followups" do modo Prioridade — FONTE ÚNICA com o hub Follow-Up
// (auditoria das abas 2026-08-27: cada número tem um único dono).
//
// A inbox de atendimento classificava esta fila por leads.proximo_followup;
// o hub Follow-Up trabalha por followup_fila_v1 (tarefas de CONTATO abertas).
// Duas fontes = o corretor zerava a fila no hub e o modo Prioridade seguia
// mostrando itens. Este módulo mapeia a fila do hub (FilaItem) para o shape
// que a QueueSection espera (QueueItem) — a resposta da inbox para a fila
// "followups" passa a ser IGNORADA quando a RPC da régua existe. Lógica PURA
// e testável; o fallback para banco antigo vive na rota (atendimento.tsx).

import { formatDuration } from "@/lib/duracao";
import { scoreLead } from "@/lib/priority";
import type { FilaFollowUp, FilaItem } from "@/features/followup/fila-client";
import type { AtendimentoQueues, QueueItem, QueueKey } from "@/features/atendimento/derive";

/** Espelha LIMITE_POR_FILA de derive.ts — máx. de cards por fila na tela. */
const LIMITE_POR_FILA = 15;

/** Motivo honesto no vocabulário da régua: qual toque é e há quanto venceu.
 *  `tentativas` são os toques JÁ dados (contador derivado do banco) — o da
 *  vez é tentativas+1. `minutos_vencido` 0 = o toque é de hoje (ou o lead
 *  acabou de entrar na régua), não "vencido há 00:00". */
export function motivoDoToque(item: Pick<FilaItem, "tentativas" | "minutos_vencido">): string {
  const toque = item.tentativas + 1;
  return item.minutos_vencido > 0
    ? `toque ${toque} da régua — vencido há ${formatDuration(item.minutos_vencido)}`
    : `toque ${toque} da régua — vence hoje`;
}

/** FilaItem (hub Follow-Up) → QueueItem (QueueSection do modo Prioridade).
 *  Todos os campos do lead existem na fila_v1 — nenhum é inventado. O score
 *  usa a mesma função das demais filas (lib/priority) para o dot de tier
 *  continuar comparável entre filas. */
export function filaItemParaQueueItem(item: FilaItem, agora?: Date): QueueItem {
  const r = scoreLead({
    temperatura: item.temperatura,
    status: item.status,
    ultimaInteracao: item.ultima_interacao,
    agora,
  });
  return {
    lead: {
      id: item.id,
      nome: item.nome,
      telefone: item.telefone,
      email: item.email,
      status: item.status,
      temperatura: item.temperatura,
      ultima_interacao: item.ultima_interacao,
      proximo_followup: item.proximo_followup,
      projeto_nome: item.projeto_nome,
      created_at: item.created_at,
      corretor_id: item.corretor_id,
      origem: item.origem,
      renda_informada: item.renda_informada,
      entrada_disponivel: item.entrada_disponivel,
      usa_fgts: item.usa_fgts,
    },
    score: r.score,
    tier: r.tier,
    motivo: motivoDoToque(item),
    // A fila da régua não carrega contagem de documentos — esse número tem
    // dono próprio (fila "docs" da inbox); 0 aqui é ausência, não dado.
    docsPendentes: 0,
  };
}

/** Substitui a fila "followups" da inbox pela fila da régua (fonte única).
 *
 *  - A ORDEM do hub é preservada (mais vencido primeiro, como a fila_v1
 *    ordena) — reordenar por score aqui faria as duas telas divergirem.
 *  - `counts.followups` = total de itens da fila_v1 (o número do hub; a RPC
 *    já corta em 200 via _take, mesmo teto do fetchFilaFollowUp).
 *  - Deduplicação: a inbox garante no banco que cada lead aparece em UMA
 *    fila; com a fonte trocada, um lead pode estar na régua E em outra fila
 *    da inbox. Para a tela nunca duplicar gente, ele fica na fila da inbox
 *    (cujas contagens vêm do banco) e sai dos CARDS da régua — o badge
 *    "n de total" da QueueSection já comunica o corte, e o total continua
 *    o do hub.
 */
export function aplicarFilaRegua(input: {
  filas: AtendimentoQueues;
  counts: Record<QueueKey, number>;
  filaRegua: FilaFollowUp;
  agora?: Date;
}): { filas: AtendimentoQueues; counts: Record<QueueKey, number> } {
  const jaListado = new Set<string>();
  for (const k of Object.keys(input.filas) as QueueKey[]) {
    if (k === "followups") continue;
    for (const item of input.filas[k]) jaListado.add(item.lead.id);
  }

  const followups = input.filaRegua.itens
    .filter((i) => !jaListado.has(i.id))
    .slice(0, LIMITE_POR_FILA)
    .map((i) => filaItemParaQueueItem(i, input.agora));

  return {
    filas: { ...input.filas, followups },
    counts: { ...input.counts, followups: input.filaRegua.itens.length },
  };
}
