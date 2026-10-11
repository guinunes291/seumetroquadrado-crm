// Conversões da tela da planilha de amortização (features/simulador-amortizacao).
// Entrada da tela (2026-10-11): só valor do financiamento, taxa a.a. e prazo.
import { describe, expect, it } from "vitest";
import { simularFinanciamento } from "@/lib/amortizacao";
import {
  agruparPorAno,
  avaliacaoEstimada,
  baseDfiDe,
  formInicial,
  lerDecimal,
  leituraComercial,
  linhasComparativo,
  mesSeguinte,
  paramsDoForm,
  resumoAjustes,
  textoResumo,
} from "@/features/simulador-amortizacao/estado";
import { prefillDaAprovacao } from "@/features/simulador-amortizacao/prefill-lead";

const contrato = { financiamento: 208_000, taxa: 8.16, prazo: 420 };

describe("entrada: os três dados do contrato", () => {
  it("sem prefill, os três campos começam vazios (não há número de exemplo)", () => {
    const f = formInicial();
    expect(f.valorFinanciamento).toBe(0);
    expect(f.taxaAnual).toBe(0);
    expect(f.prazoMeses).toBe(0);
    expect(f.visao).toBe("comparar");
  });

  it("financiamento, taxa e prazo vão direto para o motor; o resto tem padrão", () => {
    const p = paramsDoForm(formInicial(contrato));
    expect(p.valorFinanciado).toBe(208_000);
    expect(p.taxaJurosAnual).toBe(8.16);
    expect(p.prazoMeses).toBe(420);
    expect(p.tipoTaxa).toBe("nominal");
    expect(p.correcaoMensal).toBe(0.17); // TR padrão
    expect(p.taxaAdministracao).toBe(25);
    expect(p.mip).toEqual({ modo: "tabela", proponentes: [{ idade: 30, participacao: 1 }] });
  });

  it("base do DFI: avaliação informada ou financiamento ÷ 0,8", () => {
    const f = formInicial(contrato);
    expect(avaliacaoEstimada(f)).toBe(260_000);
    expect(baseDfiDe(f)).toBe(260_000);
    expect(paramsDoForm(f).valorImovel).toBe(260_000);
    const g = formInicial({ ...contrato, avaliacao: 275_000 });
    expect(baseDfiDe(g)).toBe(275_000);
  });

  it("sistema do contrato abre direto nele", () => {
    expect(formInicial({ ...contrato, sistema: "SAC" }).visao).toBe("SAC");
  });

  it("percentuais viram fração e as opções mudam a conta", () => {
    const f = { ...formInicial(contrato), dfiPct: 0.004 };
    expect(paramsDoForm(f).dfiTaxaMensal).toBeCloseTo(0.00004, 10);
    expect(paramsDoForm({ ...f, modoCorrecao: "fixa" }).correcaoMensal).toBe(0);
    expect(paramsDoForm({ ...f, modoSeguro: "proposta", mipPropostaPct: 0.02 }).mip).toEqual({
      modo: "taxa",
      taxaMensal: 0.0002,
    });
  });
});

describe("digitação", () => {
  it("taxa aceita vírgula e ponto como decimal", () => {
    expect(lerDecimal("8,16")).toBe(8.16);
    expect(lerDecimal("8.16")).toBe(8.16);
    expect(lerDecimal("0,0038")).toBe(0.0038);
    expect(lerDecimal("0.015")).toBe(0.015); // não é 15
    expect(lerDecimal("")).toBeNull();
    expect(lerDecimal(",")).toBe(null);
  });
});

describe("ajustes automáticos", () => {
  it("o cabeçalho recolhido diz o que entrou na conta", () => {
    const f = formInicial(contrato);
    expect(resumoAjustes(f)).toBe("TR 0,17% a.m. · seguros estimados (30 anos) · taxa adm R$ 25");
    const g = {
      ...f,
      modoCorrecao: "fixa" as const,
      obraAtiva: true,
      modoSeguro: "proposta" as const,
    };
    expect(resumoAjustes(g)).toBe(
      "sem correção · seguros da proposta · taxa adm R$ 25 · obra 24 meses",
    );
  });

  it("obra e extras só entram quando preenchidos", () => {
    const f = formInicial(contrato);
    expect(paramsDoForm(f).faseObra).toBeUndefined();
    const g = {
      ...f,
      obraAtiva: true,
      extras: [
        { parcela: 24, valor: 10_000, modo: "reduzir_prazo" as const, repetirACada: 24, vezes: 0 },
        { parcela: 12, valor: 0, modo: "reduzir_parcela" as const, repetirACada: 0, vezes: 0 },
      ],
    };
    const p = paramsDoForm(g);
    expect(p.faseObra?.meses).toBe(24);
    expect(p.amortizacoesExtras).toEqual([
      { parcela: 24, valor: 10_000, modo: "reduzir_prazo", repetirACada: 24, vezes: undefined },
    ]);
  });
});

