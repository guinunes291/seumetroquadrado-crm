// PDF do fluxo da construtora (único formato de exportação dos Simuladores).
import { describe, expect, it } from "vitest";
import { simularFluxo } from "@/lib/simuladores/fluxo";
import { REGRAS_PADRAO } from "@/lib/simuladores/construtoras";
import { cenariosDeEspera, entradaDoForm, formInicial } from "@/features/simuladores/estado";
import { montarHtmlFluxo, tituloPdfFluxo } from "@/features/simuladores/fluxo-pdf";

const regras = { ...REGRAS_PADRAO };
// O cliente de referência dos testes do motor: 19 mensais de R$ 2.000.
const form = {
  ...formInicial(
    { valor: 260_000, financiamento: 190_000, subsidio: 8_000, fgts: 12_000 },
    "2026-10",
  ),
  rotuloUnidade: "Apto 104 · Bloco B",
  entrega: "2028-06",
  ato: 3_000,
  chaves: 9_000,
};
const entrada = entradaDoForm(form, regras);
const dados = {
  construtora: "Vibra",
  projeto: "Vibra Estação",
  form,
  resultado: simularFluxo(entrada),
  regras,
  cenarios: cenariosDeEspera(entrada),
  geradoEm: new Date(2026, 9, 11, 14, 30),
};

describe("PDF do fluxo", () => {
  it("nome do arquivo diz construtora, projeto e mês, sem travessão", () => {
    expect(tituloPdfFluxo(dados)).toBe("Fluxo de pagamento Vibra Vibra Estação out 2026");
  });

  it("A4 retrato com recursos, fluxo, quanto custa esperar e o cronograma inteiro", () => {
    const html = montarHtmlFluxo(dados);
    expect(html).toContain("size: A4 portrait");
    expect(html).toContain("De onde vem o dinheiro");
    expect(html).toMatch(/19 mensais de R\$\s2\.000,00 \(nov\/2026 a mai\/2028\)/);
    expect(html).toContain("Quanto custa esperar");
    expect(html).toContain("out/2026 (agora)");
    expect(html).toContain("Mensal 19/19");
    expect(html).toContain("Apto 104 · Bloco B");
    // ato + 19 mensais + chaves no cronograma; 4 cenários; 4 linhas de recursos
    expect(html.match(/<tr class="/g)?.length).toBe(21 + 4 + 4);
    expect(html).not.toContain("—");
  });

  it("escapa texto (nada vira HTML)", () => {
    const html = montarHtmlFluxo({ ...dados, projeto: "<script>alert(1)</script>" });
    expect(html).not.toMatch(/<script/i);
  });
});
