// Motor do fluxo de pagamento com a construtora (src/lib/simuladores/fluxo.ts)
// e os presets/ajustes das construtoras (src/lib/simuladores/construtoras.ts).
// Os valores esperados foram conferidos à mão — a conta de cada caso está no
// comentário ao lado.

import { describe, expect, it } from "vitest";
import {
  competenciaAtual,
  competenciaDeEntrega,
  efeitoDoProximoMes,
  mesesDasIntermediarias,
  indiceMes,
  rotuloMes,
  simularFluxo,
  somarMeses,
  type EntradaFluxo,
} from "@/lib/simuladores/fluxo";
import {
  chaveRegrasAjustadas,
  diferencasDoPreset,
  REGRAS_PADRAO,
  regrasComAjustes,
  SIMULADORES_CONSTRUTORAS,
  simuladorPorId,
} from "@/lib/simuladores/construtoras";
import { estimarRecursosPelaRenda } from "@/lib/simuladores/recursos";
import { calcularOrcamento, TETO_PARCELAMENTO_CONSTRUTORA } from "@/lib/orcamento";

// Cliente de referência: imóvel de R$ 260 mil, banco + subsídio + FGTS somam
// R$ 210 mil → R$ 50 mil com a construtora. Ato de 3 mil e chaves de 9 mil
// deixam R$ 38 mil para as mensais. Simulando em out/2026 com entrega em
// jun/2028: mensais de nov/2026 a mai/2028 = 19 parcelas de R$ 2.000.
const base = (patch: Partial<EntradaFluxo> = {}): EntradaFluxo => ({
  hoje: "2026-10",
  entrega: "2028-06",
  ultimaMensal: null,
  valorImovel: 260_000,
  financiamento: 190_000,
  subsidio: 8_000,
  fgts: 12_000,
  ato: 3_000,
  intermediariaValor: 0,
  chaves: 9_000,
  posChavesParcelas: 0,
  modo: "fechar_nas_mensais",
  mensalFixa: 0,
  renda: 0,
  parcelaBanco: 0,
  regras: { ...REGRAS_PADRAO, inccAnualPct: 0 },
  ...patch,
});

const codigos = (r: ReturnType<typeof simularFluxo>) => r.alertas.map((a) => a.codigo);

describe("meses", () => {
  it("índice, soma e rótulo atravessam a virada do ano", () => {
    expect(somarMeses("2026-11", 2)).toBe("2027-01");
    expect(somarMeses("2027-01", -1)).toBe("2026-12");
    expect(rotuloMes("2026-10")).toBe("out/2026");
    expect(indiceMes("2026-13")).toBeNaN();
    expect(indiceMes(null)).toBeNaN();
    expect(competenciaAtual(new Date(2026, 9, 11))).toBe("2026-10");
  });

  it("entrega do cadastro: sem mês vira dezembro (o último possível do ano anunciado)", () => {
    expect(competenciaDeEntrega(6, 2028)).toBe("2028-06");
    expect(competenciaDeEntrega(null, 2028)).toBe("2028-12");
    expect(competenciaDeEntrega(6, null)).toBeNull();
  });
});

