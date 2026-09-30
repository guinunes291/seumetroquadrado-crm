// Aviso de redistribuição por SLA feito pelo próprio CRM (substitui o digest
// do n8n). Textos iguais aos do digest; empreendimento vem da ficha do lead.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AVISO_MAX_LEADS,
  agruparPorCorretor,
  mensagemAvisoCorretor,
  mensagemAvisoGestor,
  type AvisoLead,
} from "../supabase/functions/_shared/aviso-redistribuicao";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const link = (id: string) => `https://crm.test/leads/${id}`;
const lead = (id: string, nome: string | null, projeto: string | null): AvisoLead => ({
  lead_id: id,
  lead_nome: nome,
  projeto_nome: projeto,
});

describe("mensagem ao corretor", () => {
  it("1 lead: o texto de sempre, com o empreendimento da ficha do CRM", () => {
    expect(mensagemAvisoCorretor([lead("a1", "Jaqueline", "Elev Saúde")], link)).toBe(
      [
        "🔁 1 lead novo pra você",
        "",
        "1. Jaqueline · Elev Saúde",
        "   https://crm.test/leads/a1",
        "",
        "Chegou pra você porque não houve atendimento no prazo. Fale com ele hoje — lead parado volta pra roleta.",
      ].join("\n"),
    );
  });

  it("lead sem empreendimento não inventa projeto (nada de 'Sabara' por padrão)", () => {
    const msg = mensagemAvisoCorretor([lead("a1", "Jaqueline", null)], link);
    expect(msg).toContain("1. Jaqueline\n");
    expect(msg).not.toContain("·");
  });

  it("vários leads: plural, lista limitada e '... e mais N'", () => {
    const leads = Array.from({ length: AVISO_MAX_LEADS + 3 }, (_, i) =>
      lead(`l${i}`, `Lead ${i}`, "Well Perdizes"),
    );
    const msg = mensagemAvisoCorretor(leads, link);
    expect(msg.startsWith(`🔁 ${AVISO_MAX_LEADS + 3} leads novos pra você`)).toBe(true);
    expect(msg).toContain(`${AVISO_MAX_LEADS}. Lead ${AVISO_MAX_LEADS - 1}`);
    expect(msg).not.toContain(`Lead ${AVISO_MAX_LEADS}\n`);
    expect(msg).toContain("... e mais 3 na sua lista do CRM.");
    expect(msg).toContain("Chegaram pra você");
  });

  it("nome vazio vira 'sem nome'", () => {
    expect(mensagemAvisoCorretor([lead("a1", "  ", null)], link)).toContain("1. sem nome");
  });
});

describe("resumo ao gestor", () => {
  it("totaliza leads e corretores e registra os saltos ignorados", () => {
    const msg = mensagemAvisoGestor({
      quando: "28/09 09:20",
      porCorretor: [
        { nome: "Amanda Dias", qtd: 2 },
        { nome: "Bruno", qtd: 1 },
      ],
      saltosIgnorados: 1,
    });
    expect(msg).toContain("📊 Redistribuição automática · 28/09 09:20");
    expect(msg).toContain("3 leads redistribuídos · 2 corretores avisados");
    expect(msg).toContain("• Amanda Dias: 2");
    expect(msg).toContain("(1 salto(s) intermediário(s) ignorado(s)");
  });
});

describe("agruparPorCorretor", () => {
  it("uma entrada por corretor, na ordem de chegada", () => {
    const g = agruparPorCorretor([
      { corretor_id: "b", id: 1 },
      { corretor_id: "a", id: 2 },
      { corretor_id: "b", id: 3 },
    ]);
    expect(g.map((x) => [x.corretor_id, x.itens.map((i) => i.id)])).toEqual([
      ["b", [1, 3]],
      ["a", [2]],
    ]);
  });
});

describe("fiação", () => {
  it("a função só aceita o token do banco e envia 1 mensagem por corretor com intervalo", () => {
    const fn = ler("supabase/functions/notify-redistribuicao/index.ts");
    expect(fn).toContain('"reivindicar_avisos_redistribuicao"');
    expect(fn).toContain('"concluir_avisos_redistribuicao"');
    expect(fn).toContain("INTERVALO_ENVIO_MS = 5000");
    expect(fn).toContain("agruparPorCorretor(avisos)");
  });

  it("gateway não exige JWT (o chamador é o banco, autenticado pelo token)", () => {
    expect(ler("supabase/config.toml")).toMatch(
      /\[functions\.notify-redistribuicao\]\s*\nverify_jwt = false/,
    );
  });

  it("SLA vai para a fila do CRM; o resto continua no dossiê do Marcão", () => {
    const mig = ler("supabase/migrations/20261002130000_aviso_redistribuicao_no_crm.sql");
    expect(mig).toContain("~* 'redistribu' AND COALESCE(_motivo, '') ~* 'sla'");
    expect(mig).toContain(
      "INSERT INTO public.avisos_redistribuicao (lead_id, corretor_id, motivo)",
    );
    expect(mig).toContain("/webhook/copiloto/handoff");
  });
});
