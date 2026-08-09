// Contrato do webhook de entrada da mensageria (Fase 7a) — o formato
// NORMALIZADO que o fluxo n8n envia ao CRM, seja qual for o provedor
// (Z-API hoje, Meta Cloud API amanhã — decisão D1). O n8n traduz o payload
// cru do provedor para este shape; o CRM nunca conhece formato de provedor.
//
// Dois eventos:
// * "mensagem": mensagem recebida do cliente → vira linha em `mensagens`
//   (direcao entrada) + eco em `interacoes` (aciona a fila Responder).
// * "status": atualização de entrega de uma mensagem ENVIADA (enviada →
//   entregue → lida, ou falha) → atualiza a linha pelo provider_message_id.

import { z } from "zod";

/** Dígitos de telefone aceitos: BR com/sem DDI (10..13 como no lead-intake). */
function telefoneDigits(v: string): string | null {
  const d = v.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 13 ? d : null;
}

const mensagemSchema = z.object({
  tipo: z.literal("mensagem"),
  provider: z.string().trim().min(1).max(40),
  provider_message_id: z.string().trim().min(4).max(255),
  telefone: z.string().trim().min(10).max(30),
  conteudo: z.string().max(8000).optional().nullable(),
  midia_url: z.string().url().max(2048).optional().nullable(),
  /** Quando o provedor carimbou a mensagem (ISO); ausente = agora. */
  ocorrido_em: z.string().datetime({ offset: true }).optional().nullable(),
});

const statusSchema = z.object({
  tipo: z.literal("status"),
  provider_message_id: z.string().trim().min(4).max(255),
  status: z.enum(["enviada", "entregue", "lida", "falha"]),
  erro: z.string().max(2000).optional().nullable(),
});

const eventoSchema = z.discriminatedUnion("tipo", [mensagemSchema, statusSchema]);

export type EventoMensagem = {
  tipo: "mensagem";
  provider: string;
  providerMessageId: string;
  /** Só dígitos — a chave de busca do lead. */
  telefoneDigits: string;
  conteudo: string | null;
  midiaUrl: string | null;
  ocorridoEm: string | null;
};

export type EventoStatus = {
  tipo: "status";
  providerMessageId: string;
  status: "enviada" | "entregue" | "lida" | "falha";
  erro: string | null;
};

export type WebhookWhatsAppParse =
  | { ok: true; evento: EventoMensagem | EventoStatus }
  | { ok: false; error: string };

/**
 * Valida e normaliza o payload do n8n. Fail-closed: shape desconhecido é
 * erro 400 no chamador, nunca gravação parcial. Mensagem sem conteúdo E sem
 * mídia é rejeitada (não há o que mostrar nem responder).
 */
export function parseWebhookWhatsApp(input: unknown): WebhookWhatsAppParse {
  const parsed = eventoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "payload_invalido" };
  const d = parsed.data;

  if (d.tipo === "status") {
    return {
      ok: true,
      evento: {
        tipo: "status",
        providerMessageId: d.provider_message_id,
        status: d.status,
        erro: d.erro?.trim() || null,
      },
    };
  }

  const digits = telefoneDigits(d.telefone);
  if (!digits) return { ok: false, error: "telefone_invalido" };
  const conteudo = d.conteudo?.trim() || null;
  const midiaUrl = d.midia_url?.trim() || null;
  if (!conteudo && !midiaUrl) return { ok: false, error: "mensagem_vazia" };

  return {
    ok: true,
    evento: {
      tipo: "mensagem",
      provider: d.provider,
      providerMessageId: d.provider_message_id,
      telefoneDigits: digits,
      conteudo,
      midiaUrl,
      ocorridoEm: d.ocorrido_em ?? null,
    },
  };
}

/** Trecho da mensagem para o título/preview na timeline (1 linha honesta). */
export function previewMensagem(conteudo: string | null, midiaUrl: string | null): string {
  if (conteudo) return conteudo.length > 140 ? `${conteudo.slice(0, 139)}…` : conteudo;
  if (midiaUrl) return "[mídia recebida]";
  return "[mensagem]";
}
