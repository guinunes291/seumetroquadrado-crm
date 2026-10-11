// Fluxo da Mundo Apto: Política de Análise de Crédito de 09/04/2026 (Tabelão
// out/2026). Os valores de imóvel são de unidades do próprio Tabelão.
import { describe, expect, it } from "vitest";
import {
  cenariosEsperaMA,
  EMPREENDIMENTOS_MA,
  empreendimentoMA,
  empreendimentoMADoProjeto,
  linhasMA,
  OUTRO_EMPREENDIMENTO_MA,
  simularMA,
  sugestaoPelaPolitica,
  textoStatusMA,
  type EntradaMA,
  type IdLinhaMA,
  type LinhaMA,
} from "@/lib/simuladores/mundo-apto";

const porId = (ls: LinhaMA[]) =>
  Object.fromEntries(ls.map((l) => [l.id, l])) as Record<IdLinhaMA, LinhaMA>;

// MA Brooklin, unidade 2006 (HIS2, 1 dorm c/ terraço): R$ 322.720,00 no Tabelão.
const brooklin: EntradaMA = {
  empreendimento: empreendimentoMA("MA Brooklin"),
  modalidade: "associativo",
  intermediaria: "anual",
  hoje: "2026-10",
  habiteSe: "",
  renda: 6_000,
  valorImovel: 322_720,
  financiamento: 230_000,
  subsidio: 10_000,
  fgts: 15_000,
  posParcelas: null,
  parcelas: {},
};

describe("tabela de vencimentos da política", () => {
  it("21 empreendimentos; a mensal pós começa no mês seguinte à única", () => {
    expect(EMPREENDIMENTOS_MA).toHaveLength(21);
    for (const e of EMPREENDIMENTOS_MA) {
      const { unica, mensalPos } = e.vencimentos;
      if (!unica || !mensalPos) continue;
      const [a, m] = unica.split("-").map(Number);
      const seguinte = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
      expect(mensalPos, e.nome).toBe(seguinte);
    }
  });

  it("projeto do catálogo casa com o empreendimento da política", () => {
    const casos: [string, string | null][] = [
      ["MA Lapa", "MA Estação Lapa"],
      ["MA Aricanduva", "Estação Aricanduva"],
      ["MA Estacao Conceicao", "Estação Conceição"],
      ["MA Estacao SP Morumbi", "Estação SP Morumbi (F1/F2)"],
      ["MA Alto do Ipiranga", "MA Alto do Ipiranga (F1/F2)"],
      ["MA Estacao Borba Gato", "Estação Borba Gato"],
      ["Elevato Bosque da Saude", "Elevato Bosque da Saúde"],
      ["Essencia Vila Prudente", "Essência Vila Prudente"],
      ["MA Santa Cecilia", "MA Santa Cecília"],
      ["MA Brooklin", "MA Brooklin"],
      ["Elevato Brooklin", "Elevato Brooklin"],
      ["MA Mooca", "MA Mooca"],
      ["MA Alto da Mooca", null],
      ["MA Essencia Ipiranga", null],
    ];
    for (const [catalogo, politica] of casos) {
      expect(empreendimentoMADoProjeto(catalogo)?.nome ?? null, catalogo).toBe(politica);
    }
  });
});

