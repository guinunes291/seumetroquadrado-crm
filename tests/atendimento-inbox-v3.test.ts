import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAtendimentoInbox } from "@/features/atendimento/inbox";

// A razão de existir da v3: lead recém-distribuído (novo/aguardando_atendimento,
// sem interação registrada, sem follow-up, sem docs) não caía em NENHUMA fila
// da v2 — a tela de Atendimento abria eternamente "zerada" mesmo com o badge
// da sidebar contando a fila de entrada. A v3 acrescenta a fila "novos"
// (primeiro contato) e a régua única de esfriamento.

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/20260728110000_atendimento_inbox_v3.sql"),
  "utf8",
);
const route = readFileSync(join(root, "src/routes/_authenticated/atendimento.tsx"), "utf8");
const rpcBoundary = readFileSync(join(root, "src/features/atendimento/atendimento-rpc.ts"), "utf8");

const lead = {
  id: "00000000-0000-4000-8000-000000000001",
  nome: "Ana Souza",
  telefone: "11999999999",
  email: null,
  status: "aguardando_atendimento",
  temperatura: "quente",
  ultima_interacao: null,
  proximo_followup: null,
  projeto_nome: "Residencial Sol",
  created_at: "2026-07-27T10:00:00Z",
  corretor_id: "00000000-0000-4000-8000-000000000010",
  origem: "site",
  renda_informada: null,
  entrada_disponivel: null,
  usa_fgts: false,
};

function rows() {
  return [
    {
      fila: "novos",
      total_count: 4,
      items: [
        {
          lead,
          score: 53,
          tier: "media",
          motivo: "chegou há 2h e aguarda o primeiro contato",
          docsPendentes: 0,
        },
      ],
    },
    { fila: "responder", total_count: 0, items: [] },
    { fila: "followups", total_count: 0, items: [] },
    { fila: "esfriando", total_count: 0, items: [] },
    { fila: "docs", total_count: 0, items: [] },
  ];
}

describe("atendimento_inbox_v3 (migration)", () => {
  it("classifica lead novo/aguardando_atendimento na fila 'novos' ANTES das demais", () => {
    expect(migration).toMatch(
      /WHEN b\.status IN \([\s\S]*'novo'[\s\S]*'aguardando_atendimento'[\s\S]*THEN 'novos'[\s\S]*WHEN b\.ultima_direcao = 'entrada'[\s\S]*THEN 'responder'[\s\S]*THEN 'followups'[\s\S]*THEN 'esfriando'[\s\S]*THEN 'docs'/,
    );
    expect(migration).toMatch(/\('novos'::text, 1\)/);
  });

  it("usa a régua única de contato — lead sem interação registrada também esfria", () => {
    expect(migration).toContain("COALESCE(l.ultima_interacao, l.ultimo_contato, l.created_at)");
  });

  it("explica o motivo e desempata a fila de novos do mais antigo para o mais recente", () => {
    expect(migration).toContain("' e aguarda o primeiro contato'");
    expect(migration).toMatch(/CASE r\.fila\s*WHEN 'novos' THEN r\.created_at/);
  });

  it("preserva os pesos de score e os tiers da v2", () => {
    for (const fragment of [
      "WHEN 'quente' THEN 35",
      "WHEN 'morno' THEN 15",
      "WHEN 'analise_credito' THEN 25",
      "WHEN 'visita_realizada' THEN 22",
      "WHEN 'agendado' THEN 16",
      "WHEN 'em_atendimento' THEN 12",
      "WHEN 'aguardando_atendimento' THEN 6",
      "WHEN 'novo' THEN 6",
    ]) {
      expect(migration).toContain(fragment);
    }
    expect(migration).toMatch(/WHEN c\.score >= 60 THEN 'alta'[\s\S]*>= 35 THEN 'media'/);
  });

  it("conta a carteira inteira mas limita somente o payload de cada fila", () => {
    expect(migration).toContain("count(*)::bigint AS total_count");
    expect(migration).toContain("FILTER (WHERE r.row_number <= _take)");
    expect(migration).toContain("LEAST(GREATEST(COALESCE(_limit_per_queue, 15), 1), 30)");
  });

  it("exige conta ativa e escopo do corretor em vez de confiar no cliente", () => {
    expect(migration).toContain("public.is_active_member(_caller)");
    expect(migration).toContain("public.pode_acessar_corretor(_caller, _target)");
    expect(migration).toContain("public.pode_acessar_lead(_caller, l.id)");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.atendimento_inbox_v3[\s\S]*FROM PUBLIC, anon, service_role[\s\S]*TO authenticated/,
    );
  });
});

describe("rota de Atendimento", () => {
  it("chama a v3 com fallback para a v2 (fila de novos zerada) e nada quebra", () => {
    expect(rpcBoundary).toContain('"atendimento_inbox_v3"');
    expect(rpcBoundary).toContain('"atendimento_inbox_v2"');
    expect(route).toContain("rpcWithFallback");
    expect(route).toContain('rpcAtendimentoInbox("v3"');
    expect(route).toContain('rpcAtendimentoInbox("v2"');
    expect(route).toContain('{ fila: "novos", total_count: 0, items: [] }');
  });

  it("usa uma única RPC e não baixa leads/interações para agregar", () => {
    expect(route).not.toContain('.from("leads")');
    expect(route).not.toContain('.from("interacoes")');
    expect(route).not.toContain("buildAtendimentoQueues");
    expect(route).not.toMatch(/\.limit\((400|1000)\)/);
  });

  it("exibe a fila de novos em primeiro na tela", () => {
    expect(route).toMatch(/key: "novos"[\s\S]*key: "responder"[\s\S]*key: "followups"/);
  });
});

describe("parseAtendimentoInbox (5 filas)", () => {
  it("preserva contagem total separada dos cards compactos", () => {
    const inbox = parseAtendimentoInbox(rows());
    expect(inbox.counts.novos).toBe(4);
    expect(inbox.filas.novos).toHaveLength(1);
    expect(inbox.filas.novos[0].lead.nome).toBe("Ana Souza");
    expect(inbox.filas.novos[0].motivo).toMatch(/primeiro contato/);
  });

  it("falha fechado para resposta incompleta ou fila duplicada", () => {
    expect(() => parseAtendimentoInbox(rows().slice(0, 4))).toThrow(/incompleta/);
    const duplicate = [...rows(), rows()[0]];
    expect(() => parseAtendimentoInbox(duplicate)).toThrow(/duplicada/);

    const duplicateLead = rows();
    duplicateLead[1] = {
      fila: "responder",
      total_count: 1,
      items: [duplicateLead[0].items[0]],
    };
    expect(() => parseAtendimentoInbox(duplicateLead)).toThrow(/Lead duplicado/);
  });

  it("rejeita score e shape inválidos em vez de exibir inbox vazia", () => {
    const invalid = rows();
    invalid[0].items[0].score = 101;
    expect(() => parseAtendimentoInbox(invalid)).toThrow();

    const inconsistent = rows();
    inconsistent[1].total_count = 3;
    expect(() => parseAtendimentoInbox(inconsistent)).toThrow(/Contagem/);
  });
});
