/**
 * BRIEFING DA VISITA — leitura de dinheiro e potencial de crédito.
 *
 * Estes números aparecem na tela do corretor NA FRENTE DO CLIENTE. Renda
 * gravada como "2.500,00" lida como 2,5 mudaria a faixa e faria o corretor
 * prometer errado — por isso o parsing é testado com as formas que o
 * formulário realmente produz.
 */
import { describe, expect, it } from "vitest";

import { z } from "zod";

import { orcamentoDoLead, paraNumero, type LeadBriefing } from "@/features/visitas/briefing-visita";
import { agendaSchema } from "@/features/visitas/modo-visita-page";

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
  objecoes: null,
  entrada_disponivel: null,
  fgts_valor: null,
  usa_fgts: null,
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

describe("schema da agenda do Modo Visita", () => {
  // Regressão real: `leads.objecoes` é text[] no banco e foi declarado como
  // string no zod. TODAS as linhas falhavam a validação e a página inteira
  // virava "Não foi possível carregar suas visitas" — com o corretor no
  // estande. Os campos de exibição agora degradam em vez de derrubar a tela.
  const linha = (leadPatch: Record<string, unknown> = {}) => ({
    id: "a4b7b6e2-2e02-4509-8822-4ba015954b6e",
    data_inicio: "2026-07-31T14:00:00Z",
    data_fim: "2026-07-31T15:00:00Z",
    local: "Estande",
    titulo: "Visita",
    status: "confirmado",
    lead_id: "3691efdf-80a7-46a1-983f-272ceb9faf10",
    lead: {
      id: "3691efdf-80a7-46a1-983f-272ceb9faf10",
      nome: "Cliente",
      telefone: "11999990000",
      status: "agendado",
      projeto_nome: null,
      renda_informada: "2500",
      proxima_acao: null,
      proximo_followup: null,
      temperatura: "quente",
      tipo_renda: "clt",
      faixa_mcmv: "2",
      entrada_disponivel: "10000",
      fgts_valor: 20000,
      usa_fgts: true,
      objecoes: ["Achou caro"],
      observacoes: null,
      ultima_interacao: "2026-07-30T10:00:00Z",
      created_at: "2026-07-01T10:00:00Z",
      ...leadPatch,
    },
  });

  it("aceita objecoes como lista (o tipo real da coluna)", () => {
    const r = agendaSchema.parse(linha());
    expect(r.lead?.objecoes).toEqual(["Achou caro"]);
  });

  it("campo de exibição com tipo inesperado degrada em vez de derrubar a tela", () => {
    // Se amanhã alguém mudar a coluna, o briefing perde UMA linha —
    // a agenda continua carregando.
    const r = agendaSchema.parse(linha({ objecoes: "virou texto", faixa_mcmv: 3 }));
    expect(r.lead?.objecoes).toBeNull();
    expect(r.lead?.faixa_mcmv).toBeNull();
    expect(r.lead?.nome).toBe("Cliente");
  });

  it("lista inteira de visitas continua válida com um lead problemático", () => {
    const lista = z.array(agendaSchema).parse([linha(), linha({ objecoes: 42 })]);
    expect(lista).toHaveLength(2);
  });
});
