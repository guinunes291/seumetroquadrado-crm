// Guarda da Fase 7a da mensageria (estrategia-2026-08, Onda C): tabela
// `mensagens` + webhook de entrada. Asserções de SQL rodam sem comentários;
// o parser do contrato é testado em runtime (puro).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseWebhookWhatsApp, previewMensagem } from "@/features/mensagens/webhook-contract";

const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/migrations/20260809150000_mensagens_whatsapp.sql"),
  "utf8",
);
const codigo = sql.replace(/--[^\n]*/g, "");
const rota = readFileSync(join(root, "src/routes/api/public/webhooks/whatsapp.ts"), "utf8");

describe("migration mensagens (7a)", () => {
  it("idempotência do webhook: provider_message_id com UNIQUE parcial", () => {
    expect(codigo).toContain("CREATE TABLE IF NOT EXISTS public.mensagens");
    expect(codigo).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*\(provider_message_id\)\s*WHERE provider_message_id IS NOT NULL/,
    );
  });

  it("checks fechados de direção e status; thread e fila indexadas", () => {
    expect(codigo).toContain("CHECK (direcao IN ('entrada', 'saida'))");
    expect(codigo).toContain(
      "CHECK (status IN ('fila', 'enviada', 'entregue', 'lida', 'falha', 'recebida'))",
    );
    expect(codigo).toMatch(/ON public\.mensagens \(lead_id, criado_em DESC\)/);
    expect(codigo).toMatch(/WHERE status = 'fila'/);
  });

  it("RLS espelha o acesso ao lead; entrada é exclusiva do webhook", () => {
    expect(codigo).toContain("ENABLE ROW LEVEL SECURITY");
    expect(codigo).toMatch(
      /FOR SELECT TO authenticated\s*USING \(public\.pode_acessar_lead\(auth\.uid\(\), lead_id\)\)/,
    );
    // Usuário autenticado só INSERE saída — nunca forja entrada nem status.
    expect(codigo).toMatch(
      /FOR INSERT TO authenticated\s*WITH CHECK \(direcao = 'saida' AND public\.pode_acessar_lead/,
    );
    expect(codigo).not.toMatch(/FOR UPDATE TO authenticated/);
    expect(codigo).toContain("REVOKE ALL ON TABLE public.mensagens FROM PUBLIC, anon");
  });

  it("realtime ligado para a Central (7b), idempotente", () => {
    expect(codigo).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens");
    expect(codigo).toContain("WHEN duplicate_object THEN NULL");
  });
});

describe("parseWebhookWhatsApp (contrato normalizado)", () => {
  const mensagemBase = {
    tipo: "mensagem",
    provider: "zapi",
    provider_message_id: "ABC123",
    telefone: "+55 (11) 99999-8888",
    conteudo: "Oi, ainda tem a unidade?",
  };

  it("normaliza mensagem: telefone vira dígitos, conteúdo trimado", () => {
    const r = parseWebhookWhatsApp(mensagemBase);
    expect(r.ok).toBe(true);
    if (!r.ok || r.evento.tipo !== "mensagem") throw new Error("esperava mensagem");
    expect(r.evento.telefoneDigits).toBe("5511999998888");
    expect(r.evento.providerMessageId).toBe("ABC123");
    expect(r.evento.conteudo).toBe("Oi, ainda tem a unidade?");
  });

  it("mensagem sem conteúdo E sem mídia é rejeitada; só mídia passa", () => {
    expect(parseWebhookWhatsApp({ ...mensagemBase, conteudo: "  " })).toMatchObject({
      ok: false,
      error: "mensagem_vazia",
    });
    const soMidia = parseWebhookWhatsApp({
      ...mensagemBase,
      conteudo: null,
      midia_url: "https://cdn.exemplo.com/a.jpg",
    });
    expect(soMidia.ok).toBe(true);
  });

  it("status atualiza pelo provider_message_id, com enum fechado", () => {
    const r = parseWebhookWhatsApp({
      tipo: "status",
      provider_message_id: "ABC123",
      status: "lida",
    });
    expect(r).toMatchObject({ ok: true, evento: { tipo: "status", status: "lida" } });
    expect(
      parseWebhookWhatsApp({ tipo: "status", provider_message_id: "ABC123", status: "sumida" }).ok,
    ).toBe(false);
  });

  it("fail-closed: shape desconhecido e telefone curto são erro, nunca gravação parcial", () => {
    expect(parseWebhookWhatsApp({ tipo: "outro" }).ok).toBe(false);
    expect(parseWebhookWhatsApp(null).ok).toBe(false);
    expect(parseWebhookWhatsApp({ ...mensagemBase, telefone: "119999" }).ok).toBe(false);
  });

  it("previewMensagem: 1 linha honesta para a timeline", () => {
    expect(previewMensagem("curta", null)).toBe("curta");
    expect(previewMensagem("x".repeat(200), null)).toHaveLength(140);
    expect(previewMensagem(null, "https://cdn/x.jpg")).toBe("[mídia recebida]");
  });
});

describe("rota do webhook (fiação)", () => {
  it("segredo por header com comparação em tempo constante — nunca em query", () => {
    expect(rota).toContain('request.headers.get("x-webhook-secret")');
    expect(rota).toContain("timingSafeEqual");
    expect(rota).toContain("WHATSAPP_WEBHOOK_SECRET");
    expect(rota).not.toMatch(/searchParams|\?secret/);
    // Sem env configurada o endpoint fecha (503), nunca aceita sem auth.
    expect(rota).toMatch(/service_unavailable/);
  });

  it("resolve o lead pelo dedup global e ecoa a entrada na fila Responder", () => {
    expect(rota).toContain("buscar_lead_ativo_por_telefone_global");
    expect(rota).toMatch(/from\("interacoes"\)\.insert\(\{/);
    expect(rota).toContain('direcao: "entrada"');
    expect(rota).toContain('tipo: "whatsapp"');
    // Replay idempotente e lead desconhecido nunca viram retry infinito.
    expect(rota).toContain('"23505"');
    expect(rota).toContain('lead: "nao_encontrado"');
    expect(rota).not.toContain('from("leads")\n          .insert');
  });
});
