import { describe, it, expect } from "vitest";
import {
  consultarLinhaAprove,
  calcularOrcamento,
  avaliarAderencia,
  brl,
} from "@/lib/orcamento";

describe("orçamento APROVE 2026 — consulta", () => {
  it("renda abaixo do mínimo não enquadra", () => {
    expect(consultarLinhaAprove(1000)).toBeNull();
    expect(calcularOrcamento({ renda: 1000, tem36MesesRegistro: false, temDependente: false }).enquadra).toBe(false);
  });

  it("pega o degrau igual ou imediatamente inferior (arredonda pra baixo)", () => {
    expect(consultarLinhaAprove(1700)?.renda).toBe(1700);
    expect(consultarLinhaAprove(5050)?.renda).toBe(5000.01); // 5000.01 <= 5050 < 5100
  });

  it("acima do máximo usa o último degrau", () => {
    expect(consultarLinhaAprove(30000)?.renda).toBe(25000);
  });
});

describe("orçamento APROVE 2026 — cálculo (regra 80/20)", () => {
  it("Faixa 1 com dependente, sem redutor: teto = (fin+sub)/0,80, limitado pela avaliação", () => {
    const orc = calcularOrcamento({ renda: 3000, tem36MesesRegistro: false, temDependente: true });
    expect(orc.enquadra).toBe(true);
    expect(orc.faixa).toBe(1);
    expect(orc.segmento).toBe("HIS1");
    expect(orc.financiamento).toBe(161640.3);
    expect(orc.subsidio).toBe(9818);
    expect(orc.usouRedutor).toBe(false);
    // (161640.3 + 9818) / 0.8 = 214322.875 → arredonda
    expect(orc.tetoImovel).toBe(214323);
  });

  it("redutor (36 meses) aumenta o financiamento", () => {
    const sem = calcularOrcamento({ renda: 3000, tem36MesesRegistro: false, temDependente: false });
    const com = calcularOrcamento({ renda: 3000, tem36MesesRegistro: true, temDependente: false });
    expect(com.financiamento).toBeGreaterThan(sem.financiamento);
    expect(com.usouRedutor).toBe(true);
  });

  it("FGTS e entrada entram nos recursos e empurram o teto", () => {
    const base = calcularOrcamento({ renda: 3000, tem36MesesRegistro: false, temDependente: false });
    const comRecursos = calcularOrcamento({
      renda: 3000,
      tem36MesesRegistro: false,
      temDependente: false,
      fgts: 20000,
      entrada: 10000,
    });
    expect(comRecursos.recursosNaoConstrutora).toBe(base.recursosNaoConstrutora + 30000);
    expect(comRecursos.tetoImovel).toBeGreaterThan(base.tetoImovel);
  });
});

describe("orçamento APROVE 2026 — aderência do imóvel", () => {
  const orc = calcularOrcamento({ renda: 3000, tem36MesesRegistro: true, temDependente: true });

  it("imóvel dentro do teto cabe e calcula a parcela com a construtora", () => {
    const a = avaliarAderencia(200000, orc);
    expect(a.cabe).toBe(true);
    expect(a.dentroDaAvaliacao).toBe(true);
    expect(a.percentualConstrutora).toBeLessThanOrEqual(20);
    expect(a.folga).toBeGreaterThan(0);
  });

  it("imóvel acima da avaliação do segmento não cabe", () => {
    const a = avaliarAderencia(300000, orc); // F1 avalia até 275k
    expect(a.dentroDaAvaliacao).toBe(false);
    expect(a.cabe).toBe(false);
    expect(a.folga).toBeLessThan(0);
  });
});

describe("orçamento APROVE 2026 — financiamento é TETO, não aporte fixo", () => {
  // Regressão: renda 11000 (F4/HMP, finSem 372.322,53), entrada 1.512, imóvel 350k.
  // O banco financia no máximo 80% de 350k = 280k (não os 372k da renda). Os 20%
  // restantes (70k) saem da entrada (1.512) + construtora -> ~19,6%, NÃO 0%.
  const orc = calcularOrcamento({
    renda: 11000,
    tem36MesesRegistro: false,
    temDependente: false,
    entrada: 1512,
  });

  it("limita o financiamento a 80% do imóvel mais barato", () => {
    const a = avaliarAderencia(350000, orc);
    expect(a.cabe).toBe(true);
    expect(a.valorParcelarConstrutora).toBe(68488); // 350000 - 280000 - 1512
    expect(a.percentualConstrutora).toBe(19.6);
    expect(a.valorParcelarConstrutora).toBeGreaterThan(0); // o bug dava 0
  });

  it("construtora só zera quando os recursos próprios cobrem os 20%", () => {
    const comEntradaAlta = calcularOrcamento({
      renda: 11000,
      tem36MesesRegistro: false,
      temDependente: false,
      entrada: 80000, // cobre os 70k que faltam acima dos 80% financiados
    });
    const a = avaliarAderencia(350000, comEntradaAlta);
    expect(a.valorParcelarConstrutora).toBe(0);
    expect(a.percentualConstrutora).toBe(0);
    expect(a.cabe).toBe(true);
  });

  it("imóvel acima do teto estoura o parcelamento da construtora (>20%)", () => {
    const a = avaliarAderencia(500000, orc); // dentro da avaliação (600k), mas caro
    expect(a.dentroDaAvaliacao).toBe(true);
    expect(a.estouraParcelamento).toBe(true);
    expect(a.percentualConstrutora).toBeGreaterThan(20);
    expect(a.cabe).toBe(false);
  });
});

describe("brl", () => {
  it("formata em reais", () => {
    expect(brl(214323)).toContain("214.323");
  });
});
