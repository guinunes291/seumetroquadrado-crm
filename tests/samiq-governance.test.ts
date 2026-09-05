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
const tools = readFileSync(join(root, "src/lib/samiq-tools.server.ts"), "utf8");
const memoria = readFileSync(join(root, "src/lib/samiq-memoria.server.ts"), "utf8");
const s1 = readFileSync(
  join(root, "supabase/migrations/20260906100000_samiq_copiloto_s1.sql"),
  "utf8",
);

const ACOES_CHAT = [
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
] as const;
const ACOES_UNIFICADAS = ["match_projetos", "resumo_lead", "mensagem_whatsapp"] as const;

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

  it("a versão v2 (IA unificada, item 0.6) carrega as 11 ações do chat + as 3 superfícies", () => {
    const v2 = readFileSync(
      join(process.cwd(), "supabase/migrations/20260808122000_ia_unificada_governanca.sql"),
      "utf8",
    );
    // Se uma ação do chat ficar de fora da versão ativa nova, o SamiQ quebra
    // inteiro em produção ("acao sem prompt versionado") — este teste é o guarda.
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
      "match_projetos",
      "resumo_lead",
      "mensagem_whatsapp",
    ]) {
      expect(v2).toContain(`'${action}'`);
    }
    // Uma versão ativa só: desativa a vigente antes de inserir a nova.
    expect(v2).toMatch(/UPDATE public\.samiq_prompt_versions SET active = false/);
    expect(v2).toContain("'samiq-2026-08-v2'");
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

  it("o handler usa RPCs compactas, não usa Map local e só recebe ferramentas de LEITURA", () => {
    expect(handler).toContain("reserveSamiQExecution");
    expect(handler).toContain("finishSamiQExecution");
    expect(handler).toContain('supabase.rpc("pipeline_snapshot_v2"');
    expect(handler).toContain('supabase.rpc("atendimento_inbox_v2"');
    expect(handler).toContain("minimizeSamiQContext");
    expect(handler).not.toContain('from "@/lib/rate-limit"');
    expect(handler).not.toMatch(/\.limit\((1000|300)\)/);
    expect(handler).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    // Onda S1 (D9/D10): ferramentas entram SÓ pelo catálogo de leitura, e só
    // quando a versão de prompt ativa autoriza — a v2 no ar mantém o chat antigo.
    expect(handler).toContain("criarFerramentasSamiQ");
    expect(handler).toMatch(/reservation\.toolsEnabled/);
    expect(handler).toContain("stopWhen: stepCountIs(reservation.maxToolSteps)");
    expect(handler).not.toContain('gateway("google/gemini');
    expect(handler).toContain("redactSamiQFreeText");
    expect(handler).not.toContain('select("tipo, direcao, titulo, conteudo, ocorreu_em")');
    expect(handler).not.toContain('select("tipo, status, observacoes")');
    expect(handler).not.toContain("lead.observacoes");
  });

  it("o catálogo de ferramentas só LÊ, com o supabase do usuário (RLS) — nunca escreve", () => {
    expect(tools).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    expect(tools).not.toMatch(
      /rpc\("(transicionar_lead|marcar_lead_perdido|aprovar_venda|distribuir_|samiq_gravar_turno)/,
    );
    expect(tools).not.toContain("supabaseAdmin");
    expect(tools).not.toContain('from "@/integrations/supabase/client.server"');
    for (const name of [
      "buscar_clientes",
      "detalhe_cliente",
      "minha_agenda",
      "minhas_tarefas",
      "meu_funil",
      "minha_fila",
      "documentos_do_cliente",
      "catalogo_projetos",
    ]) {
      expect(tools).toContain(`${name}: tool({`);
    }
    // Contato do cliente nunca sai para o modelo, nem pelas ferramentas.
    expect(tools).not.toMatch(/select\([^)]*\b(telefone|cpf|email)\b/);
  });

  it("a memória grava só pela RPC do servidor, com PII redigida antes", () => {
    expect(memoria).toContain('rpc("samiq_gravar_turno"');
    expect(memoria).toContain("redactSamiQPii(");
    expect(memoria).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });

  it("cobra a reserva conservadora quando uma execução expira sem telemetria", () => {
    expect(migration).toMatch(
      /error_code = 'reservation_expired'[\s\S]*input_tokens = reserved_input_tokens|input_tokens = reserved_input_tokens[\s\S]*error_code = 'reservation_expired'/,
    );
    expect(migration).toContain("output_tokens = reserved_output_tokens");
  });
});

