// PDF da planilha de amortização (único formato de exportação, 2026-10-11).
// Visual desenhado no Claude Design na identidade da SMQ.
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
const html = (over: Partial<Parameters<typeof montarHtmlPlanilha>[0]> = {}) =>
  montarHtmlPlanilha({ form, resultados, completo: false, geradoEm: quando, origem: "", ...over });

describe("PDF da planilha de amortização", () => {
  it("nome do arquivo descreve o contrato, sem travessão", () => {
    expect(tituloPdf(form)).toBe("Simulação de financiamento R$ 208 mil em 420 meses");
  });

  it("identidade da marca: cores, fontes self-hosted, logo e rodapé com página", () => {
    const h = html();
    expect(h).toContain("#0F1E3A");
    expect(h).toContain("#B89968");
    expect(h).toContain("#F5F1EA");
    expect(h).toContain("/fonts/aurum/montserrat-latin-wght-normal.woff2");
    expect(h).toContain("/fonts/aurum/inter-latin-wght-normal.woff2");
    expect(h).toContain('aria-label="Seu Metro Quadrado"');
    expect(h).toContain('counter(page) " de " counter(pages)');
    expect(h).toContain("@seumetroquadrado_oficial");
    expect(h).not.toContain("—");
  });

  it("resumido: capa, leitura, premissas e evolução anual de cada sistema (sem mês a mês)", () => {
    const h = html();
    expect(h).toMatch(/Planilha de amortização <span>SAC x PRICE<\/span>/);
    expect(h).toMatch(/R\$ 1\.968,62/); // 1ª parcela SAC
    expect(h).toMatch(/R\$ 1\.559,87/); // 1ª parcela PRICE
    expect(h).toContain("Leitura da sua simulação");
    expect(h).toContain("Premissas da conta");
    expect(h).toContain("avaliação estimada");
    expect(h).toContain("SAC · ANO A ANO");
    expect(h).toContain("PRICE · ANO A ANO");
    expect(h).not.toContain("Planilha mês a mês");
    expect(h).not.toContain("Cada amortização tira parcelas"); // sem extra
  });

  it("completo: mês a mês de cada sistema em página paisagem", () => {
    const h = html({ completo: true });
    expect(h).toContain("@page paisagem");
    expect(h).toContain("SAC · Planilha mês a mês");
    expect(h).toContain("PRICE · Planilha mês a mês");
    const linhasMensais = (h.match(/<tr><td>[a-z]{3}\/20\d\d<\/td>/g) ?? []).length;
    expect(linhasMensais).toBeGreaterThanOrEqual(2 * 420 - 10); // FGTS/obra têm classe própria
  });

  it("cliente e consultor na capa e no próximo passo", () => {
    const h = html({
      cliente: "Mariana <e> Rafael",
      consultor: { nome: "Ana Caroline Pereira", telefone: "(11) 90000-0000", creci: "123456-F" },
    });
    expect(h).toContain("Preparada para <strong>Mariana &lt;e&gt; Rafael</strong>");
    expect(h).toContain("por <strong>Ana Caroline Pereira</strong>");
    expect(h).toContain("(11) 90000-0000");
    expect(h).toContain("CRECI 123456-F");
  });

  it("sem consultor: o próximo passo sai sem o bloco de contato", () => {
    const h = html();
    expect(h).toContain("PRÓXIMO PASSO");
    expect(h).not.toContain("Seu consultor");
  });

  it("um sistema só: sem leitura comparativa", () => {
    const h = montarHtmlPlanilha({
      form: { ...form, visao: "SAC" },
      resultados: { SAC: resultados.SAC },
      completo: false,
      geradoEm: quando,
      origem: "",
    });
    expect(h).toMatch(/Planilha de amortização <span>SAC<\/span>/);
    expect(h).not.toContain("Leitura da sua simulação");
    expect(h).toContain("Premissas da simulação");
  });

  it("com amortização extra: página de efeito e capa enxuta", () => {
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
    const h = montarHtmlPlanilha({
      form: comExtra,
      resultados: res,
      analises,
      completo: false,
      geradoEm: quando,
      origem: "",
    });
    expect(h).toContain("Cada amortização tira parcelas do seu contrato");
    expect(h).toContain("No modo reduzir prazo a parcela continua parecida");
    expect(h).toContain("SAC · amortização por amortização");
    expect(h).toContain("PRICE · amortização por amortização");
    expect(h).toContain(`<b>${analises.PRICE.total.parcelasTiradas}</b>`);
    expect(h).toContain("Juros economizados");
    // o detalhe fica na página 2, não na capa
    expect(h).not.toContain("<td>Parcelas tiradas pela amortização</td>");
    expect(h).toContain("<td>Seguros (MIP + DFI) e taxa adm</td>");
  });

  it("escapa texto (nada vira HTML)", () => {
    expect(html({ cliente: "<script>x</script>" })).not.toMatch(/<script/i);
  });
});
