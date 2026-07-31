/**
 * BRIEFING DA VISITA — leitura de dinheiro e potencial de crédito.
 *
 * Estes números aparecem na tela do corretor NA FRENTE DO CLIENTE. Renda
 * gravada como "2.500,00" lida como 2,5 mudaria a faixa e faria o corretor
 * prometer errado — por isso o parsing é testado com as formas que o
 * formulário realmente produz.
 */
import { describe, expect, it } from "vitest";

import { orcamentoDoLead, paraNumero, type LeadBriefing } from "@/features/visitas/briefing-visita";

const lead = (p: Partial<LeadBriefing>): LeadBriefing => ({
  id: "l1",
  nome: "Cliente",
  status: "agendado",
  projeto_nome: null,
  renda_informada: null,
  proxima_acao: null,
  proximo_followup: null,
  temperatura: null,
  tipo_renda: null,
  faixa_mcmv: null,
  entrada_disponivel: null,
  fgts_valor: null,
  usa_fgts: null,
  objecoes: null,
  observacoes: null,
  ultima_interacao: null,
  created_at: null,
  ...p,
});

describe("paraNumero", () => {
  it("lê as formas que o formulário grava", () => {
    expect(paraNumero("2500")).toBe(2500);
    expect(paraNumero("2.500,00")).toBe(2500);
    expect(paraNumero("R$ 3.200,50")).toBe(3200.5);
    expect(paraNumero("4500,00")).toBe(4500);
    expect(paraNumero(1800)).toBe(1800);
  });

  it("texto sem número não vira zero silencioso", () => {
    expect(paraNumero("a combinar")).toBeNull();
    expect(paraNumero("")).toBeNull();
    expect(paraNumero(null)).toBeNull();
    expect(paraNumero("0")).toBeNull();
  });
});

describe("orcamentoDoLead", () => {
  it("sem renda informada não estima nada — melhor nenhum número que um chute", () => {
    expect(orcamentoDoLead(lead({}))).toBeNull();
    expect(orcamentoDoLead(lead({ renda_informada: "a combinar" }))).toBeNull();
  });

  it("renda abaixo do mínimo da tabela não enquadra", () => {
    expect(orcamentoDoLead(lead({ renda_informada: "1200" }))).toBeNull();
  });

  it("estima pela renda e devolve faixa, parcela e teto de compra", () => {
    const o = orcamentoDoLead(lead({ renda_informada: "2.500,00" }));
    expect(o).not.toBeNull();
    expect(o!.enquadra).toBe(true);
    expect(o!.faixa).toBeGreaterThanOrEqual(1);
    expect(o!.parcelaEstimada).toBeGreaterThan(0);
    expect(o!.tetoImovel).toBeGreaterThan(o!.financiamento);
  });

  it("usa a hipótese conservadora: sem redutor", () => {
    const o = orcamentoDoLead(lead({ renda_informada: "3000" }));
    expect(o!.usouRedutor).toBe(false);
  });

  it("FGTS só entra quando o lead marcou que usa", () => {
    const semUso = orcamentoDoLead(lead({ renda_informada: "3000", fgts_valor: "20000" }));
    const comUso = orcamentoDoLead(
      lead({ renda_informada: "3000", fgts_valor: "20000", usa_fgts: true }),
    );
    expect(semUso!.fgts).toBe(0);
    expect(comUso!.fgts).toBe(20000);
    expect(comUso!.tetoImovel).toBeGreaterThan(semUso!.tetoImovel);
  });

  it("entrada informada aumenta o poder de compra", () => {
    const sem = orcamentoDoLead(lead({ renda_informada: "3000" }));
    const com = orcamentoDoLead(lead({ renda_informada: "3000", entrada_disponivel: "15.000,00" }));
    expect(com!.entrada).toBe(15000);
    expect(com!.tetoImovel).toBeGreaterThanOrEqual(sem!.tetoImovel);
  });
});
