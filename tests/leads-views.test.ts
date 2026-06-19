import { describe, it, expect } from "vitest";
import { passaContato, FILTRO_PADRAO, VISOES_PADRAO } from "../src/lib/leads-views";

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
      passaContato("contato_7d", { ultimaInteracao: dAtras(2), status: "em_atendimento", temFollowup: false }),
    ).toBe(true);
    expect(
      passaContato("contato_7d", { ultimaInteracao: dAtras(10), status: "em_atendimento", temFollowup: false }),
    ).toBe(false);
    expect(
      passaContato("contato_7d", { ultimaInteracao: null, status: "em_atendimento", temFollowup: false }),
    ).toBe(false);
  });

  it("sem_contato_5d: parado 5+ dias (ou sem contato) e ativo passa; recente ou finalizado não", () => {
    expect(
      passaContato("sem_contato_5d", { ultimaInteracao: dAtras(6), status: "em_atendimento", temFollowup: false }),
    ).toBe(true);
    expect(
      passaContato("sem_contato_5d", { ultimaInteracao: null, status: "aguardando_atendimento", temFollowup: false }),
    ).toBe(true);
    expect(
      passaContato("sem_contato_5d", { ultimaInteracao: hAtras(2), status: "em_atendimento", temFollowup: false }),
    ).toBe(false);
    expect(
      passaContato("sem_contato_5d", { ultimaInteracao: dAtras(30), status: "contrato_fechado", temFollowup: false }),
    ).toBe(false);
  });

  it("com_followup respeita a flag", () => {
    expect(
      passaContato("com_followup", { ultimaInteracao: null, status: "em_atendimento", temFollowup: true }),
    ).toBe(true);
    expect(
      passaContato("com_followup", { ultimaInteracao: null, status: "em_atendimento", temFollowup: false }),
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