describe("Onda S1 — ferramentas de leitura, memória e qualidade (migration 20260906100000)", () => {
  it("a v3 carrega as 14 ações, autoriza consulta e proíbe escrita no system prompt", () => {
    for (const action of [...ACOES_CHAT, ...ACOES_UNIFICADAS]) {
      expect(s1).toContain(`'${action}'`);
    }
    expect(s1).toContain("'samiq-2026-09-v3'");
    expect(s1).toContain("ADD COLUMN IF NOT EXISTS tools_enabled boolean NOT NULL DEFAULT false");
    expect(s1).toContain("ferramentas de LEITURA");
    expect(s1).toContain("NÃO tem ferramentas de escrita");
    expect(s1).toContain('"Não consegui"');
  });

  it("só cria e ativa a v3 se ela não existir (o kill switch por prompt_version não é desfeito)", () => {
    expect(s1).toMatch(
      /IF NOT EXISTS \(\s*SELECT 1 FROM public\.samiq_prompt_versions WHERE version = 'samiq-2026-09-v3'\s*\)/,
    );
  });

  it("política ganha teto de passos e tetos mensais por papel com percentual de alerta (D18)", () => {
    for (const col of [
      "max_tool_steps",
      "max_cost_corretor_micros_mes",
      "max_cost_gestor_micros_mes",
      "max_cost_equipe_micros_mes",
      "alerta_custo_pct",
    ]) {
      expect(s1).toContain(`ADD COLUMN IF NOT EXISTS ${col}`);
    }
    expect(s1).toContain("'user_cost_budget_month'");
    expect(s1).toContain("'team_cost_budget_month'");
    expect(s1).toMatch(/has_role\(_user_id, 'gestor'\)/);
  });

  it("execuções ganham métricas de ferramenta e fallback — ainda sem conteúdo nem lead", () => {
    const bloco = s1.match(/ALTER TABLE public\.samiq_execucoes[\s\S]*?;/)?.[0] ?? "";
    expect(bloco).toContain("tool_calls");
    expect(bloco).toContain("tool_errors");
    expect(bloco).toContain("fallback");
    expect(bloco).not.toMatch(/lead_id|telefone|conteudo|prompt_text/);
    expect(s1).toMatch(
      /_tool_calls integer DEFAULT 0,\s*_tool_errors integer DEFAULT 0,\s*_fallback boolean DEFAULT false/,
    );
  });

  it("memória: cada usuário lê/apaga só a sua; escrita só pelo servidor; retenção de 90 dias por cron", () => {
    expect(s1).toMatch(/samiq_conversas_select_proprias[\s\S]*?USING \(user_id = auth\.uid\(\)\)/);
    expect(s1).toMatch(
      /samiq_conversa_mensagens_select_proprias[\s\S]*?USING \(user_id = auth\.uid\(\)\)/,
    );
    expect(s1).toContain("GRANT SELECT, DELETE ON TABLE public.samiq_conversas TO authenticated");
    expect(s1).not.toMatch(/GRANT[^;]*INSERT[^;]*samiq_conversas[^;]*authenticated/);
    expect(s1).toMatch(
      /REVOKE ALL ON FUNCTION public\.samiq_gravar_turno[\s\S]*?FROM PUBLIC, anon, authenticated/,
    );
    expect(s1).toContain("'samiq-limpar-conversas'");
    expect(s1).toContain("interval '90 days'");
  });

  it("avaliação é do próprio usuário (auth.uid) e o painel de métricas exige gestão", () => {
    expect(s1).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.samiq_avaliar_execucao\(uuid, integer, text\)\s*TO authenticated, service_role/,
    );
    expect(s1).toMatch(/samiq_avaliar_execucao[\s\S]*?_uid uuid := auth\.uid\(\)/);
    expect(s1).toMatch(/samiq_metricas_periodo[\s\S]*?has_role\(_uid, 'admin'\)/);
    expect(s1).toMatch(/samiq_metricas_periodo[\s\S]*?has_role\(_uid, 'gestor'\)/);
  });

  it("a reserva devolve tools_enabled, max_tool_steps e custo_mes_pct no final da linha", () => {
    expect(s1).toMatch(
      /max_output_tokens integer,\s*tools_enabled boolean,\s*max_tool_steps integer,\s*custo_mes_pct integer\s*\)/,
    );
    expect(s1).toContain("_prompt.tools_enabled");
    expect(s1).toContain("_policy.max_tool_steps");
  });
});
