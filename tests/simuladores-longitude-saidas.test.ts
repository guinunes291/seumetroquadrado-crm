// Saídas da aba Longitude: o texto do WhatsApp e o PDF (a folha com as
// premissas práticas).
import { describe, expect, it } from "vitest";
import {
  cenariosEsperaLongitude,
  premissasDe,
  empreendimentoLongitude,
  simularLongitude,
  sugestaoPelasPremissas,
} from "@/lib/simuladores/longitude";
import {
  entradaLongitudeDoForm,
  formInicialLongitude,
  linhasDoFluxoLongitude,
  primeiraParcelaEfetiva,
  textoWhatsAppLongitude,
  type FormLongitude,
} from "@/features/simuladores/longitude-estado";
import { montarHtmlLongitude, tituloPdfLongitude } from "@/features/simuladores/longitude-pdf";

const nbsp = (s: string) => s.replace(/\u00a0/g, " ");

function montar(): FormLongitude {
  const f: FormLongitude = {
    ...formInicialLongitude(
      { valor: 220_000, renda: 4_000, financiamento: 160_000, subsidio: 10_000 },
      "2026-10",
    ),
    empreendimento: "Cittá",
    premissas: premissasDe(empreendimentoLongitude("Cittá")),
    entrega: "2028-06",
    valorAvaliacao: 230_000,
  };
  return { ...f, parcelas: sugestaoPelasPremissas(entradaLongitudeDoForm(f)) };
}

describe("estado da aba Longitude", () => {
  it("1ª parcela do banco: 30% da renda quando não informada, e nunca acima disso", () => {
    expect(primeiraParcelaEfetiva({ renda: 4_000, primeiraParcela: 0 })).toBe(1_200);
    expect(primeiraParcelaEfetiva({ renda: 4_000, primeiraParcela: 900 })).toBe(900);
    expect(primeiraParcelaEfetiva({ renda: 4_000, primeiraParcela: 2_000 })).toBe(1_200);
  });

  it("linhas do fluxo em ordem de leitura", () => {
    const r = simularLongitude(entradaLongitudeDoForm(montar()));
    expect(linhasDoFluxoLongitude(r).map(nbsp)).toEqual([
      "Ato (out/2026): R$ 10.230,00",
      "20 parcelas pré-chaves de R$ 1.039,60 (nov/2026 a jun/2028)",
      "2 anuais de R$ 4.000,00 (dez/2026 e dez/2027)",
      "40 parcelas pós-chaves de R$ 274,45 (jul/2028 a out/2031)",
    ]);
  });

  it("WhatsApp: recursos, saldo, fluxo e a regra do mês", () => {
    const f = montar();
    const texto = nbsp(
      textoWhatsAppLongitude({ form: f, resultado: simularLongitude(entradaLongitudeDoForm(f)) }),
    );
    expect(texto).toContain("*Simulação de fluxo: Longitude · Cittá*");
    expect(texto).toContain("Financiamento: R$ 160.000,00 · Subsídio: R$ 10.000,00");
    expect(texto).toContain("*Com a construtora: R$ 50.000,00*");
    expect(texto).toContain("Previsão de entrega: jun/2028.");
    expect(texto).toContain("sai uma parcela pré-chaves e entra uma pós-chaves");
    expect(texto).not.toContain("—");
  });
});

describe("PDF da Longitude", () => {
  const f = montar();
  const e = entradaLongitudeDoForm(f);
  const html = montarHtmlLongitude({
    form: f,
    resultado: simularLongitude(e),
    cenarios: cenariosEsperaLongitude(e),
    geradoEm: new Date(2026, 9, 11, 14, 30),
  });

  it("nome do arquivo sem travessão", () => {
    expect(tituloPdfLongitude(f)).toBe("Fluxo de pagamento Longitude Cittá out 2026");
  });

  it("folha com tetos, premissas práticas, adimplência e status", () => {
    expect(html).toContain("size: A4 portrait");
    expect(nbsp(html)).toContain("máx. R$ 1.039,60 cada (25,99% da renda)");
    expect(html).toContain("Premissas práticas");
    expect(html).toContain("Referência (ato + banco)");
    expect(html).toContain("Adimplência (avaliação − tabela)");
    expect(html).toContain("APTO PARA VENDA! O fluxo atende as premissas da Longitude.");
    expect(html).toContain("Pós-chaves 40/40");
    expect(html).not.toContain("—");
    expect(html).not.toMatch(/<script/i);
  });
});
