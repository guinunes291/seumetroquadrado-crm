// PDF da planilha de amortização (único formato de exportação, 2026-10-11).
import { describe, expect, it } from "vitest";
import { analisarAmortizacoes, simularFinanciamento } from "@/lib/amortizacao";
import { formInicial, paramsDoForm } from "@/features/simulador-amortizacao/estado";
import { montarHtmlPlanilha, tituloPdf } from "@/features/simulador-amortizacao/planilha-pdf";

const form = formInicial({ financiamento: 208_000, taxa: 8.16, prazo: 420 });
const base = paramsDoForm(form);
const resultados = {
  SAC: simularFinanciamento({ ...base, sistema: "SAC" }),
  PRICE: simularFinanciamento({ ...base, sistema: "PRICE" }),
};
const quando = new Date(2026, 9, 11, 14, 30);

describe("PDF da planilha de amortização", () => {
  it("nome do arquivo descreve o contrato, sem travessão", () => {
    expect(tituloPdf(form)).toBe("Simulação de financiamento R$ 208 mil em 420 meses");
  });

  it("resumido: contrato, comparativo, leitura, premissas e evolução anual (retrato)", () => {
    const html = montarHtmlPlanilha({ form, resultados, completo: false, geradoEm: quando });
    expect(html).toContain("size: A4 portrait");
    expect(html).toMatch(/R\$\s208\.000,00/);
    expect(html).toContain("Planilha de amortização SAC x PRICE");
    expect(html).toContain("Leitura para o cliente");
    expect(html).toContain("Evolução ano a ano · SAC");
    expect(html).toContain("Evolução ano a ano · PRICE");
    expect(html).toContain("avaliação estimada");
    expect(html).not.toContain("Planilha mês a mês");
    expect(html).not.toContain("—");
  });

  it("completo: inclui as 420 linhas de cada sistema, em paisagem", () => {
    const html = montarHtmlPlanilha({ form, resultados, completo: true, geradoEm: quando });
    expect(html).toContain("size: A4 landscape");
    expect(html).toContain("Planilha mês a mês · SAC");
    expect(html).toContain("Planilha mês a mês · PRICE");
    // 420 linhas por sistema + 35 anuais por sistema + comparativo
    const linhas = html.match(/<tr class="/g)?.length ?? 0;
    expect(linhas).toBeGreaterThanOrEqual(2 * 420 + 2 * 35);
  });

  it("um sistema só: sem leitura comparativa", () => {
    const html = montarHtmlPlanilha({
      form: { ...form, visao: "SAC" },
      resultados: { SAC: resultados.SAC },
      completo: false,
      geradoEm: quando,
    });
    expect(html).toContain("Planilha de amortização SAC<");
    expect(html).not.toContain("Leitura para o cliente");
  });

  it("escapa texto (nada vira HTML)", () => {
    const html = montarHtmlPlanilha({ form, resultados, completo: false, geradoEm: quando });
    expect(html).not.toMatch(/<script/i);
  });

  it("com amortização extra: seção de efeito com parcelas tiradas e juros economizados", () => {
    const comExtra = {
      ...form,
      extras: [
        { parcela: 24, valor: 10_000, modo: "reduzir_prazo" as const, repetirACada: 24, vezes: 3 },
      ],
    };
    const p = paramsDoForm(comExtra);
    const res = {
      SAC: simularFinanciamento({ ...p, sistema: "SAC" }),
      PRICE: simularFinanciamento({ ...p, sistema: "PRICE" }),
    };
    const analises = {
      SAC: analisarAmortizacoes({ ...p, sistema: "SAC" })!,
      PRICE: analisarAmortizacoes({ ...p, sistema: "PRICE" })!,
    };
    const html = montarHtmlPlanilha({
      form: comExtra,
      resultados: res,
      analises,
      completo: false,
      geradoEm: quando,
    });
    expect(html).toContain("Efeito das amortizações · SAC");
    expect(html).toContain("Efeito das amortizações · PRICE");
    expect(html).toContain("Parcelas tiradas pela amortização");
    expect(html).toContain("Juros economizados");
    expect(html).toContain(`${analises.PRICE.total.parcelasTiradas} parcelas</strong>`);
    expect(html).not.toContain("—");
  });
});
