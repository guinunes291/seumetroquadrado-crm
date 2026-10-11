// Fluxo da Vibra: as regras do simulador oficial do canal (faixas de 28/22/18%
// da renda, 4 atos, anual, única, pós-chave, pró-soluto de 15%) e a regra da
// operação de que cada mês sem assinar o produto perde uma mensal.
import { describe, expect, it } from "vitest";
import { rotuloMes } from "@/lib/simuladores/fluxo";
import {
  cenariosEsperaVibra,
  EMPREENDIMENTOS_VIBRA,
  empreendimentoDoProjeto,
  empreendimentoVibra,
  linhasVibra,
  simularVibra,
  sugestaoPeloTeto,
  textoStatusVibra,
  VIGENCIA_VIBRA,
  type EntradaVibra,
  type LinhaVibra,
} from "@/lib/simuladores/vibra";

const vilaSonia = empreendimentoVibra("Parque Vila Sônia")!;

/** "fev/27–mar/27", como a coluna "Quando" do simulador oficial. */
function quando(l: LinhaVibra): string {
  const curto = (c: string) => rotuloMes(c).replace(/\/20(\d\d)$/, "/$1");
  if (l.qtd === 0) return "-";
  if (l.tipo === "anual") return l.meses.map(curto).join(" e ");
  return l.qtd > 1 ? `${curto(l.meses[0])}–${curto(l.meses[l.qtd - 1])}` : curto(l.meses[0]);
}
const porId = (ls: LinhaVibra[]) => Object.fromEntries(ls.map((l) => [l.id, l]));

// Cliente do exemplo da doc: renda R$ 5 mil, imóvel de R$ 300 mil,
// financiamento de R$ 210 mil e R$ 40 mil de subsídio + FGTS.
const base: EntradaVibra = {
  empreendimento: vilaSonia,
  hoje: "2026-10",
  renda: 5_000,
  valorImovel: 300_000,
  financiamento: 210_000,
  subsidioFgts: 40_000,
  parcelas: {},
};

describe("tabela da Vibra", () => {
  it("21 empreendimentos, todos com a tabela de out/2026", () => {
    expect(EMPREENDIMENTOS_VIBRA).toHaveLength(21);
    expect(VIGENCIA_VIBRA).toBe("2026-10");
    for (const e of EMPREENDIMENTOS_VIBRA) {
      expect(e.base).toBe("2026-10");
      for (const c of [e.anualData, e.posChaveIni, e.entrega, e.unicaData ?? "2026-10"]) {
        expect(c).toMatch(/^20\d\d-(0[1-9]|1[0-2])$/);
      }
      expect([0.99, 0.985]).toContain(e.retencao);
    }
  });

  it("as mensais da tabela terminam antes do pós-chave começar", () => {
    for (const e of EMPREENDIMENTOS_VIBRA) {
      const mensais = linhasVibra(e, e.base).filter((l) => l.tipo === "mensal" && l.qtd > 0);
      const ultima = mensais.at(-1)?.meses.at(-1);
      if (ultima) expect(ultima < e.posChaveIni, e.nome).toBe(true);
    }
  });

  it("projeto do catálogo casa com o empreendimento da tabela", () => {
    const casos: [string, string | null][] = [
      ["Parque Vila Sonia", "Parque Vila Sônia"],
      ["Vibra Estacao Vila Sonia", "Estação Vila Sônia"],
      ["Parque Cidade Universitaria", "Pq. Cidade Universitária"],
      ["Parque Vila Prudente", "Parque Vl. Prudente"],
      ["Vibra Estacao Vila Prudente", "Estação Vila Prudente"],
      ["Estacao Sao Matheus", "São Mateus"],
      ["Vibra Alto da Mooca", "Vibra Mooca"],
      ["Vibra JD Bonfigliori", "Jd. Bonfiglioli"],
      ["Vibra - Vila Romana", "Vibra Vila Romana"],
      ["Veleiros", "Vibra Veleiros"],
      ["Sabara", "Vibra Sabará"],
      ["Joao Dias", "Vibra João Dias"],
      ["Nacoes Unidas", "Nações Unidas"],
      ["Vibra Alto da Mooca (futuro)", null],
      ["Vila Prudente / Vila Prudente II", null],
      ["Estacao Adolfo Pinheiro", null],
    ];
    for (const [catalogo, tabela] of casos) {
      expect(empreendimentoDoProjeto(catalogo)?.nome ?? null, catalogo).toBe(tabela);
    }
  });
});

