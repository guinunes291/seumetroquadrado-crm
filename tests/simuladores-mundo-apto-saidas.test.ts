// Saídas da aba Mundo Apto: o texto do WhatsApp e o PDF (a folha com a
// conferência da política).
import { describe, expect, it } from "vitest";
import { cenariosEsperaMA, simularMA, sugestaoPelaPolitica } from "@/lib/simuladores/mundo-apto";
import {
  entradaMADoForm,
  formInicialMA,
  linhasDoFluxoMA,
  textoWhatsAppMA,
  type FormMA,
} from "@/features/simuladores/mundo-apto-estado";
import { montarHtmlMA, tituloPdfMA } from "@/features/simuladores/mundo-apto-pdf";

const nbsp = (s: string) => s.replace(/\u00a0/g, " ");

function montar(): FormMA {
  const f: FormMA = {
    ...formInicialMA(
      { valor: 322_720, renda: 6_000, financiamento: 230_000, subsidio: 10_000, fgts: 15_000 },
      "2026-10",
    ),
    empreendimento: "MA Brooklin",
    rotuloUnidade: "2006",
  };
  return { ...f, parcelas: sugestaoPelaPolitica(entradaMADoForm(f)) };
}

describe("estado da aba Mundo Apto", () => {
  it("linhas do fluxo em ordem de leitura", () => {
    const r = simularMA(entradaMADoForm(montar()));
    expect(linhasDoFluxoMA(r).map(nbsp)).toEqual([
      "Ato (out/2026): R$ 13.160,00",
      "Entrada 30 dias (nov/2026): R$ 13.160,00",
      "Entrada 60 dias (dez/2026): R$ 6.000,00",
      "Entrada 90 dias (jan/2027): R$ 6.000,00",
      "4 mensais de R$ 1.800,00 durante a obra (fev/2027 a mai/2027)",
      "Parcela única no habite-se (jun/2027): R$ 6.000,00",
      "27 mensais pós habite-se de R$ 600,00 (jul/2027 a set/2029)",
    ]);
  });

  it("WhatsApp: modalidade, recursos, fluxo e condições", () => {
    const f = montar();
    const texto = nbsp(textoWhatsAppMA({ form: f, resultado: simularMA(entradaMADoForm(f)) }));
    expect(texto).toContain("*Simulação de fluxo: Mundo Apto · MA Brooklin*");
    expect(texto).toContain("Modalidade: Associativo");
    expect(texto).toContain(
      "Financiamento: R$ 230.000,00 · Subsídio: R$ 10.000,00 · FGTS: R$ 15.000,00",
    );
    expect(texto).toContain("*Com a construtora: R$ 67.720,00*");
    expect(texto).toContain("Habite-se previsto: jun/2027.");
    expect(texto).toContain("mensal pós por IPCA + 1%");
    expect(texto).not.toContain("—");
  });
});

describe("PDF da Mundo Apto", () => {
  const f = montar();
  const e = entradaMADoForm(f);
  const html = montarHtmlMA({
    form: f,
    resultado: simularMA(e),
    cenarios: cenariosEsperaMA(e),
    geradoEm: new Date(2026, 9, 11, 14, 30),
  });

  it("nome do arquivo sem travessão", () => {
    expect(tituloPdfMA(f)).toBe("Fluxo de pagamento Mundo Apto MA Brooklin out 2026");
  });

  it("folha com teto pela renda líquida, conferência da política e status", () => {
    expect(html).toContain("size: A4 portrait");
    expect(nbsp(html)).toContain("máx. R$ 1.800,00 cada (30% da renda líquida)");
    expect(html).toContain("Conferência da política");
    expect(html).toContain("Prazo do contrato");
    expect(html).toContain("FECHOU! O fluxo atende a política da Mundo Apto.");
    expect(html).toContain("Pós 27/27");
    expect(html).not.toContain("—");
    expect(html).not.toMatch(/<script/i);
  });
});
