// Ronda do dia do hero de gestão da /hoje: a trava de produto é que a ronda
// NUNCA vira menu — item só existe com contador > 0, e com tudo zerado a
// lista é vazia (a UI não renderiza nada extra).

import { describe, expect, it } from "vitest";
import { buildRondaItems } from "@/features/command-center/ronda";
import type { NavBadges } from "@/features/nav/use-nav-badges";

const zerado: NavBadges = {
  atendimento: 0,
  tarefasVencidas: 0,
  agendaHoje: 0,
  aprovacoes: 0,
  followups: 0,
};

describe("buildRondaItems", () => {
  it("sem badges (RPC ausente/carregando) e com tudo zerado: lista vazia — nada de menu estático", () => {
    expect(buildRondaItems(null)).toEqual([]);
    expect(buildRondaItems(zerado)).toEqual([]);
  });

  it("só entram itens com contador > 0, na ordem da ronda, com o destino certo", () => {
    const itens = buildRondaItems({ ...zerado, aprovacoes: 2, atendimento: 5 });
    // followups = 0 fica de fora; ordem fixa: aprovações → régua → entrada.
    expect(itens.map((i) => i.id)).toEqual(["aprovacoes", "atendimento"]);

    const [aprov, entrada] = itens;
    expect(aprov.count).toBe(2);
    expect(aprov.to).toBe("/financeiro");
    expect(aprov.search).toEqual({ tab: "comissoes" });
    expect(entrada.count).toBe(5);
    expect(entrada.to).toBe("/distribuicao");
    expect(entrada.search).toBeUndefined();
  });

  it("follow-up do time aponta para a Cobertura (visão de gestão), não para a fila", () => {
    const [item] = buildRondaItems({ ...zerado, followups: 3 });
    expect(item.id).toBe("followups");
    expect(item.to).toBe("/follow-up");
    expect(item.search).toEqual({ tab: "cobertura" });
  });

  it("flexiona o rótulo pelo contador (1 vs vários)", () => {
    const [um] = buildRondaItems({ ...zerado, aprovacoes: 1 });
    const [varios] = buildRondaItems({ ...zerado, aprovacoes: 4 });
    expect(um.label).toBe("aprovação de venda pendente");
    expect(varios.label).toBe("aprovações de venda pendentes");
  });

  it("badges do dia do corretor (tarefas vencidas / agenda) não entram na ronda", () => {
    // Esses dois já têm casa na visão "minha" da /hoje — duplicá-los aqui
    // recriaria o menu global que a trava proíbe.
    expect(buildRondaItems({ ...zerado, tarefasVencidas: 9, agendaHoje: 7 })).toEqual([]);
  });
});