describe("fluxo — fechar o saldo nas mensais", () => {
  it("19 mensais de R$ 2.000 entre nov/2026 e mai/2028 (mês anterior à entrega)", () => {
    const r = simularFluxo(base());
    expect(r.valido).toBe(true);
    expect(r.recursos.total).toBe(210_000);
    expect(r.saldoConstrutora).toBe(50_000);
    expect(r.parcelado).toBe(47_000); // tudo menos o ato
    expect(r.parceladoPct).toBeCloseTo(18.08, 2); // 47.000 / 260.000
    expect(r.mensais).toEqual({
      quantidade: 19,
      valor: 2_000,
      primeira: "2026-11",
      ultima: "2028-05",
    });
    expect(r.chaves).toEqual({ valor: 9_000, competencia: "2028-06" });
    expect(r.totalNominal).toBe(50_000);
    expect(r.alertas).toEqual([]);
    // Cronograma: ato no mês da assinatura, chaves na entrega.
    expect(r.parcelas[0]).toMatchObject({ tipo: "ato", competencia: "2026-10", valor: 3_000 });
    expect(r.parcelas.at(-1)).toMatchObject({ tipo: "chaves", competencia: "2028-06" });
  });

  it("cada mês que passa o produto perde uma mensal e a mensal sobe", () => {
    // Em nov/2026: 18 mensais (dez/2026 a mai/2028). 38.000 / 18 = 2.111,11;
    // a última absorve o centavo: 38.000 − 2.111,11 × 17 = 2.111,13.
    const nov = simularFluxo(base({ hoje: "2026-11" }));
    expect(nov.mensais.quantidade).toBe(18);
    expect(nov.mensais.valor).toBe(2_111.11);
    const mensais = nov.parcelas.filter((p) => p.tipo === "mensal");
    expect(mensais.at(-1)!.valor).toBe(2_111.13);
    expect(nov.totalNominal).toBe(50_000);

    const efeito = efeitoDoProximoMes(base());
    expect(efeito.mensaisPerdidas).toBe(1);
    expect(efeito.aumentoMensal).toBe(111.11);
    expect(efeito.aumentoChaves).toBe(0);
  });

  it("'mensais até mm/aaaa' da tabela manda na última mensal", () => {
    const r = simularFluxo(base({ ultimaMensal: "2027-12" }));
    expect(r.mensais.quantidade).toBe(14); // nov/2026 a dez/2027
    expect(r.mensais.ultima).toBe("2027-12");
    const depois = simularFluxo(base({ ultimaMensal: "2028-08" }));
    expect(codigos(depois)).toContain("ultima_depois_da_entrega");
  });

  it("entrega que já passou: sem mensais, o saldo vai inteiro para as chaves deste mês", () => {
    const r = simularFluxo(base({ entrega: "2026-09" }));
    expect(r.mensais.quantidade).toBe(0);
    expect(r.chaves).toEqual({ valor: 47_000, competencia: "2026-10" });
    expect(codigos(r)).toEqual(expect.arrayContaining(["entrega_passou", "sem_mensais"]));
    expect(r.totalNominal).toBe(50_000);
  });

  it("sem valor do imóvel não há simulação", () => {
    expect(simularFluxo(base({ valorImovel: 0 })).valido).toBe(false);
    expect(simularFluxo(base({ entrega: "" })).valido).toBe(false);
  });
});

describe("intermediárias", () => {
  it("caem no prazo das mensais conforme a periodicidade (e também somem com o tempo)", () => {
    const hoje = indiceMes("2026-10");
    const ultima = indiceMes("2028-05");
    expect(mesesDasIntermediarias("dezembro", hoje, ultima)).toEqual(["2026-12", "2027-12"]);
    expect(mesesDasIntermediarias("anual", hoje, ultima)).toEqual(["2027-10"]);
    expect(mesesDasIntermediarias("semestral", hoje, ultima)).toEqual([
      "2027-04",
      "2027-10",
      "2028-04",
    ]);
    expect(mesesDasIntermediarias("nenhuma", hoje, ultima)).toEqual([]);
  });

  it("saem do saldo antes da divisão nas mensais", () => {
    // 2 balões de dezembro de R$ 5.700 = 11.400 → 38.000 − 11.400 = 26.600 / 19 = 1.400.
    const r = simularFluxo(
      base({
        intermediariaValor: 5_700,
        regras: { ...REGRAS_PADRAO, inccAnualPct: 0, intermediarias: "dezembro" },
      }),
    );
    expect(r.intermediarias).toEqual({
      quantidade: 2,
      valor: 5_700,
      meses: ["2026-12", "2027-12"],
    });
    expect(r.mensais.valor).toBe(1_400);
    expect(r.totalNominal).toBe(50_000);
    // Dezembro tem mensal E balão: a mensal vem primeiro no cronograma.
    const dez = r.parcelas.filter((p) => p.competencia === "2026-12").map((p) => p.tipo);
    expect(dez).toEqual(["mensal", "intermediaria"]);
  });
});

