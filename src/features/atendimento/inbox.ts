import { z } from "zod";
import type { AtendimentoQueues, QueueKey } from "@/features/atendimento/derive";

export const ATENDIMENTO_QUEUE_KEYS = ["responder", "followups", "esfriando", "docs"] as const;

const atendimentoLeadSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  telefone: z.string(),
  email: z.string().nullable(),
  status: z.string(),
  temperatura: z.string().nullable(),
  ultima_interacao: z.string().nullable(),
  proximo_followup: z.string().nullable(),
  projeto_nome: z.string().nullable(),
  created_at: z.string(),
  corretor_id: z.string().uuid().nullable(),
  origem: z.string(),
  renda_informada: z.string().nullable(),
  entrada_disponivel: z.string().nullable(),
  usa_fgts: z.boolean().nullable(),
});

const queueItemSchema = z.object({
  lead: atendimentoLeadSchema,
  score: z.number().int().min(0).max(100),
  tier: z.enum(["alta", "media", "baixa"]),
  motivo: z.string(),
  docsPendentes: z.number().int().nonnegative(),
});

const inboxRowSchema = z
  .object({
    fila: z.enum(ATENDIMENTO_QUEUE_KEYS),
    total_count: z.coerce.number().int().nonnegative(),
    items: z.array(queueItemSchema).max(30),
  })
  .superRefine((row, context) => {
    if (row.total_count < row.items.length || (row.total_count > 0 && row.items.length === 0)) {
      context.addIssue({
        code: "custom",
        message: "Contagem da fila incompatível com os itens retornados",
      });
    }
  });

export type AtendimentoInbox = {
  filas: AtendimentoQueues;
  counts: Record<QueueKey, number>;
};

export function parseAtendimentoInbox(input: unknown): AtendimentoInbox {
  const rows = z.array(inboxRowSchema).parse(input);
  const filas: AtendimentoQueues = { responder: [], followups: [], esfriando: [], docs: [] };
  const counts: Record<QueueKey, number> = {
    responder: 0,
    followups: 0,
    esfriando: 0,
    docs: 0,
  };
  const seen = new Set<QueueKey>();
  const seenLeads = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.fila)) throw new Error(`Fila duplicada na inbox: ${row.fila}`);
    seen.add(row.fila);
    for (const item of row.items) {
      if (seenLeads.has(item.lead.id)) {
        throw new Error(`Lead duplicado na inbox: ${item.lead.id}`);
      }
      seenLeads.add(item.lead.id);
    }
    filas[row.fila] = row.items;
    counts[row.fila] = row.total_count;
  }

  if (seen.size !== ATENDIMENTO_QUEUE_KEYS.length) {
    throw new Error("Resposta incompleta da inbox de atendimento");
  }

  return { filas, counts };
}
