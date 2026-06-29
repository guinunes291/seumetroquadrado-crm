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

describe("brl", () => {
  it("formata em reais", () => {
    expect(brl(214323)).toContain("214.323");
  });
});
