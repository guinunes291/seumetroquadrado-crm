// POST /api/public/webhooks/whatsapp — entrada da mensageria (Fase 7a).
//
// Chamador: o fluxo n8n (servidor-a-servidor), que traduz o payload do
// provedor (Z-API hoje, Meta Cloud amanhã) para o contrato normalizado de
// features/mensagens/webhook-contract. Autenticação por header
// `x-webhook-secret` (lição do P-3: nunca segredo em query string).
//
// Comportamento:
// * evento "mensagem": resolve o lead pelo telefone (mesma RPC de dedup do
//   webhook de leads), grava em `mensagens` (idempotente por
//   provider_message_id — replay do n8n responde duplicada:true) e ECOA na
//   timeline como interacao de entrada — é isso que acende a fila
//   "Responder" de Atender sem mudar nenhuma RPC.
// * lead não encontrado: 200 com lead:"nao_encontrado" — o n8n decide
//   (ex.: encaminhar ao lead-intake e reenviar). Nunca criamos lead aqui.
// * evento "status": atualiza a linha pelo provider_message_id.
// * mensagem de SAÍDA de um robô (06/11/2026, agente "marquinhos" etc.): o
//   n8n espelha aqui o que o Marquinhos mandou no 4099, para o corretor ler a
//   conversa no CRM. Grava sem corretor_id (não é resposta do corretor: a
//   resposta automática pós-handoff não tira o cliente da fila Responder) e
//   sem eco na timeline. Com devolução ao Marquinhos ativa, a linha leva o
//   devolucao_id — aí a resposta do robô conta, porque o corretor pediu.

import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { parseWebhookWhatsApp, previewMensagem } from "@/features/mensagens/webhook-contract";

const MAX_BODY_BYTES = 64 * 1024;

// Fronteira de tipos da tabela `mensagens` (os types gerados ainda não a
// conhecem) — tipos estruturais explícitos no molde de landing.ts, sem
// gastar o orçamento de type escapes. Ao regenerar os types, remova.
type ResultadoDb<T> = PromiseLike<{
  data: T | null;
  error: { code?: string; message?: string } | null;
}>;
type MensagensTable = {
  insert: (row: Record<string, unknown>) => ResultadoDb<unknown>;
  update: (row: Record<string, unknown>) => {
    eq: (
      col: string,
      v: string,
    ) => { select: (cols: string) => ResultadoDb<Array<{ id: string }>> };
  };
};
type MensageriaHolder = { from: unknown; rpc: unknown };
type FromMensagens = (tabela: "mensagens") => MensagensTable;
type RpcBuscaLead = (
  fn: "buscar_lead_ativo_por_telefone_global",
  args: { _telefone: string },
) => ResultadoDb<string>;

function tabelaMensagens(client: MensageriaHolder): MensagensTable {
  return (client.from as FromMensagens).call(client, "mensagens");
}

function buscarLeadPorTelefone(client: MensageriaHolder, digits: string): ResultadoDb<string> {
  return (client.rpc as RpcBuscaLead).call(client, "buscar_lead_ativo_por_telefone_global", {
    _telefone: digits,
  });
}

function secretConfigurado(): string | null {
  const s = process.env.WHATSAPP_WEBHOOK_SECRET ?? "";
  return s.length >= 16 ? s : null;
}

function secretConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function json(data: Record<string, unknown>, status = 200): Response {
  return Response.json(data, { status });
}