describe("saídas", () => {
  const f = formInicial(contrato);
  const r = simularFinanciamento({ ...paramsDoForm(f), sistema: "PRICE" });

  it("visão anual agrupa de 12 em 12 e fecha com o total", () => {
    const anos = agruparPorAno(r.linhas);
    expect(anos).toHaveLength(35);
    expect(anos.reduce((s, a) => s + a.totalPago, 0)).toBeCloseTo(r.resumo.totalPago, 1);
    expect(anos.at(-1)?.saldoFinal).toBe(0);
  });

  it("comparativo formatado (usado no PDF) traz os itens do resumo", () => {
    const linhas = linhasComparativo({ PRICE: r }, f);
    expect(linhas[0]?.item).toBe("1ª parcela");
    expect(linhas[0]?.SAC).toBe("");
    expect(linhas[0]?.PRICE).toMatch(/^R\$\s1\.559,87$/);
    expect(linhas.map((l) => l.item)).toContain("CET estimado");
    expect(linhas.map((l) => l.item)).not.toContain("Comprometimento da renda"); // sem renda
  });

  it("leitura para o cliente: a mesma frase na tela e no PDF", () => {
    const sac = simularFinanciamento({ ...paramsDoForm(f), sistema: "SAC" });
    const texto = leituraComercial(sac, r).map((fr) => fr.map((t) => t.texto).join(""));
    expect(texto[0]).toMatch(/^O SAC começa R\$\s?408,75 mais caro/);
    expect(texto.join(" ")).toMatch(/saldo devedor sobe até/);
    expect(texto.join(" ")).not.toMatch(/—/);
  });

  it("texto do WhatsApp: financiamento, sem imóvel e sem travessão", () => {
    const texto = textoResumo(f, { PRICE: r });
    expect(texto).toMatch(/Financiamento: R\$\s?208\.000 em 420 meses/);
    expect(texto).not.toMatch(/Imóvel/);
    expect(texto).not.toMatch(/—/);
  });

  it("1ª cobrança padrão é o mês seguinte", () => {
    expect(mesSeguinte(new Date(2026, 9, 10))).toBe("2026-11");
    expect(mesSeguinte(new Date(2026, 11, 3))).toBe("2027-01");
  });
});

describe("prefill pelo dossiê (aprovação de crédito)", () => {
  const aprovacao = {
    valor_financiamento: 185_000.5,
    taxa_juros_anual: 7.66,
    prazo_meses: 420,
    sistema_amortizacao: "price",
    renda_familiar: 5200,
    valor_imovel_simulacao: 264_000,
  };

  it("leva os três dados do contrato, o sistema, a renda da carta e o imóvel da simulação", () => {
    expect(prefillDaAprovacao(aprovacao, "R$ 4.800")).toEqual({
      financiamento: 185_000.5,
      taxa: 7.66,
      prazo: 420,
      sistema: "PRICE",
      renda: 5200,
      avaliacao: 264_000,
    });
  });

  it("sem aprovação (ou sem valor financiado), só a renda do lead segue", () => {
    expect(prefillDaAprovacao(null, "R$ 4.800")).toEqual({ renda: 4800 });
    expect(prefillDaAprovacao({ ...aprovacao, valor_financiamento: null }, null)).toEqual({
      renda: undefined,
    });
  });

  it("campos faltando na carta ficam para o corretor digitar", () => {
    const p = prefillDaAprovacao(
      { ...aprovacao, taxa_juros_anual: null, sistema_amortizacao: null, renda_familiar: null },
      "4800",
    );
    expect(p.taxa).toBeUndefined();
    expect(p.sistema).toBeUndefined();
    expect(p.renda).toBe(4800);
  });
});
