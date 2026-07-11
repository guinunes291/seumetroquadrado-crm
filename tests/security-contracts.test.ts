import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("mediação server-side de documentação", () => {
  const migration = read("supabase/migrations/20260711121500_documentacao_server_mediation.sql");
  const route = read("src/routes/api/documentacao.ts");
  const browser = read("src/lib/documentacao.ts");

  it("versiona arquivos imutáveis e restringe operações ao service_role", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.documentacao_versoes");
    expect(migration).toContain("uq_documentacao_versao_ativa");
    expect(migration).toContain(
      "REVOKE ALL ON public.documentacao_versoes FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toMatch(
      /registrar_documentacao_upload[\s\S]*GRANT EXECUTE[\s\S]*TO service_role/,
    );
  });

  it("usa nome aleatório, upsert false, limite de 15 MB e URL de cinco minutos", () => {
    expect(route).toContain("crypto.randomUUID()");
    expect(route).toContain("upsert: false");
    expect(route).toContain("15 * 1024 * 1024");
    expect(route).toContain("5 * 60");
    for (const mime of ["application/pdf", "image/jpeg", "image/png", "image/webp"]) {
      expect(route).toContain(mime);
    }
  });

  it("não mantém CRUD de Storage no código do navegador", () => {
    expect(browser).not.toMatch(/supabase\.storage\.from/);
    expect(browser).toContain("/api/documentacao");
  });
});

describe("invite-only operacional", () => {
  const config = read("supabase/config.toml");
  const migration = read("supabase/migrations/20260711123000_invite_operations.sql");
  const edgeFunction = read("supabase/functions/crm-convites/index.ts");

  it("desliga signup público e mantém a Edge Function com JWT", () => {
    expect(config).toMatch(/\[auth\][\s\S]*enable_signup = false/);
    expect(config).toMatch(/\[functions\.crm-convites\][\s\S]*verify_jwt = true/);
  });

  it("consome convite por e-mail e revoga sessões ao bloquear", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.ativar_convite_por_email");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.definir_status_conta");
    expect(migration).toContain("DELETE FROM auth.sessions WHERE user_id = _usuario_id");
    expect(migration).toContain("nao e permitido bloquear o ultimo admin ativo");
  });

  it("cria o convite com o cliente RLS do autor antes de usar service role", () => {
    const userInsert = edgeFunction.indexOf('.from("convites_crm")');
    const adminInvite = edgeFunction.indexOf("admin.auth.admin.inviteUserByEmail");
    expect(userInsert).toBeGreaterThan(0);
    expect(adminInvite).toBeGreaterThan(userInsert);
    expect(edgeFunction).toContain('body.acao === "definir_status"');
  });
});

describe("RLS das entidades relacionadas ao lead", () => {
  const migration = read("supabase/migrations/20260711123500_related_lead_rls.sql");

  it("propaga pode_acessar_lead para agenda, tarefas, timeline e operação", () => {
    for (const policy of [
      "agendamentos_select_carteira",
      "tarefas_select_carteira",
      "interacoes_select_carteira",
      "lead_status_transitions_select_carteira",
      "distribution_log_select_carteira",
      "visitas_select_carteira",
      "analises_select_carteira",
      "propostas_select_carteira",
      "oal_select_carteira",
      "copiloto_eventos_select_carteira",
    ]) {
      const position = migration.indexOf(`"${policy}"`);
      expect(position, policy).toBeGreaterThan(0);
      expect(migration.slice(position, position + 700), policy).toContain("pode_acessar_lead");
    }
  });

  it("não usa o corretor denormalizado para manter acesso após transferência", () => {
    for (const policy of [
      "agendamentos_select_carteira",
      "tarefas_select_carteira",
      "visitas_select_carteira",
      "propostas_select_carteira",
    ]) {
      const position = migration.indexOf(`CREATE POLICY "${policy}"`);
      const block = migration.slice(position, position + 500);
      expect(position, policy).toBeGreaterThan(0);
      expect(block, policy).toContain(
        "lead_id IS NOT NULL AND public.pode_acessar_lead(auth.uid(), lead_id)",
      );
      expect(block, policy).toContain(
        "lead_id IS NULL AND public.pode_acessar_corretor(auth.uid(), corretor_id)",
      );
    }
  });

  it("valida o responsável novo somente nas escritas de entidades ligadas", () => {
    for (const table of ["agendamentos", "tarefas", "visitas", "propostas"]) {
      const insert = migration.match(
        new RegExp(`CREATE POLICY "${table}_insert_carteira"[\\s\\S]*?;`),
      )?.[0];
      const update = migration.match(
        new RegExp(`CREATE POLICY "${table}_update_carteira"[\\s\\S]*?;`),
      )?.[0];
      expect(insert, `${table} insert`).toContain(
        "public.pode_atribuir_lead(auth.uid(), corretor_id)",
      );
      expect(update, `${table} update`).toContain("WITH CHECK");
      expect(update?.split("WITH CHECK")[1], `${table} update check`).toContain(
        "public.pode_atribuir_lead(auth.uid(), corretor_id)",
      );
      expect(update?.split("WITH CHECK")[0], `${table} update using`).not.toContain(
        "public.pode_atribuir_lead(auth.uid(), corretor_id)",
      );
    }
  });

  it("fecha buscas SECURITY DEFINER que antes ignoravam a equipe", () => {
    expect(migration).toMatch(
      /FUNCTION public\.detectar_duplicatas_leads[\s\S]*pode_acessar_lead\(auth\.uid\(\), l\.id\)/,
    );
    expect(migration).toMatch(
      /FUNCTION public\.mesclar_leads[\s\S]*pode_acessar_lead\(_caller, _lead_destino\)[\s\S]*pode_acessar_lead\(_caller, _lead_origem\)/,
    );
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.buscar_lead_duplicado(uuid, text) FROM authenticated",
    );
    expect(migration).toMatch(
      /FUNCTION public\._oferta_ativa_query[\s\S]*pode_acessar_lead\(auth\.uid\(\), l\.id\)[\s\S]*REVOKE ALL/,
    );
  });
});

