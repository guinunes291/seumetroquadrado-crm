// Conversões e textos da tela de Simuladores (features/simuladores/estado).
import { describe, expect, it } from "vitest";
import { simularFluxo } from "@/lib/simuladores/fluxo";
import { REGRAS_PADRAO } from "@/lib/simuladores/construtoras";
import {
  cenariosDeEspera,
  entradaDoForm,
  formInicial,
  formParaOutraConstrutora,
  linhasDoFluxo,
  textoWhatsApp,
  type FormFluxo,
} from "@/features/simuladores/estado";
import { prefillFluxoDaAprovacao } from "@/features/simuladores/prefill-lead";

const regras = { ...REGRAS_PADRAO, inccAnualPct: 0 };

// O mesmo cliente de tests/simuladores-fluxo.test.ts: 50 mil com a construtora,
// ato de 3 mil, chaves de 9 mil, 19 mensais de 2 mil (out/2026 → jun/2028).
const form = (patch: Partial<FormFluxo> = {}): FormFluxo => ({
  ...formInicial({ valor: 260_000, renda: 9_000 }, "2026-10"),
  projetoId: "p1",
  unidadeId: "u1",
  rotuloUnidade: "Apto 104 · Bloco B",
  entrega: "2028-06",
  financiamento: 190_000,
  subsidio: 8_000,
  fgts: 12_000,
  ato: 3_000,
  chaves: 9_000,
  ...patch,
});

describe("estado dos Simuladores", () => {
  it("formulário vira a entrada do motor; regra sem intermediária/pós-chaves zera o campo", () => {
    const e = entradaDoForm(form({ intermediariaValor: 5_000, posChavesParcelas: 12 }), regras);
    expect(e.hoje).toBe("2026-10");
    expect(e.ultimaMensal).toBeNull();
    expect(e.intermediariaValor).toBe(0); // regra padrão: sem intermediárias
    expect(e.posChavesParcelas).toBe(0); // regra padrão: sem pós-chaves
    const com = entradaDoForm(form({ intermediariaValor: 5_000, posChavesParcelas: 12 }), {
      ...regras,
      intermediarias: "dezembro",
      posChavesPermitido: true,
    });
    expect(com.intermediariaValor).toBe(5_000);
    expect(com.posChavesParcelas).toBe(12);
  });

  it("trocar de construtora limpa o produto e mantém o cliente e a negociação", () => {
    const f = formParaOutraConstrutora(form({ ultimaMensal: "2028-01" }));
    expect(f).toMatchObject({
      projetoId: null,
      unidadeId: null,
      rotuloUnidade: "",
      entrega: "",
      ultimaMensal: "",
      renda: 9_000,
      financiamento: 190_000,
      ato: 3_000,
      valorImovel: 260_000,
    });
  });

  it("quanto custa esperar: uma mensal a menos por mês, diferença contra hoje", () => {
    const c = cenariosDeEspera(entradaDoForm(form(), regras));
    expect(c.map((x) => [x.hoje, x.mensais])).toEqual([
      ["2026-10", 19],
      ["2026-11", 18],
      ["2026-12", 17],
      ["2027-01", 16],
    ]);
    expect(c[0].diferenca).toBe(0);
    expect(c[1].diferenca).toBe(111.11); // 2.111,11 − 2.000
    expect(c[3].mensal).toBe(2_375); // 38.000 / 16

    // Mensal fixa: a mensal não muda, as chaves crescem 1.500 por mês.
    const fixa = cenariosDeEspera(
      entradaDoForm(form({ modo: "mensal_fixa", mensalFixa: 1_500 }), regras),
    );
    expect(fixa.map((x) => x.diferenca)).toEqual([0, 1_500, 3_000, 4_500]);
  });

  it("texto do WhatsApp traz o fluxo e a validade da condição", () => {
    const r = simularFluxo(entradaDoForm(form(), regras));
    const txt = textoWhatsApp({
      construtora: "Mundo Apto",
      projeto: "Mundo Apto Ipiranga",
      form: form(),
      resultado: r,
      regras,
    }).replace(/\u00a0/g, " "); // o Intl separa "R$" do número com espaço fixo
    expect(txt).toContain("*Simulação de fluxo: Mundo Apto · Mundo Apto Ipiranga*");
    expect(txt).toContain("Unidade: Apto 104 · Bloco B");
    expect(txt).toContain("*Com a construtora: R$ 50.000,00*");
    expect(txt).toContain("• Ato (out/2026): R$ 3.000,00");
    expect(txt).toContain("• 19 mensais de R$ 2.000,00 (nov/2026 a mai/2028)");
    expect(txt).toContain("• Chaves (jun/2028): R$ 9.000,00");
    expect(txt).toContain("Condição para assinatura em out/2026");
    expect(linhasDoFluxo(r)).toHaveLength(3);
  });

  it("o link do dossiê traz o que veio do banco", () => {
    const f = formInicial(
      { renda: 7_000, financiamento: 180_000, subsidio: 5_000, fgts: 9_000, parcela: 1_450 },
      "2026-10",
    );
    expect(f).toMatchObject({
      renda: 7_000,
      financiamento: 180_000,
      subsidio: 5_000,
      fgts: 9_000,
      parcelaBanco: 1_450,
    });
  });
});

describe("prefill pela aprovação de crédito", () => {
  it("com aprovação, leva os valores do banco; a renda da carta vence a do lead", () => {
    expect(
      prefillFluxoDaAprovacao(
        {
          valor_financiamento: 190_000,
          valor_subsidio: 8_000,
          valor_fgts: null,
          valor_parcela: 1_520.4,
          renda_familiar: 6_800,
        },
        "R$ 6.000",
      ),
    ).toEqual({
      financiamento: 190_000,
      subsidio: 8_000,
      fgts: undefined,
      parcela: 1_520.4,
      renda: 6_800,
    });
  });

  it("sem aprovação, só a renda informada segue", () => {
    expect(prefillFluxoDaAprovacao(null, "6.500")).toEqual({ renda: 6_500 });
    expect(prefillFluxoDaAprovacao(undefined, null)).toEqual({ renda: undefined });
  });
});