export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const esperado = secretConfigurado();
        if (!esperado) return json({ ok: false, error: "service_unavailable" }, 503);
        if (!secretConfere(request.headers.get("x-webhook-secret"), esperado)) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }

        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) {
          return json({ ok: false, error: "payload_too_large" }, 413);
        }
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }

        const parsed = parseWebhookWhatsApp(body);
        if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);
        const evento = parsed.evento;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (evento.tipo === "status") {
          const { data, error } = await tabelaMensagens(supabaseAdmin)
            .update({ status: evento.status, erro: evento.erro })
            .eq("provider_message_id", evento.providerMessageId)
            .select("id");
          if (error) return json({ ok: false, error: "temporarily_unavailable" }, 503);
          // Status de mensagem que o CRM não conhece não é erro do n8n:
          // responde ok para não gerar retry infinito, mas sinaliza.
          return json({ ok: true, atualizadas: (data ?? []).length });
        }

        // Mesma resolução de telefone do webhook de leads (dedup global,
        // status <> perdido) — um número, um lead ativo.
        const { data: leadId, error: leadErr } = await buscarLeadPorTelefone(
          supabaseAdmin,
          evento.telefoneDigits,
        );
        if (leadErr) return json({ ok: false, error: "temporarily_unavailable" }, 503);
        if (!leadId) {
          // n8n decide o destino (ex.: intake de lead novo + reenvio).
          return json({ ok: true, lead: "nao_encontrado" }, 200);
        }

        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id, corretor_id")
          .eq("id", leadId)
          .maybeSingle();

        // Devolução ao Marquinhos ativa (migration 20261106120000). Banco sem a
        // migration: a RPC não existe, devolucaoId fica null e a entrada segue
        // exatamente como antes (as colunas novas nem entram no insert).
        const { data: devolucaoId } = await supabaseAdmin.rpc("marquinhos_devolucao_ativa", {
          _lead_id: leadId,
        });
        const saidaDoRobo = evento.direcao === "saida";

        const { error: insErr } = await tabelaMensagens(supabaseAdmin).insert({
          lead_id: leadId,
          corretor_id: saidaDoRobo ? null : (lead?.corretor_id ?? null),
          direcao: evento.direcao,
          canal: "whatsapp",
          provider: evento.provider,
          provider_message_id: evento.providerMessageId,
          status: saidaDoRobo ? "enviada" : "recebida",
          conteudo: evento.conteudo,
          midia_url: evento.midiaUrl,
          criado_em: evento.ocorridoEm ?? undefined,
          ...(saidaDoRobo ? { agente: evento.agente } : {}),
          ...(devolucaoId ? { devolucao_id: devolucaoId } : {}),
        });
        if (insErr) {
          const code = (insErr as { code?: string }).code;
          // 23505 = replay do provedor/n8n: a mensagem já está gravada (e a
          // interacao também) — idempotência respondida como sucesso.
          if (code === "23505") {
            return json({ ok: true, duplicada: true });
          }
          // Saída de robô antes da migration (coluna agente ausente): ignora
          // com 200 para o n8n não reenviar em loop; nada do cliente se perde.
          if (saidaDoRobo && (code === "PGRST204" || code === "42703")) {
            return json({ ok: true, ignorada: "migracao_pendente" });
          }
          return json({ ok: false, error: "temporarily_unavailable" }, 503);
        }

        if (saidaDoRobo) {
          return json({
            ok: true,
            lead_id: leadId,
            agente: evento.agente,
            devolucao: devolucaoId ?? null,
          });
        }

        // Eco na timeline (melhor esforço): mantém a mensagem visível na
        // Timeline do dossiê e serve de redundância deliberada da fila
        // "Responder" — desde o Lote 3 a fonte única (conversas_aguardando_
        // resposta) lê mensagens E interacoes, então eco perdido não cega
        // nada. Se falhar, a mensagem está salva e a Central (7b) continua
        // íntegra — registra-se o erro na resposta para o n8n.
        const { error: ecoErr } = await supabaseAdmin.from("interacoes").insert({
          lead_id: leadId,
          autor_id: null,
          tipo: "whatsapp",
          direcao: "entrada",
          titulo: "Mensagem recebida (WhatsApp)",
          conteudo: previewMensagem(evento.conteudo, evento.midiaUrl),
          metadata: {
            fonte: "webhook_whatsapp",
            provider: evento.provider,
            provider_message_id: evento.providerMessageId,
          },
        });

        return json({ ok: true, lead_id: leadId, timeline: ecoErr ? "falhou" : "ok" });
      },
    },
  },
});
