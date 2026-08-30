// Resolução CONTEXTUAL das telas transversais (auditoria das abas laterais,
// 2026-08-27): a ficha do lead — e a Vitrine/ficha de projeto abertas com
// ?leadId — acendem a sidebar da FASE da jornada do lead, não do prefixo do
// path. Determinístico por construção: etapa vinda do banco + leadId na URL;
// nunca referrer. Sem fase (carregando), vale a resolução padrão.
import { describe, expect, it } from "vitest";

import {
  faseDoStatus,
  sistemaAtivo,
  sistemaAtivoContextual,
  telaTransversalDeLead,
} from "@/features/nav/sistemas";

const em = (
  pathname: string,
  fase: "prospeccao" | "carteira" | null,
  search: Record<string, unknown> = {},
) => sistemaAtivoContextual({ pathname, search }, fase)?.id ?? null;

describe("faseDoStatus", () => {
  it("prospecção: da entrada à qualificação", () => {
    for (const s of [
      "novo",
      "aguardando_atendimento",
      "aguardando_retorno",
      "qualificacao_corretor",
    ]) {
      expect(faseDoStatus(s)).toBe("prospeccao");
    }
  });

  it("carteira: em atendimento em diante — terminais inclusos (fim de jornada)", () => {
    for (const s of [
      "em_atendimento",
      "agendado",
      "visita_realizada",
      "analise_credito",
      "contrato_fechado",
      "pos_venda",
      "perdido",
    ]) {
      expect(faseDoStatus(s)).toBe("carteira");
    }
  });

  it("sem status (carregando) → null: o caller cai na resolução padrão", () => {
    expect(faseDoStatus(null)).toBeNull();
    expect(faseDoStatus(undefined)).toBeNull();
  });
});

describe("telaTransversalDeLead", () => {
  it("a ficha do lead é sempre transversal; a lista /leads não", () => {
    expect(telaTransversalDeLead({ pathname: "/leads/abc-123", search: {} })).toBe(true);
    expect(telaTransversalDeLead({ pathname: "/leads", search: {} })).toBe(false);
  });

  it("Vitrine e ficha de projeto SÓ com ?leadId — sem lead são catálogo", () => {
    expect(telaTransversalDeLead({ pathname: "/vitrine", search: { leadId: "x" } })).toBe(true);
    expect(telaTransversalDeLead({ pathname: "/vitrine", search: {} })).toBe(false);
    expect(telaTransversalDeLead({ pathname: "/projetos/xyz", search: { leadId: "x" } })).toBe(
      true,
    );
    expect(telaTransversalDeLead({ pathname: "/projetos/xyz", search: {} })).toBe(false);
  });
});

describe("sistemaAtivoContextual", () => {
  it("ficha de lead de CARTEIRA acende a Carteira (fim da troca falsa de hub)", () => {
    expect(em("/leads/abc-123", "carteira")).toBe("carteira");
  });

  it("ficha de lead de prospecção segue na Prospecção", () => {
    expect(em("/leads/abc-123", "prospeccao")).toBe("prospeccao");
  });

  it("sem fase (carregando) a ficha cai no comportamento antigo (Prospecção por prefixo)", () => {
    expect(em("/leads/abc-123", null)).toBe("prospeccao");
    expect(em("/leads/abc-123", null)).toBe(
      sistemaAtivo({ pathname: "/leads/abc-123", search: {} })?.id,
    );
  });

  it("Vitrine com lead mantém o hub da jornada; sem lead é Docs & Projetos", () => {
    expect(em("/vitrine", "carteira", { leadId: "x" })).toBe("carteira");
    expect(em("/vitrine", "prospeccao", { leadId: "x" })).toBe("prospeccao");
    // fase publicada mas SEM leadId na URL (contexto residual): não é
    // transversal — catálogo continua em Docs & Projetos.
    expect(em("/vitrine", "carteira")).toBe("docs-projetos");
  });

  it("ficha de projeto com lead (vindo do Match) mantém o hub da jornada", () => {
    expect(em("/projetos/xyz", "carteira", { leadId: "x" })).toBe("carteira");
    expect(em("/projetos/xyz", null, { leadId: "x" })).toBe("docs-projetos");
  });

  it("rotas não-transversais ignoram o contexto por completo", () => {
    expect(em("/pipeline", "prospeccao", { fase: "carteira" })).toBe("carteira");
    expect(em("/follow-up", "carteira")).toBe("follow-up");
    expect(em("/mensagens", "carteira")).toBe("atendimento-central");
  });
});
