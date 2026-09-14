/**
 * Leitura da carteira por corretor (src/features/gestao/carteira-stats).
 *
 * O que está em jogo: a tela de gestão mostrava `aguardando` como se fosse
 * carteira. Medido em 14/09/2026, são 6.186 leads com dono — e ele mistura
 * duas conversas diferentes: lead que ainda não teve primeiro contato (topo
 * de funil, mora em /prospeccao) e lead abandonado (o que a régua leva).
 *
 * `pctParada` é o número que decide qual conversa o gestor vai ter com o
 * corretor, e o denominador EXCLUI prospecção de propósito: lead que nunca
 * foi tocado não está parado, está na fila.
 */
import { describe, expect, it } from "vitest";
import {
  SEM_DONO,
  fraseDaCarteira,
  indexarPorCorretor,
  pctParada,
  parseCarteiraStats,
  tomDaCarteira,
  type CarteiraStats,
} from "@/features/gestao/carteira-stats";

function stats(p: Partial<CarteiraStats> = {}): CarteiraStats {
  return {
    corretor_id: "00000000-0000-4000-8000-000000000001",
    total: 0,
    ativa: 0,
    prospeccao: 0,
    parada: 0,
    fundo: 0,
    ganhos: 0,
    perdidos: 0,
    ...p,
  };
}

describe("pctParada", () => {
  it("não conta prospecção no denominador", () => {
    // 10 em tratativa, 10 parados, 980 em prospecção: a carteira está 50%
    // parada, não 1%. Incluir prospecção diluiria o problema até sumir.
    expect(pctParada(stats({ ativa: 10, parada: 10, prospeccao: 980 }))).toBe(50);
  });

  it("carteira sem tratativa nem parados não tem percentual", () => {
    expect(pctParada(stats({ prospeccao: 500 }))).toBeNull();
  });

  it("tudo parado é 100%", () => {
    expect(pctParada(stats({ ativa: 0, parada: 40 }))).toBe(100);
  });
});

describe("tomDaCarteira", () => {
  it("separa saudável, atenção e crítico", () => {
    expect(tomDaCarteira(stats({ ativa: 80, parada: 20 }))).toBe("saudavel");
    expect(tomDaCarteira(stats({ ativa: 70, parada: 30 }))).toBe("atencao");
    expect(tomDaCarteira(stats({ ativa: 30, parada: 70 }))).toBe("critico");
  });

  it("sem base para julgar, não julga", () => {
    expect(tomDaCarteira(stats({ prospeccao: 100 }))).toBeNull();
  });
});

describe("fraseDaCarteira", () => {
  it("abre pelo que está vivo, e omite o que é zero", () => {
    expect(fraseDaCarteira(stats({ ativa: 12, parada: 40, prospeccao: 300 }))).toBe(
      "12 em tratativa · 40 parados · 300 em prospecção",
    );
    expect(fraseDaCarteira(stats({ ativa: 12 }))).toBe("12 em tratativa");
  });
});

describe("indexarPorCorretor", () => {
  it("guarda os sem dono sob a chave própria", () => {
    const m = indexarPorCorretor([
      stats({ corretor_id: null, ativa: 3 }),
      stats({ corretor_id: "00000000-0000-4000-8000-000000000002", ativa: 7 }),
    ]);
    expect(m.get(SEM_DONO)?.ativa).toBe(3);
    expect(m.get("00000000-0000-4000-8000-000000000002")?.ativa).toBe(7);
  });
});

describe("parseCarteiraStats", () => {
  it("aceita bigint como string — é assim que o PostgREST manda", () => {
    const [linha] = parseCarteiraStats([
      {
        corretor_id: null,
        total: "1200",
        ativa: "32",
        prospeccao: "900",
        parada: "260",
        fundo: "6",
        ganhos: "1",
        perdidos: "1",
      },
    ]);
    expect(linha.ativa).toBe(32);
    expect(linha.parada).toBe(260);
  });

  it("derruba linha malformada em vez de renderizar carteira errada", () => {
    expect(() => parseCarteiraStats([{ corretor_id: null }])).toThrow();
  });
});
