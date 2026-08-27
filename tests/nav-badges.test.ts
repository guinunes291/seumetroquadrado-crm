import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { parseNavBadges } from "@/features/nav/use-nav-badges";

describe("parseNavBadges", () => {
  it("converte o jsonb do nav_pendencias para o formato da UI", () => {
    expect(
      parseNavBadges({
        atendimento: 4,
        tarefas_vencidas: 2,
        agenda_hoje: 3,
        aprovacoes: 1,
        followups: 6,
      }),
    ).toEqual({ atendimento: 4, tarefasVencidas: 2, agendaHoje: 3, aprovacoes: 1, followups: 6 });
  });

  it("tolera payload parcial/estranho sem quebrar (campos viram 0)", () => {
    // Banco antigo (nav_pendencias v2) não devolve `followups` — vira 0.
    expect(parseNavBadges({ atendimento: "7" })).toEqual({
      atendimento: 0,
      tarefasVencidas: 0,
      agendaHoje: 0,
      aprovacoes: 0,
      followups: 0,
    });
    expect(parseNavBadges(null)).toBeNull();
    expect(parseNavBadges("x")).toBeNull();
  });
});
