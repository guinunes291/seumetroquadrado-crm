// Guarda da etapa "Qualificação Corretor" (pedido do dono, 2026-08-11):
// entra entre "Aguardando retorno" e "Em atendimento". Vigia as duas
// migrations (ADD VALUE em transação própria + fiação de TODAS as funções
// vivas que enumeram etapas) e os espelhos do front — a regra da casa é que
// máquina de estados, ordem do funil e pesos de score NUNCA divergem entre
// banco e UI.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flattenDashboardKpis } from "@/features/dashboard/derive";
import { ETAPAS_RADAR } from "@/lib/fechamento";
import { followUpParaStatus } from "@/lib/follow-up";
import {
  FUNNEL_STAGES,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_ORDER,
  PROXIMA_ACAO,
  transicaoLeadPermitida,
} from "@/lib/leads";
import { scoreLead } from "@/lib/priority";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const semComentarios = (sql: string) => sql.replace(/--[^\n]*/g, "");

const migEnum = read("supabase/migrations/20260811150000_funil_add_qualificacao_corretor.sql");
const migFiacao = semComentarios(
  read("supabase/migrations/20260811151000_funil_qualificacao_corretor_fiacao.sql"),
);
const fechamentoSrc = read("src/lib/fechamento.ts");
const relatorios = read("src/features/dashboard/relatorios-view.tsx");
const types = read("src/integrations/supabase/types.ts");

const ocorrencias = (texto: string, re: RegExp) => (texto.match(re) ?? []).length;

