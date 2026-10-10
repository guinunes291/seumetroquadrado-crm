// Conversões da tela da planilha de amortização (features/simulador-amortizacao/estado).
import { describe, expect, it } from "vitest";
import { simularFinanciamento } from "@/lib/amortizacao";
import {
  agruparPorAno,
  formInicial,
  linhasParaExcel,
  mesSeguinte,
  paramsDoForm,
  textoResumo,
} from "@/features/simulador-amortizacao/estado";

describe("estado da planilha de amortização", () => {
  it("formulário vira parâmetros do motor (financiado = imóvel − entrada; % → fração)", () => {
    const f = { ...formInicial({ valor: 300_000, entrada: 60_000, renda: 9000 }), dfiPct: 0.004 };
    const p = paramsDoForm(f);
    expect(p.valorFinanciado).toBe(240_000);
    expect(p.rendaFamiliar).toBe(9000);
    expect(p.dfiTaxaMensal).toBeCloseTo(0.00004, 10);
    expect(p.correcaoMensal).toBe(0.17); // TR padrão
    expect(p.mip).toEqual({ modo: "tabela", proponentes: [{ idade: 30, participacao: 1 }] });
    expect(paramsDoForm({ ...f, modoCorrecao: "fixa" }).correcaoMensal).toBe(0);
    expect(paramsDoForm({ ...f, modoSeguro: "proposta", mipPropostaPct: 0.02 }).mip).toEqual({
      modo: "taxa",
      taxaMensal: 0.0002,
    });
  });

  it("obra e extras só entram quando preenchidos", () => {
    const f = formInicial();
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

  it("visão anual agrupa de 12 em 12 e fecha com o total", () => {
    const r = simularFinanciamento({ ...paramsDoForm(formInicial()), sistema: "PRICE" });
    const anos = agruparPorAno(r.linhas);
    expect(anos).toHaveLength(35);
    const soma = anos.reduce((s, a) => s + a.totalPago, 0);
    expect(soma).toBeCloseTo(r.resumo.totalPago, 1);
    expect(anos.at(-1)?.saldoFinal).toBe(0);
  });

  it("Excel e texto do WhatsApp", () => {
    const f = formInicial();
    const r = simularFinanciamento({ ...paramsDoForm(f), sistema: "SAC" });
    expect(Object.keys(linhasParaExcel(r.linhas)[0]!)).toContain("Encargo total");
    const texto = textoResumo(f, { SAC: r });
    expect(texto).toMatch(/1ª parcela: R\$/);
    expect(texto).not.toMatch(/—/); // sem travessão
  });

  it("1ª cobrança padrão é o mês seguinte", () => {
    expect(mesSeguinte(new Date(2026, 9, 10))).toBe("2026-11");
    expect(mesSeguinte(new Date(2026, 11, 3))).toBe("2027-01");
  });
});
