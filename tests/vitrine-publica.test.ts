import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  VITRINE_TOKEN_RE,
  createVitrineLinkInputSchema,
  isValidVitrineShortlist,
  parsePublicVitrineProjects,
  safePublicHttpUrl,
  toggleVitrineShortlist,
  vitrinePublicEventSchema,
} from "@/lib/vitrine-publica";
import { createVitrineTokenPair, hashVitrineToken } from "@/lib/vitrine-publica.server";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260711132000_vitrine_publica.sql"),
  "utf8",
);
const publicRoute = readFileSync(join(process.cwd(), "src/routes/api/public/vitrine.ts"), "utf8");
const publicServer = readFileSync(join(process.cwd(), "src/lib/vitrine-publica.server.ts"), "utf8");
const publicPage = readFileSync(join(process.cwd(), "src/routes/vitrine-publica.tsx"), "utf8");
const publicProjection = migration.slice(
  migration.indexOf("CREATE OR REPLACE FUNCTION public.obter_vitrine_publica"),
  migration.indexOf("CREATE OR REPLACE FUNCTION public.registrar_vitrine_evento"),
);

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID_2 = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID_3 = "33333333-3333-4333-8333-333333333333";

function publicProject(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    nome: "Residencial Aurora",
    construtora: "Construtora Exemplo",
    bairro: "Centro",
    cidade: "São Paulo",
    zona: "Centro",
    dorms_min: 2,
    dorms_max: 3,
    metragem_min: 45,
    metragem_max: 62,
    preco_a_partir: 350_000,
    sob_consulta: false,
    status_preco: "vigente",
    status_entrega: "Em obras",
    mes_entrega: 6,
    ano_entrega: 2028,
    renda_minima: 8_000,
    diferenciais: ["Próximo ao metrô"],
    book_url: "https://example.com/book.pdf",
    tabela_precos_url: "https://example.com/tabela.pdf",
    ...overrides,
  };
}

describe("token da Vitrine pública", () => {
  it("gera 256 bits e persiste apenas um SHA-256 determinístico", () => {
    const first = createVitrineTokenPair();
    const second = createVitrineTokenPair();

    expect(first.token).toMatch(VITRINE_TOKEN_RE);
    expect(first.token).toHaveLength(43);
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.tokenHash).toBe(hashVitrineToken(first.token));
    expect(second.token).not.toBe(first.token);
    expect(first.tokenHash).not.toContain(first.token);
  });
});

describe("contratos da shortlist e dos eventos", () => {
  it("aceita somente 2–3 projetos distintos e validade de até 30 dias", () => {
    expect(
      createVitrineLinkInputSchema.safeParse({
        lead_id: PROJECT_ID,
        project_ids: [PROJECT_ID, PROJECT_ID_2],
        expires_in_days: 7,
      }).success,
    ).toBe(true);
    expect(
      createVitrineLinkInputSchema.safeParse({
        lead_id: PROJECT_ID,
        project_ids: [PROJECT_ID],
      }).success,
    ).toBe(false);
    expect(
      createVitrineLinkInputSchema.safeParse({
        lead_id: PROJECT_ID,
        project_ids: [PROJECT_ID, PROJECT_ID],
      }).success,
    ).toBe(false);
    expect(
      createVitrineLinkInputSchema.safeParse({
        lead_id: PROJECT_ID,
        project_ids: [PROJECT_ID, PROJECT_ID_2],
        expires_in_days: 31,
      }).success,
    ).toBe(false);
  });

  it("não duplica nem deixa a shortlist passar de três itens", () => {
    expect(toggleVitrineShortlist([], PROJECT_ID)).toEqual([PROJECT_ID]);
    expect(toggleVitrineShortlist([PROJECT_ID], PROJECT_ID)).toEqual([]);
    const full = [PROJECT_ID, PROJECT_ID_2, PROJECT_ID_3];
    expect(toggleVitrineShortlist(full, "44444444-4444-4444-8444-444444444444")).toEqual(full);
    expect(isValidVitrineShortlist([PROJECT_ID, PROJECT_ID_2])).toBe(true);
    expect(isValidVitrineShortlist([PROJECT_ID, PROJECT_ID])).toBe(false);
  });

  it("exige projeto para visualização e CTA allowlisted para clique", () => {
    expect(
      vitrinePublicEventSchema.safeParse({ type: "project_viewed", project_id: PROJECT_ID })
        .success,
    ).toBe(true);
    expect(
      vitrinePublicEventSchema.safeParse({
        type: "cta_clicked",
        project_id: PROJECT_ID,
        cta: "price_table",
      }).success,
    ).toBe(true);
    expect(
      vitrinePublicEventSchema.safeParse({ type: "cta_clicked", project_id: PROJECT_ID }).success,
    ).toBe(false);
  });
});