describe("linhas e datas (mesmo 'Quando' do simulador oficial)", () => {
  it("Parque Vila Sônia assinando no mês da tabela", () => {
    const l = porId(linhasVibra(vilaSonia, "2026-10"));
    expect(l.ato1.meses).toEqual(["2026-10"]);
    expect(l.ato4.meses).toEqual(["2027-01"]);
    expect([l.m1.qtd, l.m2.qtd, l.m3.qtd]).toEqual([2, 8, 7]);
    expect(quando(l.m1)).toBe("fev/27–mar/27");
    expect(quando(l.m2)).toBe("abr/27–nov/27");
    expect(quando(l.m3)).toBe("dez/27–jun/28");
    expect(quando(l.anu)).toBe("dez/27");
    expect(quando(l.uni)).toBe("jul/28");
    expect(quando(l.pos)).toBe("ago/28–jul/30");
    expect(l.pos.qtd).toBe(24);
  });

  it("duas anuais caem em dezembros seguidos", () => {
    const l = porId(linhasVibra(empreendimentoVibra("Vibra Vila Romana")!, "2026-10"));
    expect(quando(l.anu)).toBe("dez/27 e dez/28");
    expect(l.uni.qtd).toBe(0);
  });

  it("cada mês sem assinar perde uma mensal, primeiro na faixa de 28%", () => {
    const qtds = (hoje: string) => {
      const l = porId(linhasVibra(vilaSonia, hoje));
      return [l.m1.qtd, l.m2.qtd, l.m3.qtd];
    };
    expect(qtds("2026-10")).toEqual([2, 8, 7]);
    expect(qtds("2026-11")).toEqual([1, 8, 7]);
    expect(qtds("2026-12")).toEqual([0, 8, 7]);
    expect(qtds("2027-01")).toEqual([0, 7, 7]);
    // Os atos andam junto: assinando em nov/2026 o 4º ato cai em fev/2027.
    const nov = porId(linhasVibra(vilaSonia, "2026-11"));
    expect(nov.ato4.meses).toEqual(["2027-02"]);
    expect(quando(nov.m1)).toBe("mar/27");
  });

  it("anual que cairia no período dos atos sai do fluxo", () => {
    // Assinando em set/2027, os atos vão de set a dez/2027: a anual de dez/2027 vira ato.
    const l = porId(linhasVibra(vilaSonia, "2027-09"));
    expect(l.anu.qtd).toBe(0);
    expect(l.m3.meses[0]).toBe("2028-01");
  });
});