describe("linhas do fluxo", () => {
  it("MA Brooklin: entradas, 4 mensais até o habite-se, única e pós até fechar 36 meses", () => {
    const l = porId(linhasMA(brooklin));
    expect([l.ato.meses, l.e30.meses, l.e60.meses, l.e90.meses]).toEqual([
      ["2026-10"],
      ["2026-11"],
      ["2026-12"],
      ["2027-01"],
    ]);
    expect(l.mensal.meses).toEqual(["2027-02", "2027-03", "2027-04", "2027-05"]);
    expect(l.inter.qtd).toBe(0); // nenhum dezembro entre fev e mai/2027
    expect(l.unica.meses).toEqual(["2027-06"]);
    expect(l.pos.qtd).toBe(27);
    expect(l.pos.meses[0]).toBe("2027-07");
    expect(l.pos.meses.at(-1)).toBe("2029-09"); // out/2026 + 35 meses
  });

  it("anual em dezembro ou semestral em junho e dezembro", () => {
    const base = { ...brooklin, empreendimento: empreendimentoMA("Elevato Brooklin") };
    expect(porId(linhasMA(base)).inter.meses).toEqual(["2027-12"]);
    expect(porId(linhasMA({ ...base, intermediaria: "semestral" })).inter.meses).toEqual([
      "2027-06",
      "2027-12",
    ]);
  });

  it("cada mês sem assinar é uma mensal a menos", () => {
    const qtd = (hoje: string) => porId(linhasMA({ ...brooklin, hoje })).mensal.qtd;
    expect([qtd("2026-10"), qtd("2026-11"), qtd("2026-12"), qtd("2027-01")]).toEqual([4, 3, 2, 1]);
  });

  it("empreendimento com '—' na política: só ato, entradas e mensais até o habite-se informado", () => {
    const inajar = { ...brooklin, empreendimento: empreendimentoMA("MA Inajar") };
    const r = simularMA(inajar);
    expect(r.alertas.map((a) => a.codigo)).toContain("sem_habite_se");
    const l = porId(linhasMA({ ...inajar, habiteSe: "2027-06" }));
    expect(l.mensal.qtd).toBe(4);
    expect(l.inter.indisponivel).toMatch(/sem na política/);
    expect(l.unica.qtd).toBe(0);
    expect(l.pos.qtd).toBe(0);
  });

  it("outro empreendimento: única no habite-se informado e pós no mês seguinte", () => {
    const l = porId(
      linhasMA({ ...brooklin, empreendimento: OUTRO_EMPREENDIMENTO_MA, habiteSe: "2027-08" }),
    );
    expect(l.unica.meses).toEqual(["2027-08"]);
    expect(l.pos.meses[0]).toBe("2027-09");
  });
});

describe("associativo", () => {
  it("tetos pela renda líquida e capacidade do fluxo sem as entradas", () => {
    const r = simularMA(brooklin);
    expect(r.saldoConstrutora).toBe(67_720);
    const t = Object.fromEntries(r.linhas.map((l) => [l.id, l.teto]));
    expect(t).toMatchObject({
      ato: null,
      e30: null,
      e60: 6000,
      e90: 6000,
      mensal: 1800,
      unica: 6000,
      pos: 600,
    });
    // 4 × 1.800 + 6.000 + 27 × 600 = 29.400 (abaixo dos 25% de pró-soluto)
    expect(r.capacidadeParcelado).toBe(29_400);
    expect(r.atosMinimos).toBe(38_320);
    expect(r.status).toBe("falta");
  });

  it("preencher pela política fecha com prazo de 36 meses", () => {
    const parcelas = sugestaoPelaPolitica(brooklin);
    expect(parcelas).toMatchObject({ mensal: 1800, unica: 6000, pos: 600, e60: 6000, e90: 6000 });
    expect(parcelas.ato).toBe(13_160);
    expect(parcelas.e30).toBe(13_160);
    const r = simularMA({ ...brooklin, parcelas });
    expect(r.status).toBe("fechou");
    expect(textoStatusMA(r)).toBe("FECHOU! O fluxo atende a política da Mundo Apto.");
    expect(r.prazoMeses).toBe(36);
    expect(r.conferencias.every((c) => c.ok)).toBe(true);
    expect(r.cronograma.at(-1)?.rotulo).toBe("Pós 27/27");
  });

  it("mensais acima de 12%: permitido se a renda comporta e o pró-soluto fica até 25%", () => {
    const e: EntradaMA = {
      ...brooklin,
      empreendimento: empreendimentoMA("Elevato Brooklin"),
      renda: 10_000,
      valorImovel: 301_500,
      parcelas: { mensal: 3_000 },
    };
    const r = simularMA(e);
    const c = r.conferencias.find((x) => x.id === "mensal")!;
    expect(c.atual).toBe("14,9% do preço");
    expect(c.ok).toBe(true);
    expect(c.nota).toMatch(/permitido/);
    // Acima de 30% da renda a exceção não vale.
    const r2 = simularMA({ ...e, parcelas: { mensal: 3_500 } });
    expect(r2.linhas.find((l) => l.id === "mensal")?.excedeu).toBe(true);
    expect(r2.conferencias.find((x) => x.id === "mensal")?.ok).toBe(false);
  });

  it("sem pós o prazo fica abaixo de 36 meses e a conta sai fora da política", () => {
    const e = { ...brooklin, posParcelas: 0 };
    const r = simularMA({ ...e, parcelas: sugestaoPelaPolitica(e) });
    expect(r.diferenca).toBe(0);
    expect(r.prazoMeses).toBe(9);
    expect(r.status).toBe("fechou_fora_da_politica");
    expect(textoStatusMA(r)).toMatch(/Prazo do contrato \(9 meses, no mínimo 36 meses\)/);
  });

  it("parcela abaixo de R$ 100 não passa", () => {
    const r = simularMA({ ...brooklin, parcelas: { mensal: 80 } });
    expect(r.conferencias.find((c) => c.id === "parcela_minima")?.ok).toBe(false);
  });

  it("quanto custa esperar: sai uma mensal (R$ 1.800) e entra uma de pós (R$ 600)", () => {
    const c = cenariosEsperaMA(brooklin);
    expect(c.map((x) => x.mensais)).toEqual([4, 3, 2, 1]);
    expect(c.map((x) => x.diferenca)).toEqual([0, 1_200, 2_400, 3_600]);
  });
});

