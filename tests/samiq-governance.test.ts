import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  estimateSamiQTokens,
  firstNameForSamiQ,
  minimizeSamiQContext,
  redactSamiQFreeText,
  redactSamiQPii,
} from "@/lib/samiq-governance";

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/20260711131000_samiq_governance.sql"),
  "utf8",
);
const handler = readFileSync(join(root, "src/lib/samiq.functions.ts"), "utf8");

describe("redação/minimização SamiQ", () => {
  it("remove e-mail, CPF, CNPJ, telefone, identificador longo e endereço", () => {
    const input =
      "Contato maria@example.com, CPF 123.456.789-00, CNPJ 12.345.678/0001-99, " +
      "fone (11) 91234-5678, protocolo 123456789012, nome: Maria da Silva e Rua das Flores 123";
    const redacted = redactSamiQPii(input);
    expect(redacted).toContain("[EMAIL]");
    expect(redacted).toContain("[CPF]");
    expect(redacted).toContain("[CNPJ]");
    expect(redacted).toContain("[TELEFONE]");
    expect(redacted).toContain("[IDENTIFICADOR]");
    expect(redacted).toContain("nome: [NOME]");
    expect(redacted).toContain("[ENDERECO]");
    for (const secret of [
      "maria@example.com",
      "123.456.789-00",
      "12.345.678/0001-99",
      "91234-5678",
      "123456789012",
      "Maria da Silva",
      "Rua das Flores",
    ]) {
      expect(redacted).not.toContain(secret);
    }
  });

  it("mantém somente o primeiro nome quando ele é necessário à sugestão", () => {
    expect(firstNameForSamiQ("  Maria da Silva  ")).toBe("Maria");
    expect(firstNameForSamiQ("11999999999")).toBeNull();
  });

  it("remove RG, CEP, nascimento e nomes completos de texto livre", () => {
    const redacted = redactSamiQFreeText(
      "Maria da Silva, RG 12.345.678-9, CEP 01234-567, nascimento: 03/04/1990",
    );
    expect(redacted).toContain("[NOME]");
    expect(redacted).toContain("[RG]");
    expect(redacted).toContain("[CEP]");
    expect(redacted).toContain("[DATA]");
    expect(redacted).not.toMatch(/Maria da Silva|12\.345\.678-9|01234-567|03\/04\/1990/);
  });

  it("remove PIS/PASEP e identificadores bancários de texto livre", () => {
    const redacted = redactSamiQFreeText(
      "PIS 123.45678.90-1, agência 1234-5, conta corrente 98765-4 e chave PIX cliente@banco.test",
    );
    expect(redacted).toContain("[PIS_PASEP]");
    expect(redacted).toContain("[DADO_BANCARIO]");
    expect(redacted).not.toMatch(/123\.45678\.90-1|1234-5|98765-4|cliente@banco\.test/);
  });

  it("remove chaves diretas de PII, limita arrays/strings e preserva catálogo público", () => {
    const minimized = minimizeSamiQContext(
      {
        primeiro_nome: "Maria",
        email: "maria@example.com",
        telefone: "11999999999",
        cpf: "12345678900",
        observacoes: "Ligar para (11) 98888-7777 " + "x".repeat(800),
        catalogo: [
          { nome: "Residencial Parque do Sol", cidade: "São Paulo" },
          { nome: "Outro projeto", cidade: "São Paulo" },
        ],
      },
      { maxArray: 1, maxString: 80 },
    ) as Record<string, unknown>;
    expect(minimized).not.toHaveProperty("email");
    expect(minimized).not.toHaveProperty("telefone");
    expect(minimized).not.toHaveProperty("cpf");
    expect(minimized.observacoes).toContain("[TELEFONE]");
    expect(String(minimized.observacoes).length).toBeLessThanOrEqual(80);
    expect(minimized.catalogo).toEqual([
      { nome: "Residencial Parque do Sol", cidade: "São Paulo" },
    ]);
  });

  it("estima tokens de forma conservadora sem depender do provider", () => {
    expect(estimateSamiQTokens("12345678")).toBe(2);
    expect(estimateSamiQTokens("")).toBe(1);
  });
});