describe("simulação", () => {
  it("financiamento líquido, total até a entrega e potencial morando", () => {
    const r = simularVibra(base);
    expect(r.retencaoPct).toBe(1);
    expect(r.financiamentoLiquido).toBe(207_900);
    expect(r.totalAteEntrega).toBe(52_100);
    expect(r.potencialMorando).toBe(1_500);
    expect(r.entrega).toBe("2028-11");
    expect(r.mensais).toBe(17);
    expect(r.status).toBe("falta");
    expect(textoStatusVibra(r)).toMatch(/^FALTA INCLUIR R\$\s52\.100,00/);
  });

  it("retenção de 1,5% nos empreendimentos 0,985", () => {
    const r = simularVibra({ ...base, empreendimento: empreendimentoVibra("Paes de Barros") });
    expect(r.retencaoPct).toBe(1.5);
    expect(r.financiamentoLiquido).toBe(206_850);
  });

  it("tetos pela renda: 28/22/18%, anual 100%, única 50% e pós-chave 10%", () => {
    const r = simularVibra(base);
    const t = Object.fromEntries(r.linhas.map((l) => [l.id, l.teto]));
    expect(t).toMatchObject({ m1: 1400, m2: 1100, m3: 900, anu: 5000, uni: 2500, pos: 500 });
    expect(t.ato1).toBeNull();
    // 2×1.400 + 8×1.100 + 7×900 + 5.000 + 2.500 + 24×500 = 37.400 (abaixo dos 15% = 45.000)
    expect(r.capacidadeParcelado).toBe(37_400);
    expect(r.atosMinimos).toBe(14_700);
  });

  it("preencher pelo teto fecha a conta sem passar de nenhum limite", () => {
    const parcelas = sugestaoPeloTeto(base);
    expect(parcelas).toMatchObject({ m1: 1400, m2: 1100, m3: 900, anu: 5000, uni: 2500, pos: 500 });
    expect([parcelas.ato1, parcelas.ato2, parcelas.ato3, parcelas.ato4]).toEqual([
      3675, 3675, 3675, 3675,
    ]);
    const r = simularVibra({ ...base, parcelas });
    expect(r.status).toBe("fechou");
    expect(textoStatusVibra(r)).toBe("FECHOU! O cliente tem perfil para este projeto.");
    expect(r.totalFluxo).toBe(52_100);
    expect(r.proSoluto.pct).toBeCloseTo(12.47, 2);
    expect(r.foraDoTeto).toEqual([]);
    expect(r.cronograma.filter((p) => p.tipo === "mensal").at(-1)?.rotulo).toBe("Mensal 17/17");
  });

  it("quando o pró-soluto de 15% limita, o resto vai para os atos", () => {
    const e: EntradaVibra = {
      ...base,
      renda: 12_000,
      valorImovel: 250_000,
      financiamento: 180_000,
      subsidioFgts: 10_000,
    };
    const parcelas = sugestaoPeloTeto(e);
    // 15% de 250 mil = 37.500: mensais 1 e 2 cheias, mensais 3 com o que sobra.
    expect(parcelas).toMatchObject({ m1: 3360, m2: 2640, m3: 1380, anu: 0, uni: 0, pos: 0 });
    expect(parcelas.ato1).toBe(6075);
    const r = simularVibra({ ...e, parcelas });
    expect(r.status).toBe("fechou");
    expect(r.proSoluto.valor).toBe(37_500);
  });

  it("quando o fluxo comporta tudo, os atos ficam zerados", () => {
    // 300.000 − 227.700 (230 mil líquidos de 1%) − 50.300 = 22.000, abaixo dos 37.400 de teto.
    const e = { ...base, financiamento: 230_000, subsidioFgts: 50_300 };
    const parcelas = sugestaoPeloTeto(e);
    expect(parcelas).toMatchObject({ m1: 1400, m2: 1100, m3: 900, anu: 4100, uni: 0, pos: 0 });
    expect(parcelas.ato1).toBe(0);
    expect(simularVibra({ ...e, parcelas }).status).toBe("fechou");
  });

  it("parcela acima do teto: a conta fecha mas o status avisa", () => {
    const parcelas = { ...sugestaoPeloTeto(base), m1: 1500, ato1: 3475 };
    const r = simularVibra({ ...base, parcelas });
    expect(r.diferenca).toBe(0);
    expect(r.status).toBe("fechou_fora_do_teto");
    expect(r.linhas.find((l) => l.id === "m1")?.excedeu).toBe(true);
    expect(textoStatusVibra(r)).toMatch(/Mensais 1 \(máx\. R\$\s1\.400,00 cada\)/);
  });

  it("pós-chave acima de 5% do imóvel e pró-soluto acima de 15%", () => {
    const e = { ...base, renda: 8_000, valorImovel: 200_000 };
    const r = simularVibra({ ...e, parcelas: { pos: 800, m2: 1760 } });
    expect(r.posChave.teto).toBe(10_000);
    expect(r.posChave.total).toBe(19_200);
    expect(r.posChave.excedeu).toBe(true);
    expect(r.linhas.find((l) => l.id === "pos")?.excedeu).toBe(false);
    expect(r.proSoluto.excedeu).toBe(true);
    expect(r.foraDoTeto.join(" ")).toMatch(/pós-chave no total/);
    expect(r.foraDoTeto.join(" ")).toMatch(/pró-soluto \(16,6% do imóvel, máx\. 15%\)/);
  });

  it("sobra quando o fluxo passa do total até a entrega", () => {
    const parcelas = { ...sugestaoPeloTeto(base), ato1: 4675 };
    const r = simularVibra({ ...base, parcelas });
    expect(r.status).toBe("sobra");
    expect(textoStatusVibra(r)).toMatch(/^SOBRA R\$\s1\.000,00/);
  });

  it("sem renda: incompleto e sem linha vermelha", () => {
    const r = simularVibra({ ...base, renda: 0, parcelas: { m1: 1000 } });
    expect(r.status).toBe("incompleto");
    expect(r.linhas.some((l) => l.excedeu)).toBe(false);
  });

  it("assinando dois meses depois, o aviso conta as mensais perdidas", () => {
    const r = simularVibra({ ...base, hoje: "2026-12" });
    expect(r.mensaisPerdidas).toBe(2);
    expect(r.alertas.find((a) => a.codigo === "mensais_perdidas")?.texto).toMatch(
      /as 2 primeiras mensais já saíram/,
    );
  });
});

describe("quanto custa esperar", () => {
  it("cada mês tira uma mensal e o teto dela volta para os atos", () => {
    const c = cenariosEsperaVibra(base);
    expect(c.map((x) => x.hoje)).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(c.map((x) => x.mensais)).toEqual([17, 16, 15, 14]);
    expect(c.map((x) => x.atosMinimos)).toEqual([14_700, 16_100, 17_500, 18_600]);
    expect(c.map((x) => x.diferenca)).toEqual([0, 1_400, 2_800, 3_900]);
  });

  it("com o pró-soluto no limite, esperar um mês ainda não custa ato", () => {
    const c = cenariosEsperaVibra({
      ...base,
      renda: 12_000,
      valorImovel: 250_000,
      financiamento: 180_000,
      subsidioFgts: 10_000,
    });
    expect(c[1].mensais).toBe(16);
    expect(c[1].diferenca).toBe(0);
  });
});