describe("mensal fixa (o resto vai para as chaves)", () => {
  it("R$ 1.500 × 19 = 28.500 → chaves de 18.500", () => {
    const r = simularFluxo(base({ modo: "mensal_fixa", mensalFixa: 1_500 }));
    expect(r.mensais.valor).toBe(1_500);
    expect(r.chaves.valor).toBe(18_500); // 50.000 − 3.000 − 28.500
    expect(r.totalNominal).toBe(50_000);
    // No mês que vem a mensal fica e as chaves crescem uma mensal.
    expect(efeitoDoProximoMes(base({ modo: "mensal_fixa", mensalFixa: 1_500 })).aumentoChaves).toBe(
      1_500,
    );
  });

  it("mensal que quita antes das chaves é cortada no máximo possível", () => {
    // 47.000 / 19 = 2.473,68 (para baixo, ao centavo)
    const r = simularFluxo(base({ modo: "mensal_fixa", mensalFixa: 3_000 }));
    expect(codigos(r)).toContain("mensal_fixa_alta");
    expect(r.alertas[0].texto).toContain("2.473,68");
    expect(r.chaves.valor).toBe(0);
    expect(r.totalNominal).toBe(50_000);
  });
});

describe("pós-chaves", () => {
  const regrasPos = { ...REGRAS_PADRAO, inccAnualPct: 0, posChavesPermitido: true };

  it("divide o resto por obra + pós e financia o que atravessa as chaves com juros (Price)", () => {
    // 38.000 / (19 + 12) = 1.225,81 na obra; nas chaves sobram
    // 38.000 − 1.225,81 × 19 = 14.709,61, em 12x a 1% a.m. = 1.306,93
    // (conferido com Decimal: 1.306,9310...).
    const r = simularFluxo(base({ posChavesParcelas: 12, regras: regrasPos }));
    expect(r.mensais.valor).toBe(1_225.81);
    expect(r.posChaves.saldoNasChaves).toBe(14_709.61);
    expect(r.posChaves.valor).toBe(1_306.93);
    expect(r.posChaves.primeira).toBe("2028-07");
    expect(r.posChaves.ultima).toBe("2029-06");
    expect(r.posChaves.juros).toBe(973.55); // 1.306,93 × 12 − 14.709,61
    expect(r.totalNominal).toBe(50_973.55);
  });

  it("respeita a permissão e o teto da construtora", () => {
    expect(codigos(simularFluxo(base({ posChavesParcelas: 12 })))).toContain(
      "pos_chaves_nao_permitido",
    );
    const r = simularFluxo(
      base({ posChavesParcelas: 36, regras: { ...regrasPos, posChavesMaxParcelas: 24 } }),
    );
    expect(r.posChaves.quantidade).toBe(24);
    expect(codigos(r)).toContain("pos_chaves_teto");
  });
});

describe("regras da construtora", () => {
  it("teto de parcelamento (regra 80/20 do CRM) aponta quanto falta", () => {
    expect(REGRAS_PADRAO.parceladoMaxPct).toBe(TETO_PARCELAMENTO_CONSTRUTORA * 100);
    // Financiamento de 150 mil: saldo 90.000, parcelado 87.000 (33,5%); o teto
    // de 20% é 52.000 → faltam 35.000.
    const r = simularFluxo(base({ financiamento: 150_000 }));
    const alerta = r.alertas.find((a) => a.codigo === "parcelado_maximo");
    expect(alerta?.nivel).toBe("erro");
    expect(alerta?.texto).toContain("35.000,00");
  });

  it("ato mínimo vale o maior entre o percentual e o piso em reais", () => {
    const regras = { ...REGRAS_PADRAO, inccAnualPct: 0, atoMinimoPct: 2, atoMinimoValor: 1_000 };
    const r = simularFluxo(base({ regras }));
    expect(r.atoMinimo).toBe(5_200); // 2% de 260 mil
    expect(codigos(r)).toContain("ato_minimo");
    expect(codigos(simularFluxo(base({ regras, ato: 5_200 })))).not.toContain("ato_minimo");
  });

  it("piso da mensal e comprometimento de renda", () => {
    const regras = {
      ...REGRAS_PADRAO,
      inccAnualPct: 0,
      mensalMinima: 2_500,
      comprometimentoMaxPct: 35,
    };
    const r = simularFluxo(base({ regras, renda: 9_000, parcelaBanco: 1_500 }));
    expect(codigos(r)).toContain("mensal_minima");
    // (2.000 + 1.500) / 9.000 = 38,9% > 35%
    expect(r.comprometimento?.obraPct).toBeCloseTo(38.89, 2);
    expect(r.comprometimento?.mensalPct).toBeCloseTo(22.22, 2);
    expect(codigos(r)).toContain("comprometimento");
  });

  it("recursos acima do valor e ato + chaves acima do saldo são erros", () => {
    expect(codigos(simularFluxo(base({ financiamento: 250_000 })))).toContain(
      "recursos_maior_que_valor",
    );
    const r = simularFluxo(base({ chaves: 60_000 }));
    expect(codigos(r)).toContain("excedente");
    expect(r.mensais.valor).toBe(0);
  });
});