describe("governança distribuída SamiQ", () => {
  it("versiona modelo, system prompt e instruções de todas as ações", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.samiq_prompt_versions");
    expect(migration).toContain("samiq-2026-07-v1");
    expect(migration).toContain("google/gemini-3-flash-preview");
    for (const action of [
      "resumo_cliente",
      "mensagem_sugerida",
      "responder_objecao",
      "proximo_passo",
      "projeto_ideal",
      "checklist_docs",
      "recuperar_frio",
      "script_ligacao",
      "analise_funil",
      "prioridade_dia",
      "pergunta_livre",
    ]) {
      expect(migration).toContain(`'${action}'`);
    }
  });

  it("serializa quotas de usuário/equipe e aplica budgets diários de token/custo", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("max_requests_user_10m");
    expect(migration).toContain("max_requests_team_10m");
    expect(migration).toContain("max_tokens_user_day");
    expect(migration).toContain("max_tokens_team_day");
    expect(migration).toContain("max_cost_user_micros_day");
    expect(migration).toContain("max_cost_team_micros_day");
    expect(migration).toContain("America/Sao_Paulo");
  });

  it("registra somente métricas operacionais, sem conteúdo nem identificador de lead", () => {
    const executionsTable = migration.match(
      /CREATE TABLE IF NOT EXISTS public\.samiq_execucoes[\s\S]*?CREATE INDEX/,
    )?.[0];
    expect(executionsTable).toBeTruthy();
    expect(executionsTable).toContain("input_tokens");
    expect(executionsTable).toContain("output_tokens");
    expect(executionsTable).toContain("estimated_cost_micros");
    expect(executionsTable).toContain("latency_ms");
    expect(executionsTable).not.toMatch(/lead_id|telefone|email|cpf|response_body|prompt_text/);
  });

  it("nega tabelas/RPCs ao browser e concede apenas ao service_role", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON public\.samiq_execucoes FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.samiq_reservar_execucao[\s\S]*FROM PUBLIC, anon, authenticated[\s\S]*TO service_role/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.samiq_finalizar_execucao[\s\S]*FROM PUBLIC, anon, authenticated[\s\S]*TO service_role/,
    );
  });

  it("o handler usa RPCs compactas, não usa Map local e nunca recebe ferramentas de escrita", () => {
    expect(handler).toContain("reserveSamiQExecution");
    expect(handler).toContain("finishSamiQExecution");
    expect(handler).toContain('supabase.rpc("pipeline_snapshot_v2"');
    expect(handler).toContain('supabase.rpc("atendimento_inbox_v2"');
    expect(handler).toContain("minimizeSamiQContext");
    expect(handler).not.toContain('from "@/lib/rate-limit"');
    expect(handler).not.toMatch(/\.limit\((1000|300)\)/);
    expect(handler).not.toMatch(/\.(insert|update|delete)\(/);
    expect(handler).not.toMatch(/\btools\s*:/);
    expect(handler).not.toContain('gateway("google/gemini');
    expect(handler).toContain("redactSamiQFreeText");
    expect(handler).not.toContain('select("tipo, direcao, titulo, conteudo, ocorreu_em")');
    expect(handler).not.toContain('select("tipo, status, observacoes")');
    expect(handler).not.toContain("lead.observacoes");
  });

  it("cobra a reserva conservadora quando uma execução expira sem telemetria", () => {
    expect(migration).toMatch(
      /error_code = 'reservation_expired'[\s\S]*input_tokens = reserved_input_tokens|input_tokens = reserved_input_tokens[\s\S]*error_code = 'reservation_expired'/,
    );
    expect(migration).toContain("output_tokens = reserved_output_tokens");
  });
});
