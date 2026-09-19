import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOTE_MAX_NOMES,
  mensagemTransferenciaIndividual,
  mensagemTransferenciaLote,
  type LeadResumo,
} from "../supabase/functions/_shared/notificacao-transferencia";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const lead = (nome: string, projeto: string | null = "Residencial X"): LeadResumo => ({
  nome,
  projeto,
  renda: "R$ 3.000",
});

describe("mensagem de transferência em lote", () => {
  it("com um único lead mantém o texto individual de sempre", () => {
    const msg = mensagemTransferenciaLote([lead("Ana")], {
      linkLista: "https://crm.app/leads",
      linkLead: "https://crm.app/leads/1",
    });
    expect(msg).toBe(
      mensagemTransferenciaIndividual({
        nomeLead: "Ana",
        projeto: "Residencial X",
        renda: "R$ 3.000",
        link: "https://crm.app/leads/1",
      }),
    );
  });

  it("resume o lote numa mensagem só, com a contagem no título", () => {
    const leads = [lead("Ana"), lead("Bruno"), lead("Carla", null)];
    const msg = mensagemTransferenciaLote(leads, { linkLista: "https://crm.app/leads" });
    expect(msg).toContain("3 leads transferidos para você");
    expect(msg).toContain("• Ana — Residencial X");
    expect(msg).toContain("• Carla");
    expect(msg).toContain("https://crm.app/leads");
    // Um lead sem projeto não inventa travessão solto.
    expect(msg).not.toContain("• Carla —");
  });

  it("corta a lista nominal e informa quantos sobraram", () => {
    const leads = Array.from({ length: LOTE_MAX_NOMES + 5 }, (_, i) => lead(`Lead ${i + 1}`));
    const msg = mensagemTransferenciaLote(leads, { linkLista: "https://crm.app/leads" });
    expect(msg).toContain(`${LOTE_MAX_NOMES + 5} leads transferidos`);
    expect(msg).toContain(`• Lead ${LOTE_MAX_NOMES}`);
    expect(msg).not.toContain(`• Lead ${LOTE_MAX_NOMES + 1} `);
    expect(msg).toContain("e mais 5");
  });

  it("lead sem nome não vira 'null' na mensagem", () => {
    const msg = mensagemTransferenciaLote(
      [{ nome: null, projeto: null, renda: null }, lead("Ana")],
      {
        linkLista: "https://crm.app/leads",
      },
    );
    expect(msg).toContain("(sem nome)");
    expect(msg).not.toContain("null");
  });
});

describe("transferência em massa não avisa lead a lead", () => {
  const fnLote = ler("supabase/functions/notify-lead-transfer/index.ts");
  const leadsMutations = ler("src/features/leads/use-lead-mutations.ts");
  const porCorretor = ler("src/features/gestao/leads-por-corretor-page.tsx");
  const helper = ler("src/lib/notificar-transferencia.ts");

  it("os dois fluxos de lote da UI mandam a lista de ids numa chamada só", () => {
    for (const src of [leadsMutations, porCorretor]) {
      expect(src).toContain("notificarTransferenciaEmLote");
      // Nenhum invoke de notificação dentro de map/loop por id.
      expect(src).not.toMatch(/map\(\(id\)[\s\S]{0,200}?notify-lead-transfer/);
    }
    expect(helper).toContain("lead_ids: ids");
    expect(helper).not.toContain("lead_id:");
  });

  it("a edge function aceita lead_ids e faz UM envio para o lote", () => {
    expect(fnLote).toContain("lead_ids");
    const trecho = fnLote.slice(
      fnLote.indexOf("if (emLote)"),
      fnLote.indexOf("const { data: lead,"),
    );
    expect(trecho).toContain("mensagemTransferenciaLote");
    // Um único sendZapi no caminho do lote — nada de envio por lead.
    expect(trecho.match(/sendZapi\(/g) ?? []).toHaveLength(1);
  });

  it("avisa lead de qualquer origem — o filtro de facebook não voltou", () => {
    // O aviso valia só para origem=facebook, herança de quando o Facebook Ads
    // era a única entrada com roleta. Hoje todo lead transferido avisa o novo
    // dono; só a RLS do chamador limita quem entra na mensagem.
    expect(fnLote).not.toMatch(/origem\s*!==\s*"facebook"/);
    expect(fnLote).not.toContain("origem_nao_facebook");
  });

  it("o caminho do SDR continua individual (token de uso único, sem lote)", () => {
    expect(fnLote).toContain("!interna && !contextoSdr && Array.isArray(body.lead_ids)");
  });
});

describe("dossiê do copiloto não sai lead a lead na transferência em massa", () => {
  // A definição que vale no banco é a da migration mais recente que redefine a
  // função — ler um arquivo só não detecta redefinição posterior.
  const ultimaTransferirLeads = (): string => {
    const dir = "supabase/migrations";
    const arquivos = readdirSync(join(process.cwd(), dir))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    let corpo = "";
    for (const arquivo of arquivos) {
      const sql = ler(join(dir, arquivo));
      const m = sql.match(
        /CREATE OR REPLACE FUNCTION public\.transferir_leads\b[\s\S]*?REVOKE ALL ON FUNCTION public\.transferir_leads/,
      );
      if (m) corpo = m[0];
    }
    return corpo;
  };

  it("chama _notificar_handoff_novo_dono uma única vez, depois do loop e sob guarda", () => {
    const corpo = ultimaTransferirLeads();
    expect(corpo).not.toBe("");

    // Uma chamada só na função inteira…
    expect(corpo.match(/_notificar_handoff_novo_dono\(/g) ?? []).toHaveLength(1);

    // …fora do loop (depois do END LOOP) e condicionada a um único dono trocado.
    const depoisDoLoop = corpo.slice(corpo.lastIndexOf("END LOOP;"));
    expect(depoisDoLoop).toContain("_notificar_handoff_novo_dono(");
    expect(depoisDoLoop).toMatch(/IF _donos_trocados = 1 THEN/);

    // A auditoria interna continua por lead (não gera mensagem).
    expect(corpo).toContain("_auditar_redistribuicao(");
  });
});
