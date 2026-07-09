import { describe, expect, it } from "vitest";
import { quemPrecisaDeAjuda, resumoOperacao, type MetricaCorretor } from "@/features/gestao/derive";

const corretor = (p: Partial<MetricaCorretor> & { corretor_id: string; nome: string }) => ({
  leads: 0,
  agendamentos: 0,
  visitas: 0,
  analise: 0,
  fechados: 0,
  perdidos: 0,
  conversao: 0,
  ...p,
});

describe("resumoOperacao", () => {
  it("agrega totais e conversão média da operação", () => {
    const r = resumoOperacao(
      [
        corretor({ corretor_id: "a", nome: "Ana", leads: 60, fechados: 6 }),
        corretor({ corretor_id: "b", nome: "Bia", leads: 40, fechados: 2 }),
        corretor({ corretor_id: "c", nome: "Caio", leads: 0 }),
      ],
      [
        { lead_id: "l1", corretor_id: "a", corretor_nome: "Ana", minutos_parado: 45 },
        { lead_id: "l2", corretor_id: null, corretor_nome: "—", minutos_parado: 90 },
      ],
    );
    expect(r.leads).toBe(100);
    expect(r.vendas).toBe(8);
    expect(r.conversaoMedia).toBe(8);
    expect(r.paradosAgora).toBe(2);
    expect(r.corretoresAtivos).toBe(2);
  });
});

describe("quemPrecisaDeAjuda", () => {
  const time = [
    corretor({ corretor_id: "a", nome: "Ana", leads: 50, fechados: 5, conversao: 10 }),
    corretor({ corretor_id: "b", nome: "Bia", leads: 50, fechados: 1, conversao: 2 }),
    corretor({ corretor_id: "c", nome: "Caio", leads: 3, fechados: 0, conversao: 0 }),
  ];

  it("prioriza quem tem leads parados e conversão muito abaixo do time", () => {
    const lista = quemPrecisaDeAjuda({
      porCorretor: time,
      urgentes: [
        { lead_id: "l1", corretor_id: "b", corretor_nome: "Bia", minutos_parado: 45 },
        { lead_id: "l2", corretor_id: "b", corretor_nome: "Bia", minutos_parado: 90 },
      ],
      tempoResposta: [{ corretor_id: "b", tempo_medio_min: 120, leads_respondidos: 10 }],
    });
    expect(lista[0].nome).toBe("Bia");
    expect(lista[0].motivos.join(" ")).toMatch(/parados/);
    expect(lista[0].motivos.join(" ")).toMatch(/conversão/);
    expect(lista[0].motivos.join(" ")).toMatch(/1ª resposta/);
    // Ana está saudável — não aparece.
    expect(lista.find((c) => c.nome === "Ana")).toBeFalsy();
  });

  it("não acusa conversão baixa com amostra pequena (<5 leads)", () => {
    const lista = quemPrecisaDeAjuda({
      porCorretor: time,
      urgentes: [],
      tempoResposta: [],
    });
    expect(lista.find((c) => c.nome === "Caio")).toBeFalsy();
  });
});
