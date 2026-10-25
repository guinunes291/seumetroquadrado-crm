import { describe, expect, it } from "vitest";
import { agruparPorCorretor, calcularMetricas, inicioPeriodo, type PropostaPainel } from "@/lib/proposta-painel";

const p = (o: Partial<PropostaPainel>): PropostaPainel => ({
  id: Math.random().toString(),
  modelo: "apresentacao",
  corretor_id: "a",
  projeto_id: null,
  created_at: "2026-10-20T12:00:00Z",
  primeira_abertura_em: null,
  aceita_em: null,
  sessoes: [],
  visita_pedida: false,
  ...o,
});

describe("painel do link de proposta", () => {
  const lista = [
    p({ primeira_abertura_em: "2026-10-20T13:30:00Z", visita_pedida: true, sessoes: [{ tempo_total_s: 120, tempo_por_secao: { plantas: 90, capa: 30 } }] }),
    p({}),
    p({ modelo: "proposta", corretor_id: "b", primeira_abertura_em: "2026-10-20T12:30:00Z", aceita_em: "2026-10-20T14:00:00Z", sessoes: [{ tempo_total_s: 240, tempo_por_secao: { fluxo: 200 } }] }),
  ];
  const m = calcularMetricas(lista);

  it("conta enviadas por modelo e % abertas", () => {
    expect([m.enviadas, m.apresentacoes, m.propostas, m.abertas]).toEqual([3, 2, 1, 2]);
    expect(m.pctAbertas).toBe(66.7);
  });
  it("tempo médio até a 1ª abertura e de leitura", () => {
    expect(m.tempoPrimeiraAberturaS).toBe(3600); // (90 + 30 min) / 2
    expect(m.tempoMedioLeituraS).toBe(180);
  });
  it("seção mais lida soma todas as sessões", () => {
    expect(m.secaoMaisLida).toBe("fluxo");
  });
  it("conversões: apresentação para visita e proposta para aceite", () => {
    expect(m.pctApresentacaoVisita).toBe(50);
    expect(m.pctPropostaAceite).toBe(100);
  });
  it("agrupa por corretor", () => {
    const g = agruparPorCorretor(lista);
    expect(g.find((x) => x.corretor_id === "a")?.enviadas).toBe(2);
  });
  it("mês atual começa à meia-noite de Brasília do dia 1", () => {
    expect(inicioPeriodo("mes", new Date("2026-11-01T02:00:00Z"))).toBe("2026-10-01T03:00:00.000Z");
  });
});
