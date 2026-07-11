import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAtendimentoInbox } from "@/features/atendimento/inbox";

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/20260711127000_atendimento_inbox_v2.sql"),
  "utf8",
);
const route = readFileSync(join(root, "src/routes/_authenticated/atendimento.tsx"), "utf8");

const lead = {
  id: "00000000-0000-4000-8000-000000000001",
  nome: "Ana Souza",
  telefone: "11999999999",
  email: null,
  status: "em_atendimento",
  temperatura: "quente",
  ultima_interacao: "2026-07-10T10:00:00Z",
  proximo_followup: null,
  projeto_nome: "Residencial Sol",
  created_at: "2026-07-01T10:00:00Z",
  corretor_id: "00000000-0000-4000-8000-000000000010",
  origem: "site",
  renda_informada: null,
  entrada_disponivel: null,
  usa_fgts: false,
};

function rows() {
  return [
    {
      fila: "responder",
      total_count: 27,
      items: [
        {
          lead,
          score: 67,
          tier: "alta",
          motivo: "respondeu há 5min e aguarda retorno",
          docsPendentes: 0,
        },
      ],
    },
    { fila: "followups", total_count: 0, items: [] },
    { fila: "esfriando", total_count: 0, items: [] },
    { fila: "docs", total_count: 0, items: [] },
  ];
}

describe("atendimento_inbox_v2", () => {
  it("deduplica no SQL pela última interação e pela prioridade das filas", () => {
    expect(migration).toContain("LEFT JOIN LATERAL");
    expect(migration).toContain("ORDER BY i.ocorreu_em DESC, i.id DESC");
    expect(migration).toMatch(
      /WHEN b\.ultima_direcao = 'entrada'[\s\S]*THEN 'responder'[\s\S]*WHEN b\.proximo_followup[\s\S]*THEN 'followups'[\s\S]*THEN 'esfriando'[\s\S]*THEN 'docs'/,
    );
    expect(migration).toContain("row_number() OVER");
    expect(migration).toContain("PARTITION BY r.fila");
  });

  it("conta a carteira inteira mas limita somente o payload de cada fila", () => {
    expect(migration).toContain("count(*)::bigint AS total_count");
    expect(migration).toContain("FILTER (WHERE r.row_number <= _take)");
    expect(migration).toContain("LEAST(GREATEST(COALESCE(_limit_per_queue, 15), 1), 30)");
    expect(migration).not.toMatch(/LIMIT\s+(400|1000)\b/);
  });

  it("mantém no SQL os pesos e tiers usados pela UX atual", () => {
    for (const fragment of [
      "WHEN 'quente' THEN 35",
      "WHEN 'morno' THEN 15",
      "WHEN 'analise_credito' THEN 25",
      "WHEN 'visita_realizada' THEN 22",
      "WHEN 'agendado' THEN 16",
      "WHEN 'em_atendimento' THEN 12",
      "WHEN 'aguardando_retorno' THEN 10",
      "WHEN 'qualificado' THEN 10",
    ]) {
      expect(migration).toContain(fragment);
    }
    expect(migration).toMatch(/WHEN c\.score >= 60 THEN 'alta'[\s\S]*>= 35 THEN 'media'/);
  });

  it("exige conta ativa e escopo do corretor em vez de confiar no cliente", () => {
    expect(migration).toContain("public.is_active_member(_caller)");
    expect(migration).toContain("public.pode_acessar_corretor(_caller, _target)");
    expect(migration).toContain("public.pode_acessar_lead(_caller, l.id)");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.atendimento_inbox_v2[\s\S]*FROM PUBLIC, anon, service_role[\s\S]*TO authenticated/,
    );
  });

  it("a rota usa uma única RPC e não baixa leads/interações para agregar", () => {
    expect(route).toContain('supabase.rpc("atendimento_inbox_v2"');
    expect(route).not.toContain('.from("leads")');
    expect(route).not.toContain('.from("interacoes")');
    expect(route).not.toContain("buildAtendimentoQueues");
    expect(route).not.toMatch(/\.limit\((400|1000)\)/);
  });
});

describe("parseAtendimentoInbox", () => {
  it("preserva contagem total separada dos cards compactos", () => {
    const inbox = parseAtendimentoInbox(rows());
    expect(inbox.counts.responder).toBe(27);
    expect(inbox.filas.responder).toHaveLength(1);
    expect(inbox.filas.responder[0].lead.nome).toBe("Ana Souza");
  });

  it("falha fechado para resposta incompleta ou fila duplicada", () => {
    expect(() => parseAtendimentoInbox(rows().slice(0, 3))).toThrow(/incompleta/);
    const duplicate = [...rows(), rows()[0]];
    expect(() => parseAtendimentoInbox(duplicate)).toThrow(/duplicada/);

    const duplicateLead = rows();
    duplicateLead[1] = {
      fila: "followups",
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
