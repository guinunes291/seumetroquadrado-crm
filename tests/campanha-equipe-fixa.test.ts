// Campanhas de EQUIPE FIXA — contratos da migration 20260819100000 e da UI.
// Decisão de produto (2026-08-19): campanhas de conta de anúncio própria
// (equipe do Guilherme, equipe do Bruno) caem SEMPRE no time da campanha —
// sem delegar para as roletas de zona e sem filtro intra-equipe por
// profiles.zonas. As demais campanhas seguem respeitando o zona-primeiro.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MIG = "supabase/migrations/20260819100000_campanhas_equipe_fixa.sql";
const mig = read(MIG);
const migSemComentario = mig.replace(/--[^\n]*/g, "");

describe("ordem e escopo da migration", () => {
  it("ordena DEPOIS da consolidação de 16/08 — o replay termina com equipe_fixa", () => {
    expect(MIG > "supabase/migrations/20260816150000_origem_config_e_fallback_pronto.sql").toBe(
      true,
    );
  });

  it("não regride o fix P0: o INSERT do ponderado segue gravando 'sucesso'", () => {
    expect(migSemComentario).toContain("'roleta_ponderada'");
    expect(migSemComentario).not.toContain(", 'ok')");
  });
});

describe("coluna e seed", () => {
  it("roletas.equipe_fixa existe com default false", () => {
    expect(mig).toContain(
      "ALTER TABLE public.roletas ADD COLUMN IF NOT EXISTS equipe_fixa boolean NOT NULL DEFAULT false",
    );
  });

  it("semeia as duas campanhas de equipe fixa com token, preservando token no replay", () => {
    expect(mig).toContain("'equipe-guilherme'");
    expect(mig).toContain("'equipe-bruno'");
    expect(mig).toMatch(
      /'manual', true, 'campanha', true, encode\(gen_random_bytes\(24\), 'hex'\)/,
    );
    expect(mig).toContain(
      "webhook_token = COALESCE(public.roletas.webhook_token, EXCLUDED.webhook_token)",
    );
  });
});

describe("motor ponderado respeita equipe_fixa", () => {
  const pond = mig.slice(
    mig.indexOf("CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado"),
  );

  it("a delegação zona-primeiro só roda quando NÃO é equipe fixa", () => {
    const bloco = pond.replace(/\s+/g, " ");
    expect(bloco).toContain("IF NOT _roleta.equipe_fixa THEN");
    expect(bloco).toContain("_zslug := public.roleta_da_zona(public.zona_do_lead(_lead_id))");
  });

  it("o filtro intra-equipe por profiles.zonas também é pulado na equipe fixa", () => {
    expect(pond.replace(/\s+/g, " ")).toContain(
      "IF _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN",
    );
  });

  it("preserva as guardas: idempotência e advisory lock do SWRR", () => {
    expect(pond).toContain("'ja_atribuido'");
    expect(pond).toContain("pg_advisory_xact_lock(hashtext('roleta_swrr:'");
  });
});

describe("UI — gestão de campanha na Central (consolidação de 27/08)", () => {
  const filas = read("src/features/distribuicao/tab-filas.tsx");
  const props = read("src/features/distribuicao/fila-propriedades.tsx");
  const page = read("src/features/gestao/campanhas-page.tsx");

  it("cria campanha pela RPC do servidor (slug + token nascem no banco), nunca no navegador", () => {
    expect(filas).toContain("NovaCampanhaDialog");
    expect(filas).toContain("useCriarRoletaCampanha");
    expect(read("src/features/distribuicao/queries.ts")).toContain("criar_roleta_campanha");
    expect(filas).not.toContain("crypto.getRandomValues");
    expect(page).not.toContain("crypto.getRandomValues");
  });

  it("equipe fixa é editada pela RPC atualizar_roleta na aba Filas", () => {
    expect(props).toContain("equipeFixa: v");
    expect(props).toContain("useAtualizarRoleta");
  });

  it("o painel de Campanhas virou leitura: sem escrita direta em roletas/participantes", () => {
    expect(page).not.toMatch(/from\("roletas"\)[\s\S]{0,60}\.(insert|update|delete)\(/);
    expect(page).not.toMatch(
      /from\("roleta_participantes"\)[\s\S]{0,60}\.(insert|update|delete)\(/,
    );
    expect(page).toContain("Gerenciar na Central de Distribuição");
  });
});

describe("notificação ao corretor no webhook por token", () => {
  const rota = read("src/routes/api/public/webhooks/lead/$token.ts");
  const zapi = read("src/lib/zapi.server.ts");

  it("corretor recebe WhatsApp com o EMPREENDIMENTO em destaque", () => {
    expect(rota).toContain("enviarWhatsAppZapi");
    expect(rota).toContain("🏢 Empreendimento: ${projetoNomeFinal}");
    expect(rota).toContain("🔔 *Novo lead recebido!*");
  });

  it("chatbot fica de fora (o dossiê do Marquinhos já avisa) e falha vira alerta in-app", () => {
    expect(rota).toContain('data.origem !== "chatbot"');
    expect(rota).toContain('"Novo lead atribuído (notificação WhatsApp falhou)"');
  });

  it("a mensagem nunca inclui o telefone do lead", () => {
    const bloco = rota.slice(
      rota.indexOf("Novo lead recebido!"),
      rota.indexOf("Sincroniza com Banco Operacional externo"),
    );
    expect(bloco).not.toContain("data.telefone");
  });

  it("helper server-only nunca lança e degrada sem envs (zapi_nao_configurada)", () => {
    expect(zapi).toContain('return "zapi_nao_configurada"');
    expect(zapi).toContain("process.env.ZAPI_INSTANCE_ID");
    expect(zapi).not.toContain("throw");
  });
});
