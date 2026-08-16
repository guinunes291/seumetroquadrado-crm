// Roletas por ZONA — contratos da migration 20260816120000 e da fiação.
// Decisão de produto (2026-08-16): a roleta É a zona. 4 roletas (Norte, Sul,
// Leste, Oeste) com time definido manualmente pela gestão; o motor roteia
// zona-primeiro (roleta_da_zona) e as campanhas delegam para a zona quando a
// roleta existe e está pronta. Zona sem roleta montada NUNCA engole lead —
// cai no fluxo por origem de sempre.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MIG = "supabase/migrations/20260816120000_roletas_por_zona.sql";
const mig = read(MIG);
const migSemComentario = mig.replace(/--[^\n]*/g, "");

describe("ordem e escopo da migration", () => {
  it("ordena DEPOIS das filas por zona de 2026-08-13 — o replay termina no zona-primeiro", () => {
    expect(MIG > "supabase/migrations/20260813100000_zonas_leads_resolucao.sql").toBe(true);
  });

  it("redefine os dois motores e cria o resolvedor de roleta por zona", () => {
    expect(mig).toContain("CREATE OR REPLACE FUNCTION public.roleta_da_zona(_zona text)");
    expect(mig).toContain("CREATE OR REPLACE FUNCTION public._distribuir_lead_v3(");
    expect(mig).toContain(
      "CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado(_lead_id uuid, _roleta_slug text)",
    );
  });

  it("não regride o fix P0: o INSERT vencedor segue gravando 'sucesso'", () => {
    expect(migSemComentario).toContain("_distribuido_por, _slug, _regra, 'sucesso')");
    expect(migSemComentario).not.toContain(", 'ok')");
  });
});

describe("seed das 4 roletas de zona", () => {
  it("cria zona-norte/sul/leste/oeste como tipo 'zona' — nunca 'campanha'", () => {
    for (const slug of ["zona-norte", "zona-sul", "zona-leste", "zona-oeste"]) {
      expect(mig).toContain(`'${slug}'`);
    }
    // tipo='zona' de propósito: o recálculo de tiers e os desvios de SLA
    // para o ponderado filtram tipo='campanha' e não podem capturá-las.
    expect(mig).toMatch(/'manual', true, 'zona', encode\(gen_random_bytes\(24\), 'hex'\)/);
    expect(mig).toMatch(/ON CONFLICT \(slug\) DO UPDATE\s*\n\s*SET tipo = 'zona'/);
  });

  it("replay preserva webhook_token já emitido", () => {
    expect(mig).toContain(
      "webhook_token = COALESCE(public.roletas.webhook_token, EXCLUDED.webhook_token)",
    );
  });
});

