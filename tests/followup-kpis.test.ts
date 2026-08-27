import { describe, expect, it } from "vitest";
import { resumoKpis, taxaResposta, type TentativaRow } from "@/features/followup/kpis-client";

const row = (
  tentativa: number,
  enviados: number,
  respondidos: number,
  avancaram = 0,
): TentativaRow => ({ tentativa, enviados, respondidos, avancaram });

describe("taxaResposta", () => {
  it("curva vazia → 0 (não NaN)", () => {
    expect(taxaResposta([])).toBe(0);
  });

  it("enviados 0 em todas as linhas → 0 (guarda de divisão por zero)", () => {
    expect(taxaResposta([row(1, 0, 0), row(2, 0, 0)])).toBe(0);
  });

  it("agrega todas as tentativas e arredonda a 1 casa", () => {
    // 1 resposta em 3 toques = 33,333…% → 33.3
    expect(taxaResposta([row(1, 3, 1)])).toBe(33.3);
    // 2/3 = 66,666…% → arredonda para CIMA (66.7), não trunca
    expect(taxaResposta([row(1, 2, 1), row(2, 1, 1)])).toBe(66.7);
    // taxa exata não ganha casa fantasma
    expect(taxaResposta([row(1, 10, 5)])).toBe(50);
  });
});

describe("resumoKpis", () => {
  it("curva vazia → tudo zerado", () => {
    expect(resumoKpis([])).toEqual({
      enviados: 0,
      respondidos: 0,
      taxaPct: 0,
      reativados: 0,
      avancaram: 0,
    });
  });

  it("soma enviados/respondidos/avancaram através das tentativas", () => {
    const r = resumoKpis([row(1, 100, 30, 10), row(2, 60, 12, 4), row(3, 40, 8, 2)]);
    expect(r.enviados).toBe(200);
    expect(r.respondidos).toBe(50);
    expect(r.avancaram).toBe(16);
  });

  it("reativados contam SÓ respostas do 3º toque em diante", () => {
    const r = resumoKpis([
      row(1, 100, 40), // não conta
      row(2, 80, 20), // não conta
      row(3, 50, 7), // conta (limite inclusivo)
      row(4, 30, 3), // conta
      row(13, 5, 2), // conta
    ]);
    expect(r.reativados).toBe(12);
    expect(r.respondidos).toBe(72); // reativados é um recorte, não o total
  });

  it("taxaPct sai arredondada a 1 casa e com guarda de zero", () => {
    // 1/3 → 33.3
    expect(resumoKpis([row(1, 3, 1)]).taxaPct).toBe(33.3);
    // enviados 0 mas com linha presente → 0, sem NaN
    expect(resumoKpis([row(5, 0, 0)]).taxaPct).toBe(0);
  });
});
