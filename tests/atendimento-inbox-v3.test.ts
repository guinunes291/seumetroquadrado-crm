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
// Dono atual da fiação: a Fila Única (o modo Prioridade de /atendimento foi
// aposentado na Fatia 3 da carteira ativa). A cadeia v3 → v2 é a mesma.
const hook = readFileSync(join(root, "src/features/fila-unica/use-fila-unica.ts"), "utf8");
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
    { fila: "confirmar_visita", total_count: 0, items: [] },
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

describe("Fila Única — a consumidora da inbox", () => {
  it("chama a v3 com fallback para a v2 (fila de novos zerada) e nada quebra", () => {
    expect(rpcBoundary).toContain('"atendimento_inbox_v3"');
    expect(rpcBoundary).toContain('"atendimento_inbox_v2"');
    expect(hook).toContain("rpcWithFallback");
    expect(hook).toContain('rpcAtendimentoInbox("v3"');
    expect(hook).toContain('rpcAtendimentoInbox("v2"');
    expect(hook).toContain('{ fila: "novos", total_count: 0, items: [] }');
  });

  it("usa uma única RPC e não baixa leads/interações para agregar as filas", () => {
    expect(hook).not.toContain('.from("interacoes")');
    expect(hook).not.toContain("buildAtendimentoQueues");
    expect(hook).not.toMatch(/\.limit\((400|1000)\)/);
  });

  // A ordem mudou DE PROPÓSITO na Fila Única: o fundo do funil parado vem
  // antes de "chegaram agora" — "um lead em análise parado há 66 dias vale
  // mais do que 200 leads frios novos" (mockup aprovado em 12/09/2026). O que
  // continua valendo da v3 é que o lead novo EXISTE numa fila própria, que era
  // o buraco que a v3 veio tapar.
  it("o lead recém-distribuído continua tendo balde próprio (o buraco que a v3 tapou)", () => {
    const derive = readFileSync(join(root, "src/features/fila-unica/derive.ts"), "utf8");
    expect(derive).toMatch(/BUCKET_ORDER[\s\S]*"fundo"[\s\S]*"sla"/);
  });
});

describe("parseAtendimentoInbox (6 filas)", () => {
  it("preserva contagem total separada dos cards compactos", () => {
    const inbox = parseAtendimentoInbox(rows());
    expect(inbox.counts.novos).toBe(4);
    expect(inbox.filas.novos).toHaveLength(1);
    expect(inbox.filas.novos[0].lead.nome).toBe("Ana Souza");
    expect(inbox.filas.novos[0].motivo).toMatch(/primeiro contato/);
  });

  it("falha fechado para resposta incompleta ou fila duplicada", () => {
    expect(() => parseAtendimentoInbox(rows().slice(0, 5))).toThrow(/incompleta/);
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