describe("SFH", () => {
  // MA Santa Cecília, unidade 107: R$ 229.900,00; financiamento de 70%.
  const sfh: EntradaMA = {
    ...brooklin,
    empreendimento: empreendimentoMA("MA Santa Cecília"),
    modalidade: "sfh",
    renda: 8_000,
    valorImovel: 229_900,
    financiamento: 160_930,
    subsidio: 0,
    fgts: 0,
  };

  it("pós só de R$ 100 para fechar 36 meses; ato mínimo de 6%", () => {
    const parcelas = sugestaoPelaPolitica(sfh);
    expect(parcelas).toMatchObject({
      pos: 100,
      mensal: 2400,
      unica: 8000,
      e30: 8000,
      e60: 8000,
      e90: 8000,
    });
    expect(parcelas.ato).toBe(29_270);
    const r = simularMA({ ...sfh, parcelas });
    expect(r.status).toBe("fechou");
    expect(r.prazoMeses).toBe(36);
    // O "24% (mín.)" das mensais aparece, mas não tira o FECHOU.
    const m = r.conferencias.find((c) => c.id === "mensal_min")!;
    expect(m.ok).toBe(false);
    expect(m.bloqueia).toBe(false);
  });

  it("ato abaixo de 6% e financiamento acima de 70% saem da política", () => {
    const r = simularMA({ ...sfh, financiamento: 170_000, parcelas: { ato: 10_000 } });
    const falhas = r.conferencias.filter((c) => !c.ok && c.bloqueia).map((c) => c.id);
    expect(falhas).toEqual(expect.arrayContaining(["ato", "financiamento"]));
  });
});

describe("tabela direta", () => {
  // Estação Aricanduva, unidade 1307: R$ 221.870,00.
  const direta: EntradaMA = {
    ...brooklin,
    empreendimento: empreendimentoMA("Estação Aricanduva"),
    modalidade: "direta",
    renda: 0,
    valorImovel: 221_870,
  };

  it("sem banco: 30% em ato e entradas, 70% nas parcelas", () => {
    const r0 = simularMA(direta);
    expect(r0.saldoConstrutora).toBe(221_870);
    expect(r0.atosMinimos).toBe(66_561);
    const parcelas = sugestaoPelaPolitica(direta);
    const r = simularMA({ ...direta, parcelas });
    expect(r.status).toBe("fechou");
    expect(r.totalEntradas).toBeGreaterThanOrEqual(66_561);
    expect(r.linhas.find((l) => l.id === "mensal")?.qtd).toBe(12);
    expect(r.linhas.find((l) => l.id === "pos")?.indisponivel).toBe("não tem nesta modalidade");
    expect(r.conferencias.map((c) => c.id)).not.toContain("prazo");
  });
});
