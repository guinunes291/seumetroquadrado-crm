import { describe, expect, it } from "vitest";
import {
  calculoReverso,
  normalizarPacing,
  projecaoLinear,
  ritmoVsMesAnterior,
  semaforo,
} from "@/features/metas/pacing";

describe("projecaoLinear", () => {
  it("projeta pelo ritmo de dias úteis", () => {
    // 10 vendas em 10 de 25 dias úteis → 25 projetadas.
    expect(projecaoLinear(10, 10, 25)).toBe(25);
  });

  it("sem dias úteis passados devolve null (nunca 0 falso)", () => {
    expect(projecaoLinear(5, 0, 25)).toBeNull();
  });
});

describe("calculoReverso", () => {
  it("converte vendas faltantes em visitas/análises/leads pelas taxas", () => {
    const r = calculoReverso(6, {
      venda_por_visita: 0.15, // 1 venda a cada ~6,7 visitas
      venda_por_analise: 0.33,
      venda_por_lead: 0.027,
    });
    expect(r.visitas).toBe(40);
    expect(r.analises).toBe(19);
    expect(r.leads).toBe(223);
  });

  it("meta batida zera as necessidades", () => {
    const r = calculoReverso(0, {
      venda_por_visita: 0.2,
      venda_por_analise: null,
      venda_por_lead: 0.05,
    });
    expect(r.visitas).toBe(0);
    expect(r.analises).toBe(0);
    expect(r.leads).toBe(0);
  });

  it("taxa incalculável devolve null (UI mostra 'sem dado suficiente')", () => {
    const r = calculoReverso(3, {
      venda_por_visita: null,
      venda_por_analise: null,
      venda_por_lead: null,
    });
    expect(r.visitas).toBeNull();
    expect(r.leads).toBeNull();
  });
});

describe("semaforo", () => {
  it("verde >= meta, âmbar >= 80%, vermelho abaixo, neutro sem base", () => {
    expect(semaforo(10, 10)).toBe("verde");
    expect(semaforo(8.5, 10)).toBe("ambar");
    expect(semaforo(5, 10)).toBe("vermelho");
    expect(semaforo(null, 10)).toBe("neutro");
    expect(semaforo(5, 0)).toBe("neutro");
  });
});

describe("ritmoVsMesAnterior", () => {
  it("compara ritmo com ritmo (mesmo dia útil)", () => {
    expect(ritmoVsMesAnterior(11, 12)).toBe(-8);
    expect(ritmoVsMesAnterior(12, 10)).toBe(20);
    expect(ritmoVsMesAnterior(3, 0)).toBeNull();
  });
});

describe("normalizarPacing", () => {
  it("normaliza o jsonb da RPC", () => {
    const p = normalizarPacing({
      ano: 2026,
      mes: 7,
      dias_uteis: { total: 27, passados: 22, restantes: 5 },
      mes_atual: {
        meta_vendas: 10,
        meta_gmv: 3000000,
        meta_visitas: 60,
        vendas: 7,
        vgv: "1400000",
        visitas: 41,
      },
      trimestre: { inicio: "2026-07-01", meta_vendas: 10, meta_gmv: 3000000, vendas: 7, vgv: 1400000 },
      taxas_90d: { venda_por_visita: 0.15, venda_por_analise: null, venda_por_lead: 0 },
      mes_anterior_mesmo_dia_util: { vendas: 8, vgv: 1600000, ate_dia: "2026-06-25" },
      por_corretor: [
        {
          corretor_id: "c1",
          nome: "Ana",
          meta_vendas: 4,
          meta_gmv: 800000,
          meta_visitas: 20,
          vendas: 3,
          vgv: 600000,
          visitas: 18,
        },
      ],
      atualizado_em: "2026-07-26T12:00:00Z",
    });
    expect(p).not.toBeNull();
    expect(p!.mes_atual.vgv).toBe(1400000);
    // Taxa 0 vira null — divisão por zero nunca chega à UI.
    expect(p!.taxas_90d.venda_por_lead).toBeNull();
    expect(p!.por_corretor[0].nome).toBe("Ana");
  });

  it("shape inesperado devolve null", () => {
    expect(normalizarPacing(null)).toBeNull();
    expect(normalizarPacing({ qualquer: 1 })).toBeNull();
  });
});
