import { describe, it, expect } from "vitest";
import {
  passaContato,
  passaParado,
  mesclarFiltrosDaUrl,
  FILTRO_PADRAO,
  VISOES_PADRAO,
} from "../src/lib/leads-views";

const hAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const dAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

describe("passaContato — filtros rápidos da lista", () => {
  it("'all' não filtra nada", () => {
    expect(passaContato("all", { ultimaInteracao: null, status: "novo", temFollowup: false })).toBe(
      true,
    );
  });

  it("contato_7d: dentro de 7 dias passa; fora não; sem interação não", () => {
    expect(
      passaContato("contato_7d", {
        ultimaInteracao: dAtras(2),
        status: "em_atendimento",
        temFollowup: false,
      }),
    ).toBe(true);
    expect(
      passaContato("contato_7d", {
        ultimaInteracao: dAtras(10),
        status: "em_atendimento",
        temFollowup: false,
      }),
    ).toBe(false);
    expect(
      passaContato("contato_7d", {
        ultimaInteracao: null,
        status: "em_atendimento",
        temFollowup: false,
      }),
    ).toBe(false);
  });

  it("sem_contato_5d: parado 5+ dias (ou sem contato) e ativo passa; recente ou finalizado não", () => {
    expect(
      passaContato("sem_contato_5d", {
        ultimaInteracao: dAtras(6),
        status: "em_atendimento",
        temFollowup: false,
      }),
    ).toBe(true);
    expect(
      passaContato("sem_contato_5d", {
        ultimaInteracao: null,
        status: "aguardando_atendimento",
        temFollowup: false,
      }),
    ).toBe(true);
    expect(
      passaContato("sem_contato_5d", {
        ultimaInteracao: hAtras(2),
        status: "em_atendimento",
        temFollowup: false,
      }),
    ).toBe(false);
    expect(
      passaContato("sem_contato_5d", {
        ultimaInteracao: dAtras(30),
        status: "contrato_fechado",
        temFollowup: false,
      }),
    ).toBe(false);
  });

  it("sem_contato_30d: só leads ativos parados há 30+ dias (higiene/descarte)", () => {
    expect(
      passaContato("sem_contato_30d", {
        ultimaInteracao: dAtras(45),
        status: "em_atendimento",
        temFollowup: false,
      }),
    ).toBe(true);
    expect(
      passaContato("sem_contato_30d", {
        ultimaInteracao: null,
        status: "em_atendimento",
        temFollowup: false,
      }),
    ).toBe(true);
    expect(
      passaContato("sem_contato_30d", {
        ultimaInteracao: dAtras(10),
        status: "em_atendimento",
        temFollowup: false,
      }),
    ).toBe(false);
    expect(
      passaContato("sem_contato_30d", {
        ultimaInteracao: dAtras(90),
        status: "perdido",
        temFollowup: false,
      }),
    ).toBe(false);
  });

  it("com_followup respeita a flag", () => {
    expect(
      passaContato("com_followup", {
        ultimaInteracao: null,
        status: "em_atendimento",
        temFollowup: true,
      }),
    ).toBe(true);
    expect(
      passaContato("com_followup", {
        ultimaInteracao: null,
        status: "em_atendimento",
        temFollowup: false,
      }),
    ).toBe(false);
  });
});

describe("visões prontas", () => {
  it("todas partem do filtro padrão e mudam só o necessário", () => {
    for (const v of VISOES_PADRAO) {
      expect(Object.keys(v.filtros).sort()).toEqual(Object.keys(FILTRO_PADRAO).sort());
    }
    const quentes = VISOES_PADRAO.find((v) => v.id === "preset-quentes");
    expect(quentes?.filtros.temperatura).toBe("quente");
  });
});

describe("passaParado (item 2.11 — fallback client-side da v4)", () => {
  const DIA = 86_400_000;
  const iso = (diasAtras: number) => new Date(Date.now() - diasAtras * DIA).toISOString();

  it('"all" não filtra', () => {
    expect(passaParado("all", { ultimaInteracao: null, status: "em_atendimento" })).toBe(true);
  });

  it("parado 15+ dias: passa sem interação ou com interação antiga; barra recente", () => {
    expect(passaParado("15", { ultimaInteracao: null, status: "em_atendimento" })).toBe(true);
    expect(passaParado("15", { ultimaInteracao: iso(20), status: "em_atendimento" })).toBe(true);
    expect(passaParado("15", { ultimaInteracao: iso(3), status: "em_atendimento" })).toBe(false);
  });

  it("status terminais nunca contam como parados", () => {
    for (const status of ["contrato_fechado", "pos_venda", "perdido"]) {
      expect(passaParado("15", { ultimaInteracao: null, status })).toBe(false);
    }
  });

  it("valor inválido não passa ninguém (espelho da validação estrita da v4)", () => {
    expect(passaParado("abc", { ultimaInteracao: null, status: "em_atendimento" })).toBe(false);
    expect(passaParado("0", { ultimaInteracao: null, status: "em_atendimento" })).toBe(false);
  });
});

describe("passaContato estrito (fim do default true no cliente)", () => {
  it("recorte desconhecido NÃO devolve tudo", () => {
    expect(
      passaContato("recorte_que_nao_existe", {
        ultimaInteracao: null,
        status: "em_atendimento",
        temFollowup: false,
      }),
    ).toBe(false);
  });
});

describe("mesclarFiltrosDaUrl saneia paradoDias", () => {
  it("valor fora de PARADO_OPCOES vira all; valor válido passa", () => {
    expect(mesclarFiltrosDaUrl({ paradoDias: "999" }, true).paradoDias).toBe("all");
    expect(mesclarFiltrosDaUrl({ paradoDias: "30" }, true).paradoDias).toBe("30");
  });
});