describe("mapeamento zonas_roletas", () => {
  it("tabela com CHECK das zonas canônicas e FK para roletas(slug)", () => {
    expect(mig).toContain("CREATE TABLE IF NOT EXISTS public.zonas_roletas");
    expect(mig).toContain("CHECK (zona IN ('Norte','Sul','Leste','Oeste','Centro'))");
    expect(mig).toContain("REFERENCES public.roletas(slug)");
  });

  it("seed mapeia as 4 zonas cardeais — Centro fica de fora por decisão", () => {
    expect(mig).toMatch(/\('Norte', 'zona-norte'\)/);
    expect(mig).toMatch(/\('Sul', 'zona-sul'\)/);
    expect(mig).toMatch(/\('Leste', 'zona-leste'\)/);
    expect(mig).toMatch(/\('Oeste', 'zona-oeste'\)/);
    expect(mig).not.toMatch(/\('Centro',/);
  });

  it("gestão edita, autenticado lê (mesma régua de zonas_bairros)", () => {
    expect(mig).toContain('"zonas_roletas leitura autenticada"');
    expect(mig).toContain('"zonas_roletas escrita gestao"');
    expect(mig).toMatch(/zonas_roletas ENABLE ROW LEVEL SECURITY/);
  });
});

describe("roleta_da_zona — roleta só vale se está pronta", () => {
  it("exige roleta ativa E participante ativo não pausado", () => {
    const fn = mig.slice(
      mig.indexOf("CREATE OR REPLACE FUNCTION public.roleta_da_zona"),
      mig.indexOf("GRANT EXECUTE ON FUNCTION public.roleta_da_zona"),
    );
    expect(fn).toContain("JOIN public.roletas r ON r.slug = zr.roleta_slug AND r.ativo");
    expect(fn).toContain("rp.ativo");
    expect(fn).toContain("rp.pausado_ate IS NULL OR rp.pausado_ate < now()");
  });
});

describe("motor v3 — roteamento zona-primeiro", () => {
  const v3 = mig.slice(
    mig.indexOf("CREATE OR REPLACE FUNCTION public._distribuir_lead_v3"),
    mig.indexOf("CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado"),
  );

  it("slug explícito > roleta da zona > origem/canal, nessa ordem", () => {
    expect(v3.replace(/\s+/g, " ")).toContain(
      "_slug := COALESCE(_roleta_slug, public.roleta_da_zona(_zona), public._resolver_roleta_lead(_lead.canal_entrada, _lead.origem))",
    );
  });

  it("a zona é resolvida ANTES do slug (senão o COALESCE olha zona nula)", () => {
    expect(v3.indexOf("_zona := public.zona_do_lead(_lead_id)")).toBeLessThan(
      v3.indexOf("_slug := COALESCE"),
    );
  });

  it("na roleta de zona o filtro por profiles.zonas é pulado (sem corte duplo)", () => {
    expect(v3.replace(/\s+/g, " ")).toContain(
      "IF _zona IS NOT NULL AND COALESCE(_roleta_tipo, '') <> 'zona'",
    );
  });

  it("distribuição por roleta de zona grava leads.roleta_slug (repasse SLA fica no time)", () => {
    expect(v3.replace(/\s+/g, " ")).toContain(
      "roleta_slug = CASE WHEN _roleta_tipo = 'zona' THEN _slug ELSE roleta_slug END",
    );
  });

  it("contexto auditável carrega o tipo da roleta", () => {
    expect(v3).toContain("'roleta_tipo', _roleta_tipo");
  });
});

describe("campanhas delegam para a zona", () => {
  const pond = mig.slice(
    mig.indexOf("CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado"),
  );

  it("zona-primeiro roda DEPOIS da idempotência e ANTES do advisory lock do SWRR", () => {
    const delega = pond.indexOf("_zslug := public.roleta_da_zona(public.zona_do_lead(_lead_id))");
    expect(delega).toBeGreaterThan(pond.indexOf("'ja_atribuido'"));
    expect(delega).toBeLessThan(pond.indexOf("pg_advisory_xact_lock"));
  });

  it("delegação vai pelo motor v3 com gatilho próprio e a campanha no contexto", () => {
    expect(pond.replace(/\s+/g, " ")).toContain(
      "'campanha_zona', jsonb_build_object('campanha', _roleta_slug), true)",
    );
  });

  it("preserva as guardas de 20260719123000: idempotência e advisory lock", () => {
    expect(pond).toContain("pg_advisory_xact_lock(hashtext('roleta_swrr:'");
    expect(pond).toContain("'ja_atribuido'");
  });
});

describe("fiação de entrada (webhook por token)", () => {
  const rota = read("src/routes/api/public/webhooks/lead/$token.ts");

  it("token de roleta de zona é aceito ao lado do de campanha", () => {
    expect(rota).toContain('["campanha", "zona"].includes(campanha.tipo)');
  });

  it("payload ganha zona/bairro e o insert materializa (regiao da IA vira zona)", () => {
    expect(rota).toMatch(/zona: optStr\(120\)/);
    expect(rota).toMatch(/bairro: optStr\(255\)/);
    expect(rota).toContain("zona: data.zona ?? data.regiao ?? null");
    expect(rota).toContain("bairro: data.bairro ?? null");
  });

  it("rota de zona distribui pelo motor v3 (rodízio simples), não pelo SWRR de campanha", () => {
    expect(rota).toContain('campanha && campanha.tipo === "zona"');
    expect(rota).toContain('"distribuir_lead_v3"');
  });
});

describe("UI — a central conhece as roletas de zona", () => {
  it("aba 'zonas' registrada e slugs/labels das 4 zonas no vocabulário", () => {
    const cc = read("src/features/distribuicao/command-center.tsx");
    expect(cc).toContain('"zonas"');
    expect(cc).toContain("TabZonas");
    const lib = read("src/lib/distribuicao.ts");
    for (const slug of ["zona-norte", "zona-sul", "zona-leste", "zona-oeste"]) {
      expect(lib).toContain(`"${slug}"`);
    }
    expect(lib).toContain("Roleta Zona Norte");
  });
});
