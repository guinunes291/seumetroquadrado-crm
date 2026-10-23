// Troca de modelo da IA governada (23/10/2026): o model_id da governança pode
// ser um Claude direto (chave própria) ou um id do gateway do Lovable.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { jsonEstavel } from "../src/lib/samiq-confirmar.server";
import { etapaBloqueadaSemDono, mensagemEtapaNaoAplicada } from "../src/lib/samiq-propostas";

describe("etapa que o funil não aplica", () => {
  it("bloqueia Em atendimento para lead sem corretor na hora de propor", () => {
    expect(etapaBloqueadaSemDono("em_atendimento", null)).toMatch(/sem corretor/);
    expect(etapaBloqueadaSemDono("em_atendimento", "u1")).toBeNull();
    expect(etapaBloqueadaSemDono("aguardando_retorno", null)).toBeNull();
  });

  it("explica o motivo quando o funil devolve a etapa", () => {
    const msg = mensagemEtapaNaoAplicada("em_atendimento", "aguardando_atendimento", null);
    expect(msg).toContain("Aguardando atendimento");
    expect(msg).toContain("sem corretor responsável");
  });
});

describe("status editada", () => {
  it("ordem de chaves diferente não conta como edição", () => {
    expect(jsonEstavel({ a: 1, b: { c: 2, d: 3 } })).toBe(jsonEstavel({ b: { d: 3, c: 2 }, a: 1 }));
    expect(jsonEstavel({ a: 1 })).not.toBe(jsonEstavel({ a: 2 }));
  });
});