describe("revisão cruzada de grants e mediação server-side", () => {
  const identity = read("supabase/migrations/20260711120000_invite_only_lead_access.sql");
  const related = read("supabase/migrations/20260711123500_related_lead_rls.sql");
  const documents = read("supabase/migrations/20260711121500_documentacao_server_mediation.sql");
  const documentRoute = read("src/routes/api/documentacao.ts");
  const landing = read("supabase/migrations/20260711126000_landing_webhook_hardening.sql");
  const push = read("supabase/migrations/20260711121000_push_outbox_claim.sql");

  it("não permite ao browser prolongar ou manipular estado de convite", () => {
    expect(identity).toContain("REVOKE UPDATE ON public.convites_crm FROM authenticated");
    expect(identity).not.toContain(
      "GRANT UPDATE (estado, expira_em) ON public.convites_crm TO authenticated",
    );
    expect(identity).toContain("expira_em <= now() + interval '30 days'");
  });

  it("remove todas as policies legadas cumulativas de análise de crédito", () => {
    for (const policy of [
      "analises_select_own_or_gestor",
      "analises_insert_auth",
      "analises_insert_own_or_gestor",
      "analises_update_own_or_gestor",
      "analises_delete_gestor",
    ]) {
      expect(related).toContain(`DROP POLICY IF EXISTS "${policy}"`);
    }
  });

  it("valida origem e destino dentro da RPC SECURITY DEFINER de transferência", () => {
    const transfer = related.match(
      /CREATE OR REPLACE FUNCTION public\.transferir_leads[\s\S]*?REVOKE ALL ON FUNCTION public\.transferir_leads/,
    )?.[0];
    expect(transfer).toBeTruthy();
    expect(transfer).toContain("public.pode_atribuir_lead(_caller, _corretor)");
    expect(transfer).toContain("public.pode_acessar_lead(_caller, _l.id)");
    expect(transfer).toContain("p.status_conta = 'ativa'::public.status_conta");
    expect(transfer).toMatch(
      /UPDATE public\.agendamentos[\s\S]*'agendado'::public\.agendamento_status[\s\S]*'confirmado'::public\.agendamento_status[\s\S]*'remarcado'::public\.agendamento_status/,
    );
    expect(transfer).toMatch(
      /UPDATE public\.tarefas[\s\S]*'pendente'::public\.tarefa_status[\s\S]*'em_andamento'::public\.tarefa_status/,
    );
    const sla = related.match(
      /CREATE OR REPLACE FUNCTION public\.disparar_repasse_sla_lead[\s\S]*?REVOKE ALL ON FUNCTION public\.disparar_repasse_sla_lead/,
    )?.[0];
    expect(sla).toContain("public.pode_acessar_lead(_caller, _lead_id)");
  });

  it("só assina e remove caminho pertencente à versão ativa do documento", () => {
    expect(documents).toContain("REVOKE DELETE ON public.documentacoes FROM authenticated");
    expect(documents).toMatch(
      /JOIN public\.documentacao_versoes AS v[\s\S]*v\.documentacao_id = d\.id[\s\S]*v\.lead_id = d\.lead_id[\s\S]*v\.ativa[\s\S]*v\.object_path = d\.url/,
    );
    expect(documentRoute).toContain('.from("documentacao_versoes")');
    expect(documentRoute).toContain('.eq("object_path", doc.url)');
    expect(documentRoute).toContain('.eq("ativa", true)');
    expect(documentRoute).toContain("createSignedUrl(activeVersion.object_path");
  });

  it("reserva hashes de idempotência da landing ao servidor", () => {
    expect(landing).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.leads_landing FROM authenticated",
    );
    expect(landing).toContain("GRANT UPDATE (status) ON public.leads_landing TO authenticated");
  });

  it("fecha injeção pública de push e nega JWT de conta bloqueada", () => {
    expect(push).toMatch(/FUNCTION public\.enqueue_push[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(push).toMatch(
      /FUNCTION public\.gerar_pushes_agendamentos_proximos\(\)[\s\S]*FROM PUBLIC, anon, authenticated/,
    );
    expect(push).toMatch(
      /users read own push outbox[\s\S]*public\.is_active_member\(auth\.uid\(\)\)/,
    );
    expect(push).toMatch(
      /users manage own push subs[\s\S]*public\.is_active_member\(auth\.uid\(\)\)/,
    );
  });
});