describe("migrations da etapa (ADD VALUE separado da fiação)", () => {
  it("parte 1: só o ADD VALUE — precisa commitar antes de qualquer uso", () => {
    expect(migEnum).toContain(
      "ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'qualificacao_corretor'",
    );
    // Nada além do enum nesta migration (o uso fica na transação seguinte).
    expect(migEnum).not.toContain("CREATE OR REPLACE FUNCTION");
  });

  it("máquina de estados: a etapa tem saídas próprias e entra onde em_atendimento entra", () => {
    expect(migFiacao).toContain(
      "WHEN p_de::text = 'qualificacao_corretor'\n      THEN p_para::text = ANY (ARRAY['em_atendimento','aguardando_retorno','qualificado','agendado','visita_realizada','analise_credito','perdido'])",
    );
    // Reativação (gestão) também alcança a qualificação.
    expect(migFiacao).toContain(
      "ARRAY['em_atendimento','aguardando_retorno','qualificacao_corretor']",
    );
    // contrato_fechado segue restrito — a etapa nova NÃO entra lá.
    expect(migFiacao).toContain("ARRAY['pos_venda','analise_credito']");
  });

  it("transicionar_lead: a etapa exige próxima ação ou follow-up (disciplina do miolo)", () => {
    expect(migFiacao).toMatch(
      /IF p_novo_status IN \(\s*'em_atendimento'::public\.lead_status, 'aguardando_retorno'::public\.lead_status,\s*'qualificacao_corretor'::public\.lead_status,/,
    );
  });

  it("funil_ordem: posição comercial 3, com o restante renumerado", () => {
    expect(migFiacao).toMatch(/WHEN 'qualificacao_corretor'\s+THEN 3/);
    expect(migFiacao).toMatch(/WHEN 'em_atendimento'\s+THEN 4/);
    expect(migFiacao).toMatch(/WHEN 'contrato_fechado'\s+THEN 8/);
  });

  it("dashboard_kpis conta a etapa e dashboard_funil soma no degrau Em atendimento", () => {
    expect(migFiacao).toContain(
      "'qualificacao_corretor', count(*) FILTER (WHERE status = 'qualificacao_corretor')",
    );
    expect(migFiacao).toContain(
      "para_status IN ('em_atendimento','qualificado','aguardando_retorno','qualificacao_corretor')",
    );
  });

  it("score peso 11 nas DUAS filas (leads_filtered_v5 e atendimento_inbox_v4)", () => {
    expect(ocorrencias(migFiacao, /WHEN 'qualificacao_corretor' THEN 11/g)).toBe(2);
  });

  it("sort semântico por status renumerado na v5 (etapa em 4, perdido vai a 13)", () => {
    expect(migFiacao).toContain("WHEN 'qualificacao_corretor' THEN 4");
    expect(migFiacao).toContain("WHEN 'perdido' THEN 13");
  });

  it("radar de fechamento ganha a etapa (índice 15, entre os vizinhos) e reload do PostgREST", () => {
    expect(migFiacao).toContain(
      "('qualificacao_corretor'::public.lead_status, 15, 'Qualificacao do corretor'::text)",
    );
    expect(migFiacao).toContain("NOTIFY pgrst, 'reload schema'");
  });
});

describe("espelhos do front", () => {
  it("ordem do funil: exatamente entre aguardando_retorno e em_atendimento", () => {
    const i = LEAD_STATUS_ORDER.indexOf("qualificacao_corretor");
    expect(LEAD_STATUS_ORDER[i - 1]).toBe("aguardando_retorno");
    expect(LEAD_STATUS_ORDER[i + 1]).toBe("em_atendimento");
    expect(FUNNEL_STAGES).toContain("qualificacao_corretor");
    expect(LEAD_STATUS_LABEL.qualificacao_corretor).toBe("Qualificação Corretor");
  });

  it("máquina de estados espelhada: entradas, saídas e bloqueios", () => {
    expect(transicaoLeadPermitida("aguardando_atendimento", "qualificacao_corretor", false)).toBe(
      true,
    );
    expect(transicaoLeadPermitida("aguardando_retorno", "qualificacao_corretor", false)).toBe(true);
    expect(transicaoLeadPermitida("em_atendimento", "qualificacao_corretor", false)).toBe(true);
    expect(transicaoLeadPermitida("qualificacao_corretor", "em_atendimento", false)).toBe(true);
    expect(transicaoLeadPermitida("qualificacao_corretor", "agendado", false)).toBe(true);
    // Não pula direto para a venda nem volta para a fila de espera.
    expect(transicaoLeadPermitida("qualificacao_corretor", "contrato_fechado", false)).toBe(false);
    expect(transicaoLeadPermitida("qualificacao_corretor", "aguardando_atendimento", true)).toBe(
      false,
    );
    // Reativação é privilégio de gestão, como nos vizinhos.
    expect(transicaoLeadPermitida("perdido", "qualificacao_corretor", true)).toBe(true);
    expect(transicaoLeadPermitida("perdido", "qualificacao_corretor", false)).toBe(false);
    expect(transicaoLeadPermitida("contrato_fechado", "qualificacao_corretor", true)).toBe(false);
  });

  it("botão inteligente: da qualificação, o próximo passo é iniciar o atendimento", () => {
    expect(PROXIMA_ACAO.qualificacao_corretor).toEqual({
      label: "Iniciar atendimento",
      target: "em_atendimento",
    });
  });

  it("score: peso 11, estritamente entre aguardando_retorno (10) e em_atendimento (12)", () => {
    const agora = new Date("2026-08-11T12:00:00Z");
    const base = { ultimaInteracao: agora.toISOString(), agora };
    const s = (status: string) => scoreLead({ ...base, status }).score;
    expect(s("qualificacao_corretor")).toBe(11);
    expect(s("aguardando_retorno")).toBeLessThan(s("qualificacao_corretor"));
    expect(s("qualificacao_corretor")).toBeLessThan(s("em_atendimento"));
  });

  it("follow-up automático: mover para a etapa gera a tarefa de qualificar", () => {
    const t = followUpParaStatus("qualificacao_corretor", { nome: "Ana" });
    expect(t?.titulo).toContain("Qualificar Ana");
    expect(t?.prioridade).toBe("alta");
  });

  it("radar de fechamento: etapa na lista e índice-base 15 no heurístico", () => {
    expect(ETAPAS_RADAR).toContain("qualificacao_corretor");
    expect(fechamentoSrc).toContain("qualificacao_corretor: 15");
  });

  it("dashboard: flatten conta a etapa (0 sem a chave) e o Pipeline ganha o card", () => {
    const flat = flattenDashboardKpis({
      pipeline: { qualificacao_corretor: 5, em_atendimento: 2 },
      periodo: {},
    });
    expect(flat.qualificacao_corretor).toBe(5);
    expect(flattenDashboardKpis({ pipeline: {}, periodo: {} }).qualificacao_corretor).toBe(0);
    expect(relatorios).toContain('key: "qualificacao_corretor"');
    expect(relatorios).toContain("lg:grid-cols-9");
  });

  it("types gerados: o valor existe no enum tipado (cliente Supabase segue estrito)", () => {
    expect(ocorrencias(types, /"qualificacao_corretor"/g)).toBeGreaterThanOrEqual(2);
  });
});
