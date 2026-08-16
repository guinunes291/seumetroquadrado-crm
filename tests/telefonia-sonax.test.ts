// Guarda da telefonia Sonax (discador): migration `chamadas` +
// profiles.ramal_sonax + fiação das edge functions sonax-discar (click-to-call,
// JWT/RLS) e sonax-webhook (URL de integração do PABX, secret + service_role).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/migrations/20260816120000_telefonia_sonax.sql"),
  "utf8",
);
const codigo = sql.replace(/--[^\n]*/g, "");
const configToml = readFileSync(join(root, "supabase/config.toml"), "utf8");
const fnDiscar = readFileSync(join(root, "supabase/functions/sonax-discar/index.ts"), "utf8");
const fnWebhook = readFileSync(join(root, "supabase/functions/sonax-webhook/index.ts"), "utf8");

describe("migration telefonia (chamadas + ramal_sonax)", () => {
  it("idempotência do webhook: provider_call_id com UNIQUE parcial", () => {
    expect(codigo).toContain("CREATE TABLE IF NOT EXISTS public.chamadas");
    expect(codigo).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*\(provider_call_id\)\s*WHERE provider_call_id IS NOT NULL/,
    );
  });

  it("checks fechados de direção/origem/status; dossiê e corretor indexados", () => {
    expect(codigo).toContain("CHECK (direcao IN ('entrada', 'saida'))");
    expect(codigo).toContain(
      "CHECK (origem IN ('click2call', 'campanha', 'receptivo', 'agendada'))",
    );
    expect(codigo).toMatch(/CHECK \(status IN \('iniciada', 'chamando', 'falando', 'atendida'/);
    expect(codigo).toMatch(/ON public\.chamadas \(lead_id, criado_em DESC\)/);
    expect(codigo).toMatch(/ON public\.chamadas \(corretor_id, criado_em DESC\)/);
  });

  it("RLS: leitura espelha o lead (receptivo sem lead não vaza entre carteiras)", () => {
    expect(codigo).toContain("ALTER TABLE public.chamadas ENABLE ROW LEVEL SECURITY");
    expect(codigo).toMatch(
      /chamadas_select[\s\S]*lead_id IS NOT NULL AND public\.pode_acessar_lead/,
    );
    expect(codigo).toMatch(/chamadas_select[\s\S]*corretor_id = \(SELECT auth\.uid\(\)\)/);
    expect(codigo).toContain("REVOKE ALL ON TABLE public.chamadas FROM PUBLIC, anon");
    expect(codigo).toContain("GRANT ALL ON TABLE public.chamadas TO service_role");
  });

  it("escrita do usuário: só SAÍDA, em nome próprio, no lead da carteira; UPDATE é do webhook", () => {
    expect(codigo).toMatch(
      /chamadas_insert_saida[\s\S]*WITH CHECK \(\s*direcao = 'saida'\s*AND corretor_id = \(SELECT auth\.uid\(\)\)/,
    );
    expect(codigo).not.toMatch(/FOR UPDATE TO authenticated/);
  });

  it("realtime ligado (status da chamada ao vivo), idempotente", () => {
    expect(codigo).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.chamadas");
    expect(codigo).toContain("WHEN duplicate_object THEN NULL");
  });

  it("ramal do corretor entra em profiles; trigger de mensagens é consertado", () => {
    expect(codigo).toContain(
      "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ramal_sonax text",
    );
    // Os helpers antigos gravam NEW.updated_at; tabelas com `atualizado_em`
    // precisam do tg_touch_atualizado_em (mensagens explodia em UPDATE).
    expect(codigo).toMatch(/tg_touch_atualizado_em[\s\S]*NEW\.atualizado_em := now\(\)/);
    expect(codigo).toMatch(/CREATE TRIGGER mensagens_set_updated_at[\s\S]*tg_touch_atualizado_em/);
    expect(codigo).toMatch(
      /CREATE TRIGGER chamadas_touch_atualizado_em[\s\S]*tg_touch_atualizado_em/,
    );
  });
});

describe("fiação das edge functions (config.toml)", () => {
  it("sonax-webhook é público (secret próprio); sonax-discar exige JWT", () => {
    expect(configToml).toMatch(/\[functions\.sonax-webhook\]\s*\nverify_jwt = false/);
    expect(configToml).toMatch(/\[functions\.sonax-discar\]\s*\nverify_jwt = true/);
  });
});

describe("sonax-discar (click-to-call)", () => {
  it("sem service_role: leitura do lead e inserts passam pela RLS do corretor", () => {
    expect(fnDiscar).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(fnDiscar).toContain("SUPABASE_ANON_KEY");
    expect(fnDiscar).toMatch(/Authorization: authorization/);
    expect(fnDiscar).toContain("conta_atual_ativa");
  });

  it("token do Sonax só via secret de env; opt-out do lead bloqueia a discagem", () => {
    expect(fnDiscar).toContain('Deno.env.get("SONAX_TOKEN")');
    expect(fnDiscar).toContain("lead_opt_out");
  });

  it("registra a chamada e ecoa na timeline como ligação de saída", () => {
    expect(fnDiscar).toMatch(/from\("chamadas"\)[\s\S]*origem: "click2call"/);
    expect(fnDiscar).toMatch(/from\("interacoes"\)[\s\S]*tipo: "ligacao"[\s\S]*direcao: "saida"/);
  });
});

describe("sonax-webhook (URL de integração do PABX)", () => {
  it("secret com comparação em tempo constante; query aceita por limitação do PABX, com kill-switch", () => {
    expect(fnWebhook).toContain("secretsIguais");
    expect(fnWebhook).toContain("SONAX_WEBHOOK_SECRET");
    expect(fnWebhook).toContain("SONAX_ALLOW_QUERY_SECRET");
    expect(fnWebhook).toContain('req.headers.get("x-webhook-secret")');
  });

  it("resolve lead pelo dedup global e corretor pelo ramal; idempotente por id_chamada", () => {
    expect(fnWebhook).toContain("buscar_lead_ativo_por_telefone_global");
    expect(fnWebhook).toContain("ramal_sonax");
    expect(fnWebhook).toContain("23505");
  });

  it("eco na timeline só na primeira gravação e só com lead casado", () => {
    expect(fnWebhook).toMatch(/if \(leadId\) \{[\s\S]*from\("interacoes"\)/);
    // Variável de template não substituída ("<NUMERO>") nunca vira dado.
    expect(fnWebhook).toMatch(/\^<\.\*>\$/);
  });
});

describe("aba Discador (fiação)", () => {
  const rota = readFileSync(join(root, "src/routes/_authenticated/discador.tsx"), "utf8");
  const pagina = readFileSync(join(root, "src/features/telefonia/discador-page.tsx"), "utf8");
  const clienteChamadas = readFileSync(
    join(root, "src/features/telefonia/chamadas-client.ts"),
    "utf8",
  );
  const sidebar = readFileSync(join(root, "src/components/app-sidebar.tsx"), "utf8");
  const routeTree = readFileSync(join(root, "src/routeTree.gen.ts"), "utf8");

  it("rota /discador existe, está na árvore gerada e no menu Atender", () => {
    expect(rota).toContain('createFileRoute("/_authenticated/discador")');
    expect(routeTree).toContain("discador");
    expect(sidebar).toMatch(/to: "\/discador"[\s\S]{0,40}label: "Discador"/);
  });

  it("página vive de `chamadas` com realtime e rediscagem pelo hook único", () => {
    expect(pagina).toContain('useRealtimeInvalidate("chamadas"');
    expect(pagina).toContain("useLigarLead");
    expect(pagina).toContain("listarChamadasRecentes");
    // Migration pendente mostra estado explicativo em vez de quebrar.
    expect(pagina).toContain("tabelaAusente");
    expect(clienteChamadas).toContain("tabelaAusente");
  });
});