describe("projeção do INCC", () => {
  it("corrige cada parcela até o mês dela; o ato não corrige", () => {
    const r = simularFluxo(base({ regras: { ...REGRAS_PADRAO } })); // 6,55% a.a.
    const ato = r.parcelas.find((p) => p.tipo === "ato")!;
    expect(ato.valorCorrigido).toBe(ato.valor);
    const chaves = r.parcelas.find((p) => p.tipo === "chaves")!;
    // 20 meses de obra: 9.000 × 1,0655^(20/12) = 10.003,80 (≈ +11%)
    expect(chaves.valorCorrigido).toBeCloseTo(9_000 * Math.pow(1.0655, 20 / 12), 1);
    expect(r.totalCorrigido).toBeGreaterThan(r.totalNominal);
  });
});

describe("presets e ajustes por usuário", () => {
  it("as quatro construtoras pedidas, na ordem pedida; só a Direcional a conferir", () => {
    expect(SIMULADORES_CONSTRUTORAS.map((s) => s.nome)).toEqual([
      "Vibra",
      "Direcional",
      "Longitude",
      "Mundo Apto",
    ]);
    expect(simuladorPorId("nao-existe").id).toBe("vibra");
    expect(SIMULADORES_CONSTRUTORAS.map((s) => [s.id, s.modelo, !!s.conferidoEm])).toEqual([
      ["vibra", "tabela_vibra", true],
      ["direcional", "generico", false],
      ["longitude", "premissas_longitude", true],
      ["mundo-apto", "politica_mundo_apto", true],
    ]);
    // Trocar de modelo subiu a versão: ajustes de regra salvos antes não valem.
    expect(chaveRegrasAjustadas(simuladorPorId("mundo-apto"))).toBe(
      "simuladores:regras:v2:mundo-apto",
    );
    expect(chaveRegrasAjustadas(simuladorPorId("direcional"))).toBe(
      "simuladores:regras:v1:direcional",
    );
  });

  it("ajuste salvo se sobrepõe ao preset; tipo errado é ignorado", () => {
    const ajustado = regrasComAjustes(REGRAS_PADRAO, {
      atoMinimoPct: 1,
      intermediarias: "anual",
      mensalMinima: "300" as unknown as number,
    });
    expect(ajustado.atoMinimoPct).toBe(1);
    expect(ajustado.intermediarias).toBe("anual");
    expect(ajustado.mensalMinima).toBe(REGRAS_PADRAO.mensalMinima);
    expect(diferencasDoPreset(REGRAS_PADRAO, ajustado)).toEqual({
      atoMinimoPct: 1,
      intermediarias: "anual",
    });
    expect(regrasComAjustes(REGRAS_PADRAO, null)).toBe(REGRAS_PADRAO);
  });
});

describe("recursos estimados pela renda (tabela APROVE)", () => {
  it("financia o menor entre o máximo da renda e 80% do imóvel", () => {
    const dados = { renda: 4_500, tem36MesesRegistro: false, temDependente: true };
    const orc = calcularOrcamento(dados);
    expect(orc.enquadra).toBe(true);

    const caro = estimarRecursosPelaRenda({ ...dados, valorImovel: 1_000_000 });
    expect(caro.financiamento).toBe(Math.round(orc.financiamento));
    expect(caro.limitadoPeloImovel).toBe(false);
    expect(caro.subsidio).toBe(orc.subsidio);

    const barato = estimarRecursosPelaRenda({ ...dados, valorImovel: 100_000 });
    expect(barato.financiamento).toBe(Math.min(Math.round(orc.financiamento), 80_000));
    if (barato.limitadoPeloImovel) {
      expect(barato.parcelaBanco).toBeLessThan(orc.parcelaEstimada);
    }
  });

  it("renda fora da tabela não inventa financiamento", () => {
    const r = estimarRecursosPelaRenda({
      renda: 100,
      tem36MesesRegistro: false,
      temDependente: false,
      valorImovel: 200_000,
    });
    expect(r.enquadra).toBe(false);
    expect(r.financiamento).toBe(0);
  });
});
