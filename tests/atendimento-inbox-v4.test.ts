// Contrato estático da migration atendimento_inbox_v4 + fiação da 6ª fila
// "confirmar_visita" (estrategia-2026-08, item 2.5 / tarefa #5b). Fonte lida
// como texto, padrão da casa; asserções de SQL rodam sem comentários para
// valer sobre o código, não sobre a prosa.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAtendimentoInbox } from "@/features/atendimento/inbox";

const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/migrations/20260809121000_atendimento_inbox_v4.sql"),
  "utf8",
);
const codigo = sql.replace(/--[^\n]*/g, "");
const route = readFileSync(join(root, "src/routes/_authenticated/atendimento.tsx"), "utf8");
const rpcBoundary = readFileSync(join(root, "src/features/atendimento/atendimento-rpc.ts"), "utf8");
const section = readFileSync(join(root, "src/features/atendimento/queue-section.tsx"), "utf8");

describe("atendimento_inbox_v4 (migration)", () => {
  it("a fila nova é um ramo do MESMO CASE, entre esfriando e docs — nunca UNION", () => {
    // O CASE é o dedup (cada lead numa fila só); UNION reintroduziria lead
    // duplicado e o parse do cliente é fail-closed para isso.
    expect(codigo).toMatch(
      /THEN 'esfriando'[\s\S]*?WHEN b\.visita_agendamento_id IS NOT NULL[\s\S]*?THEN 'confirmar_visita'[\s\S]*?THEN 'docs'/,
    );
    expect(codigo).not.toMatch(/\bUNION\b/);
    expect(codigo).toMatch(/\('confirmar_visita'::text, 5\)[\s\S]*\('docs'::text, 6\)/);
  });

  it("critério idêntico ao painel do gestor: visita 48h, agendado, sem auto_gerado", () => {
    expect(codigo).toContain("a.tipo = 'visita'");
    expect(codigo).toContain("a.auto_gerado = false");
    expect(codigo).toContain("a.status = 'agendado'");
    expect(codigo).toContain("BETWEEN _now AND _now + interval '48 hours'");
    expect(codigo).toContain("a.deleted_at IS NULL");
  });

  it("payload carrega agendamentoId/visitaEm e a fila desempata pela visita mais próxima", () => {
    expect(codigo).toContain("'agendamentoId', r.visita_agendamento_id");
    expect(codigo).toContain("'visitaEm', r.visita_em");
    expect(codigo).toMatch(/WHEN 'confirmar_visita' THEN r\.visita_em/);
  });

  it("mantém os guard-rails da v3 (escopo + grants)", () => {
    expect(codigo).toContain("public.is_active_member(_caller)");
    expect(codigo).toContain("public.pode_acessar_corretor(_caller, _target)");
    expect(codigo).toContain("public.pode_acessar_lead(_caller, l.id)");
    expect(codigo).toMatch(
      /REVOKE ALL ON FUNCTION public\.atendimento_inbox_v4[\s\S]*FROM PUBLIC, anon, service_role[\s\S]*TO authenticated/,
    );
  });
});

describe("fiação v4 → v3 → v2", () => {
  it("a rota tenta a v4 e cada degrau preenche a fila que a versão antiga não tem", () => {
    expect(rpcBoundary).toContain('"atendimento_inbox_v4"');
    expect(route).toContain('rpcAtendimentoInbox("v4"');
    expect(route).toContain('rpcAtendimentoInbox("v3"');
    expect(route).toContain('{ fila: "confirmar_visita", total_count: 0, items: [] }');
  });

  it("o botão [Confirmar] só existe com agendamentoId e confirma sem abrir formulário", () => {
    expect(section).toContain("item.agendamentoId && (");
    expect(section).toContain("onConfirmarVisita(item)");
    expect(route).toMatch(
      /from\("agendamentos"\)[\s\S]{0,80}\.update\(\{ status: "confirmado" \}\)/,
    );
    // Confirmou → inbox, agenda e badges atualizam juntos.
    expect(route).toContain('["atendimento:inbox"]');
    expect(route).toContain('["nav-badges"]');
  });
});

describe("parse do item com visita", () => {
  it("agendamentoId e visitaEm sobrevivem ao parse fail-closed", () => {
    const inbox = parseAtendimentoInbox([
      { fila: "novos", total_count: 0, items: [] },
      { fila: "responder", total_count: 0, items: [] },
      { fila: "followups", total_count: 0, items: [] },
      { fila: "esfriando", total_count: 0, items: [] },
      {
        fila: "confirmar_visita",
        total_count: 1,
        items: [
          {
            lead: {
              id: "00000000-0000-4000-8000-000000000002",
              nome: "Vera Cruz",
              telefone: "11988887777",
              email: null,
              status: "agendado",
              temperatura: "quente",
              ultima_interacao: "2026-08-08T12:00:00Z",
              proximo_followup: null,
              projeto_nome: "Residencial Sol",
              created_at: "2026-08-01T12:00:00Z",
              corretor_id: "00000000-0000-4000-8000-000000000010",
              origem: "site",
              renda_informada: null,
              entrada_disponivel: null,
              usa_fgts: false,
            },
            score: 51,
            tier: "media",
            motivo: "visita 10/08 às 14:00 ainda sem confirmação",
            docsPendentes: 0,
            agendamentoId: "00000000-0000-4000-8000-000000000099",
            visitaEm: "2026-08-10T17:00:00Z",
          },
        ],
      },
      { fila: "docs", total_count: 0, items: [] },
    ]);
    expect(inbox.counts.confirmar_visita).toBe(1);
    expect(inbox.filas.confirmar_visita[0].agendamentoId).toBe(
      "00000000-0000-4000-8000-000000000099",
    );
    expect(inbox.filas.confirmar_visita[0].visitaEm).toBe("2026-08-10T17:00:00Z");
  });
});
