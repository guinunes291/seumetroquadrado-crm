// Saídas da aba Vibra: o texto do WhatsApp e o PDF (a folha do simulador
// oficial, com quanto custa esperar e o cronograma).
import { describe, expect, it } from "vitest";
import { cenariosEsperaVibra, simularVibra, sugestaoPeloTeto } from "@/lib/simuladores/vibra";
import {
  entradaVibraDoForm,
  formInicialVibra,
  linhasDoFluxoVibra,
  textoWhatsAppVibra,
  type FormVibra,
} from "@/features/simuladores/vibra-estado";
import { montarHtmlVibra, tituloPdfVibra } from "@/features/simuladores/vibra-pdf";

const nbsp = (s: string) => s.replace(/\u00a0/g, " ");

function montar(): FormVibra {
  const f: FormVibra = {
    ...formInicialVibra(
      { valor: 300_000, renda: 5_000, financiamento: 210_000, subsidio: 30_000, fgts: 10_000 },
      "2026-10",
    ),
    empreendimento: "Parque Vila Sônia",
    rotuloUnidade: "Apto 12 · Bloco A",
  };
  return { ...f, parcelas: sugestaoPeloTeto(entradaVibraDoForm(f)) };
}

describe("estado da aba Vibra", () => {
  it("o link soma subsídio e FGTS (o simulador oficial pede os dois juntos)", () => {
    const f = formInicialVibra({ subsidio: 30_000, fgts: 10_000 }, "2026-10");
    expect(f.subsidioFgts).toBe(40_000);
    expect(f.documentacao).toBe("gratis");
  });

  it("linhas do fluxo: atos iguais viram uma linha só", () => {
    const r = simularVibra(entradaVibraDoForm(montar()));
    expect(linhasDoFluxoVibra(r).map(nbsp)).toEqual([
      "4 atos de R$ 3.675,00 (out/2026 a jan/2027)",
      "2 mensais de R$ 1.400,00 (fev/2027 a mar/2027)",
      "8 mensais de R$ 1.100,00 (abr/2027 a nov/2027)",
      "7 mensais de R$ 900,00 (dez/2027 a jun/2028)",
      "1 anual de R$ 5.000,00 (dez/2027)",
      "Parcela única (jul/2028): R$ 2.500,00",
      "24 parcelas pós-chave de R$ 500,00 (ago/2028 a jul/2030)",
    ]);
  });

  it("WhatsApp: recursos, total até a entrega, fluxo e condições", () => {
    const f = montar();
    const texto = nbsp(
      textoWhatsAppVibra({ form: f, resultado: simularVibra(entradaVibraDoForm(f)) }),
    );
    expect(texto).toContain("*Simulação de fluxo: Vibra · Parque Vila Sônia*");
    expect(texto).toContain("Unidade: Apto 12 · Bloco A");
    expect(texto).toContain("Financiamento: R$ 210.000,00 (R$ 207.900,00 líquidos, 1% retido");
    expect(texto).toContain("*Total até a entrega: R$ 52.100,00*");
    expect(texto).toContain("Previsão de entrega: nov/2028.");
    expect(texto).toContain("parcela de até R$ 1.500,00 (30% da renda)");
    expect(texto).toContain("Taxa da Caixa: até R$ 900,00. Documentação grátis.");
    expect(texto).toContain("assinatura em out/2026: a cada mês que passa sai uma mensal");
    expect(texto).not.toContain("—");
  });
});

describe("PDF da Vibra", () => {
  const f = montar();
  const e = entradaVibraDoForm(f);
  const html = montarHtmlVibra({
    form: f,
    resultado: simularVibra(e),
    cenarios: cenariosEsperaVibra(e),
    geradoEm: new Date(2026, 9, 11, 14, 30),
  });

  it("nome do arquivo sem travessão", () => {
    expect(tituloPdfVibra(f)).toBe("Fluxo de pagamento Vibra Parque Vila Sônia out 2026");
  });

  it("a folha do simulador oficial: dados, fluxo com teto, pró-soluto e status", () => {
    expect(html).toContain("size: A4 portrait");
    expect(html).toContain("Parcelas (com o valor máximo permitido)");
    expect(nbsp(html)).toContain("máx. R$ 1.400,00 cada (28% da renda)");
    expect(nbsp(html)).toContain("R$ 52.100,00");
    expect(html).toContain("FECHOU! O cliente tem perfil para este projeto.");
    expect(html).toContain("Pró-soluto comprometido na proposta (máximo 15%)");
    expect(html).toContain("Imobiliária / Corretor");
    expect(html).not.toContain("—");
    expect(html).not.toMatch(/<script/i);
  });

  it("quanto custa esperar e o cronograma com as 17 mensais", () => {
    expect(html).toContain("Quanto custa esperar");
    expect(html).toContain("out/2026 (agora)");
    expect(html).toContain("Cronograma mês a mês");
    expect(html).toContain("Mensal 17/17");
    expect(html).toContain("Pós-chave 24/24");
  });
});
