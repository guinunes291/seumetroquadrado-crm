// Filas por zona — contratos da migration 20260813100000 e da fiação de
// entrada. Decisões de produto (2026-08-13): a zona do lead nasce da cascata
// zona explícita → bairro (tabela zonas_bairros) → projeto; campanhas também
// respeitam zona; sem apto na zona o motor cai para qualquer apto (fallback)
// em vez de mandar o lead para exceções; atribuição manual fora da zona vale,
// mas com aviso no retorno e divergência registrada no log.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MIG = "supabase/migrations/20260813100000_zonas_leads_resolucao.sql";
const mig = read(MIG);
const migSemComentario = mig.replace(/--[^\n]*/g, "");

describe("ordem e escopo da migration", () => {
  it("ordena DEPOIS do fix P0 do resultado — o replay termina com o fallback de zona", () => {
    expect(MIG > "supabase/migrations/20260811180000_fix_distribuir_v3_resultado_sucesso.sql").toBe(
      true,
    );
  });

  it("redefine os três pontos de escrita: motor v3, ponderada e criar_lead_dedup", () => {
    expect(mig).toContain("CREATE OR REPLACE FUNCTION public._distribuir_lead_v3(");
    expect(mig).toContain(
      "CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado(_lead_id uuid, _roleta_slug text)",
    );
    expect(mig).toContain("CREATE OR REPLACE FUNCTION public.criar_lead_dedup(_payload jsonb)");
  });

  it("não regride o fix P0: o INSERT vencedor segue gravando 'sucesso'", () => {
    expect(migSemComentario).toContain("_distribuido_por, _slug, _regra, 'sucesso')");
    expect(migSemComentario).not.toContain(", 'ok')");
  });
});

describe("cascata de resolução da zona do lead", () => {
  it("zona_do_lead: zona explícita → bairro → projeto, nessa ordem", () => {
    const fn = mig.slice(
      mig.indexOf("CREATE OR REPLACE FUNCTION public.zona_do_lead"),
      mig.indexOf("GRANT EXECUTE ON FUNCTION public.zona_do_lead"),
    );
    const iZona = fn.indexOf("public.zona_normalizar(l.zona)");
    const iBairro = fn.indexOf("public.zona_do_bairro(l.bairro)");
    const iProjeto = fn.indexOf("p.zona_smq");
    expect(iZona).toBeGreaterThan(-1);
    expect(iBairro).toBeGreaterThan(iZona);
    expect(iProjeto).toBeGreaterThan(iBairro);
  });

  it("trigger materializa a zona no INSERT e no UPDATE de zona/bairro", () => {
    expect(mig).toContain("BEFORE INSERT ON public.leads");
    expect(mig).toContain("BEFORE UPDATE OF zona, bairro ON public.leads");
    // Zona válida nunca é sobrescrita pelo bairro: normalizar(zona) vem
    // primeiro no COALESCE.
    expect(migSemComentario).toContain(
      "NEW.zona := COALESCE(public.zona_normalizar(NEW.zona), public.zona_do_bairro(NEW.bairro))",
    );
  });

  it("seed de zonas_bairros: chaves já normalizadas e as cinco zonas presentes", () => {
    for (const zona of ["'Norte'", "'Sul'", "'Leste'", "'Oeste'", "'Centro'"]) {
      expect(mig).toContain(`]), ${zona}\nON CONFLICT (bairro) DO NOTHING`);
    }
    const seeds = [...mig.matchAll(/'([a-z0-9 .]+)'(?=,|\n\]\))/g)].map((m) => m[1]);
    // Amostra de sanidade das três regiões mais usadas pela operação.
    for (const b of ["tucuruvi", "capao redondo", "itaquera", "pirituba", "bela vista"]) {
      expect(seeds).toContain(b);
    }
    // Nenhuma chave com maiúscula/acento — o lookup normaliza o texto do lead
    // para esse formato.
    const bloco = mig.slice(mig.indexOf("INSERT INTO public.zonas_bairros"), mig.indexOf("-- 2)"));
    expect(
      /[A-ZÀ-Ü]/.test(
        bloco
          .replace(/ON CONFLICT \(bairro\) DO NOTHING/g, "")
          .replace(
            /INSERT INTO public\.zonas_bairros \(bairro, zona\)|SELECT unnest\(ARRAY\[|'(Norte|Sul|Leste|Oeste|Centro)'/g,
            "",
          ),
      ),
    ).toBe(false);
  });

  it("gestão pode editar o mapeamento (RLS), leitura para todo autenticado", () => {
    expect(mig).toContain('"zonas_bairros leitura autenticada"');
    expect(mig).toContain('"zonas_bairros escrita gestao"');
    expect(mig).toContain("ALTER TABLE public.zonas_bairros ENABLE ROW LEVEL SECURITY");
  });
});

