// Regressão: o zod 4.4+ proíbe .omit() em objeto com refine. As ferramentas
// propor_* quebravam ANTES de chamar o gateway e toda pergunta livre da Sami
// (painel e WhatsApp) caía com gateway_error desde set/2026.
import { describe, expect, it } from "vitest";
import { criarFerramentasDePropostaSamiQ } from "@/lib/samiq-propostas.server";
import { compatibilizarFerramentasSamiQ } from "@/lib/samiq-ferramentas-compat";
import { AtualizarQualificacaoPayload, MudarEtapaPayload } from "@/lib/samiq-propostas";

const LEAD = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

describe("ferramentas propor_*", () => {
  const supabase = {} as never;

  it("monta as 7 ferramentas e o schema compatível sem lançar", () => {
    const tools = criarFerramentasDePropostaSamiQ({ supabase, userId: "u", coletor: [] });
    expect(Object.keys(tools)).toHaveLength(7);
    expect(Object.keys(tools)).toContain("propor_novo_cliente");
    expect(() => compatibilizarFerramentasSamiQ(tools)).not.toThrow();
  });

  it("mantém as regras da qualificação e da etapa no input das ferramentas", () => {
    const tools = criarFerramentasDePropostaSamiQ({ supabase, userId: "u", coletor: [] });
    const q = tools.propor_qualificacao.inputSchema as unknown as { safeParse: (v: unknown) => { success: boolean } };
    expect(q.safeParse({ leadId: LEAD }).success).toBe(false);
    expect(q.safeParse({ leadId: LEAD, usaFgts: true }).success).toBe(true);
    const e = tools.propor_etapa.inputSchema as unknown as { safeParse: (v: unknown) => { success: boolean } };
    expect(e.safeParse({ leadId: LEAD, novoStatus: "perdido" }).success).toBe(false);
    expect(e.safeParse({ leadId: LEAD, novoStatus: "perdido", motivo: "sem renda" }).success).toBe(true);
  });

  it("os payloads completos continuam refinados", () => {
    expect(AtualizarQualificacaoPayload.safeParse({ tipo: "atualizar_qualificacao", leadId: LEAD }).success).toBe(false);
    expect(MudarEtapaPayload.safeParse({ tipo: "mudar_etapa", leadId: LEAD, novoStatus: "perdido" }).success).toBe(false);
  });
});
