import { describe, expect, it } from "vitest";
import { SAMIQ_ACTION_META, SAMIQ_ACTIONS, SamiQInputSchema, sugestoesPara } from "@/lib/samiq";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("SamiQInputSchema", () => {
  it("aceita ação válida com lead e pergunta", () => {
    const parsed = SamiQInputSchema.parse({
      action: "mensagem_sugerida",
      leadId: UUID,
      pergunta: "cliente quer 2 dorms na zona leste",
    });
    expect(parsed.action).toBe("mensagem_sugerida");
  });

  it("rejeita ação desconhecida, uuid inválido e pergunta longa demais", () => {
    expect(() => SamiQInputSchema.parse({ action: "hackear" })).toThrow();
    expect(() =>
      SamiQInputSchema.parse({ action: "resumo_cliente", leadId: "nao-e-uuid" }),
    ).toThrow();
    expect(() =>
      SamiQInputSchema.parse({ action: "pergunta_livre", pergunta: "x".repeat(501) }),
    ).toThrow();
  });

  it("limita o histórico a 6 turnos", () => {
    const historico = Array.from({ length: 7 }, () => ({
      role: "user" as const,
      content: "oi",
    }));
    expect(() => SamiQInputSchema.parse({ action: "pergunta_livre", historico })).toThrow();
    expect(
      SamiQInputSchema.parse({ action: "pergunta_livre", historico: historico.slice(0, 6) })
        .historico,
    ).toHaveLength(6);
  });
});

describe("catálogo de ações", () => {
  it("toda ação tem metadados completos", () => {
    for (const a of SAMIQ_ACTIONS) {
      const meta = SAMIQ_ACTION_META[a];
      expect(meta.label.length).toBeGreaterThan(2);
      expect(meta.instrucao.length).toBeGreaterThan(20);
    }
  });

  it("ações de cliente exigem lead; ações gerais não", () => {
    expect(SAMIQ_ACTION_META.resumo_cliente.precisaLead).toBe(true);
    expect(SAMIQ_ACTION_META.mensagem_sugerida.precisaLead).toBe(true);
    expect(SAMIQ_ACTION_META.analise_funil.precisaLead).toBe(false);
    expect(SAMIQ_ACTION_META.prioridade_dia.precisaLead).toBe(false);
    expect(SAMIQ_ACTION_META.pergunta_livre.precisaLead).toBe(false);
  });
});

describe("sugestoesPara (guard-rails: só copiar ou navegar)", () => {
  it("mensagem sugerida vira botão de copiar + abrir dossiê", () => {
    const s = sugestoesPara("mensagem_sugerida", "Olá, João!", UUID);
    expect(s.find((x) => x.copyText === "Olá, João!")).toBeTruthy();
    expect(s.find((x) => x.to === `/leads/${UUID}`)).toBeTruthy();
  });

  it("prioridade do dia aponta para o Atendimento; funil para o Pipeline", () => {
    expect(sugestoesPara("prioridade_dia", "…")[0].to).toBe("/atendimento");
    expect(sugestoesPara("analise_funil", "…")[0].to).toBe("/pipeline");
  });

  it("nenhuma sugestão tem efeito além de copiar/navegar", () => {
    for (const a of SAMIQ_ACTIONS) {
      for (const s of sugestoesPara(a, "texto", UUID)) {
        expect(Object.keys(s).every((k) => ["label", "to", "copyText"].includes(k))).toBe(true);
      }
    }
  });
});