describe("motor v3: fallback e aviso", () => {
  const motor = mig.slice(
    mig.indexOf("CREATE OR REPLACE FUNCTION public._distribuir_lead_v3"),
    mig.indexOf("CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado"),
  );

  it("sem apto na zona → cai para qualquer apto (nunca trava só por zona)", () => {
    expect(motor).toContain("_zona_fallback := true");
    // O fallback preserva _aptos_ids: só troca quando a lista filtrada tem gente.
    const iCheck = motor.indexOf("COALESCE(array_length(_aptos_zona, 1), 0) > 0");
    const iAssign = motor.indexOf("_aptos_ids := _aptos_zona");
    expect(iCheck).toBeGreaterThan(-1);
    expect(iAssign).toBeGreaterThan(iCheck);
  });

  it("manual fora da zona: atribui, avisa e registra a divergência", () => {
    expect(motor).toContain("_divergencia_zona := true");
    expect(motor).toContain("'aviso_zona', CASE WHEN _divergencia_zona");
    expect(motor).toContain("'divergencia_zona', _divergencia_zona");
    // O motivo do log conta a história sozinho no Command Center.
    expect(motor).toContain("corretor fora da Zona");
    expect(motor).toContain("fallback para qualquer apto");
  });

  it("contexto auditável carrega zona e zona_fallback", () => {
    expect(motor).toContain("'zona', _zona");
    expect(motor).toContain("'zona_fallback', _zona_fallback");
  });
});

describe("roleta ponderada (campanhas): mesma régua de zona", () => {
  const ponderada = mig.slice(
    mig.indexOf("CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado"),
    mig.indexOf("CREATE OR REPLACE FUNCTION public.criar_lead_dedup"),
  );

  it("filtra por zona com fallback: só remove quem não atende se sobra alguém que atende", () => {
    const iCount = ponderada.indexOf("SELECT count(*) INTO _n_zona");
    const iGuard = ponderada.indexOf("IF _n_zona > 0 THEN");
    const iDelete = ponderada.indexOf("DELETE FROM _dlp_elegiveis");
    expect(iCount).toBeGreaterThan(-1);
    expect(iGuard).toBeGreaterThan(iCount);
    expect(iDelete).toBeGreaterThan(iGuard);
    // Corretor sem zona configurada atende todas — dos dois lados do filtro.
    expect(ponderada).toContain(
      "COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas)",
    );
  });

  it("o filtro roda ANTES do avanço do cursor SWRR (senão distorce o rodízio)", () => {
    const iDelete = ponderada.indexOf("DELETE FROM _dlp_elegiveis");
    const iSum = ponderada.indexOf("SELECT sum(peso) INTO _sum_pesos");
    const iSwrr = ponderada.indexOf("wrr_current + e.peso");
    expect(iDelete).toBeLessThan(iSum);
    expect(iSum).toBeLessThan(iSwrr);
  });

  it("preserva as guardas de 20260719123000: idempotência e advisory lock", () => {
    expect(ponderada).toContain("'ja_atribuido'");
    expect(ponderada).toContain("pg_advisory_xact_lock(hashtext('roleta_swrr:'");
  });
});

describe("criar_lead_dedup aceita zona/bairro", () => {
  const dedup = mig.slice(mig.indexOf("CREATE OR REPLACE FUNCTION public.criar_lead_dedup"));
  it("whitelist e INSERT ganham os dois campos", () => {
    expect(dedup).toContain("_payload->>'zona'");
    expect(dedup).toContain("_payload->>'bairro'");
    expect(dedup).toContain("corretor_id, status, zona, bairro");
  });
});

describe("fiação de entrada: os canais gravam zona/bairro", () => {
  it("lead-intake repassa zona (texto livre) e bairro do payload", () => {
    const intake = read("supabase/functions/lead-intake/index.ts");
    expect(intake).toContain('pick("zona", "regiao"');
    expect(intake).toContain('pick("bairro"');
    expect(intake).toMatch(/insert\(\{[\s\S]*?zona,\n\s*bairro,/);
  });

  it("landing grava a região de interesse como zona (antes ia só para observações)", () => {
    const landing = read("src/routes/api/public/webhooks/landing.ts");
    expect(landing).toContain("zona: row.regiao ?? null");
  });

  it("novo lead e ficha editam bairro/zona (payload do criar_lead_dedup e update)", () => {
    const dialog = read("src/features/leads/novo-lead-dialog.tsx");
    expect(dialog).toContain("bairro: form.bairro.trim() || null");
    expect(dialog).toContain("zona: form.zona || null");
    const editar = read("src/features/leads/dossie/editar-lead-dialog.tsx");
    expect(editar).toContain("bairro: editForm.bairro.trim() || null");
    expect(editar).toContain("zona: editForm.zona || null");
  });

  it("atribuição manual na UI mostra o aviso de zona vindo do motor", () => {
    const queries = read("src/features/distribuicao/queries.ts");
    expect(queries).toContain("aviso_zona");
    expect(queries).toContain("toast.warning(res.aviso_zona)");
  });
});