describe("projeção pública sem PII", () => {
  it("remove campos fora da allowlist e bloqueia esquemas de URL perigosos", () => {
    const projects = parsePublicVitrineProjects(
      [
        publicProject({
          book_url: "javascript:alert(1)",
          lead_id: "segredo",
          telefone: "11999999999",
          token_hash: "hash-interno",
          webhook_token: "token-interno",
          observacoes: "nota interna",
        }),
        publicProject({ id: PROJECT_ID_2, nome: "Residencial Horizonte" }),
      ],
      ["example.com"],
    );

    expect(projects[0].book_url).toBeNull();
    expect(projects[0]).not.toHaveProperty("lead_id");
    expect(projects[0]).not.toHaveProperty("telefone");
    expect(projects[0]).not.toHaveProperty("token_hash");
    expect(projects[0]).not.toHaveProperty("webhook_token");
    expect(projects[0]).not.toHaveProperty("observacoes");
    expect(safePublicHttpUrl("data:text/html,test", ["example.com"])).toBeNull();
    expect(safePublicHttpUrl("http://example.com/book.pdf", ["example.com"])).toBeNull();
    expect(safePublicHttpUrl("https://evil.example/book.pdf", ["example.com"])).toBeNull();
    expect(
      safePublicHttpUrl("https://example.com/book.pdf?token=secret#page=2", ["example.com"]),
    ).toBe("https://example.com/book.pdf");
  });
});

describe("migração da Vitrine pública", () => {
  it("reserva limite distribuído antes de qualquer leitura pública", () => {
    const consume = publicRoute.indexOf("consumePublicVitrineRequest");
    const load = publicRoute.indexOf("loadPublicVitrine");
    expect(consume).toBeGreaterThan(0);
    expect(load).toBeGreaterThan(consume);
    expect(publicRoute).toContain("request_id: z.string().uuid()");
    expect(publicRoute).not.toContain('from "@/lib/rate-limit"');
    expect(publicRoute).not.toContain("x-forwarded-for");
  });

  it("distingue link ausente, teto permanente e indisponibilidade transitória", () => {
    expect(publicServer).toContain(
      'if (error) throw new VitrineRequestError(503, "limit_unavailable")',
    );
    expect(publicServer).toContain('if (data === "not_found")');
    expect(publicServer).toContain('new VitrineRequestError(410, "exhausted")');
    expect(publicRoute).toContain("error.status === 404 || error.status === 410");
    expect(publicRoute).toContain('error: "service_unavailable"');
  });

  it("preserva o token e oferece nova tentativa em falhas transitórias", () => {
    expect(publicPage).toContain("isUnavailableLink(vitrineQ.error)");
    expect(publicPage).toContain("vitrineQ.isError && !unavailableLink");
    expect(publicPage).toContain("Sua seleção continua válida");
    expect(publicPage).toContain("vitrineQ.refetch()");
    expect(publicPage).not.toContain(
      "if (vitrineQ.isError) sessionStorage.removeItem(SESSION_TOKEN_KEY)",
    );
  });

  it("fecha as tabelas e concede as funções apenas à service role", () => {
    for (const table of ["vitrine_links", "vitrine_link_projetos", "vitrine_link_eventos"]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
      expect(migration).toContain(`REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated`);
    }
    for (const fn of [
      "criar_vitrine_link",
      "revogar_vitrine_link",
      "listar_vitrine_links",
      "obter_vitrine_publica",
      "consumir_vitrine_requisicao",
      "registrar_vitrine_evento",
      "limpar_vitrine_eventos_expirados",
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn}`);
      expect(migration).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[\\s\\S]*TO service_role`),
      );
    }
  });

  it("valida carteira, 2–3 projetos ativos, expiração e hash no banco", () => {
    expect(migration).toMatch(/criar_vitrine_link[\s\S]*pode_acessar_lead\(_ator_id, _lead_id\)/);
    expect(migration).toContain("_quantidade < 2 OR _quantidade > 3");
    expect(migration).toContain("count(DISTINCT id)");
    expect(migration).toContain("p.ativo = true");
    expect(migration).toContain("_expira_em > now() + interval '30 days'");
    expect(migration).toContain("token_hash ~ '^[0-9a-f]{64}$'");
    expect(migration).not.toMatch(/\btoken\s+text\b/);
  });

  it("projeta somente dados comerciais permitidos e limita eventos no banco", () => {
    for (const forbidden of [
      "lead_id",
      "criado_por",
      "token_hash",
      "webhook_token",
      "observacoes",
      "argumentos_venda",
      "endereco",
      "telefone",
    ]) {
      expect(publicProjection).not.toContain(`'${forbidden}'`);
    }
    expect(migration).toContain("interval '1 minute'");
    expect(migration).toContain(") >= 120 THEN");
    expect(migration).toContain("vlp.projeto_id = _projeto_id");
    expect(migration).toContain("total_requisicoes >= 20000");
    expect(migration).toContain("_total_eventos >= 1000");
    expect(migration).toContain("idempotency_key = _idempotency_key");
    expect(migration).toContain("uq_vitrine_eventos_idempotencia");
    expect(migration).toContain("limpar_vitrine_eventos_expirados");
  });
});
