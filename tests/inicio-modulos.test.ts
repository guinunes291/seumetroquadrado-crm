import { describe, expect, it } from "vitest";

import { MODULOS, badgeDoModulo, modulosVisiveis, type PapelCtx } from "@/features/inicio/modulos";

const corretor: PapelCtx = { roles: ["corretor"], isAdmin: false };
const gestor: PapelCtx = { roles: ["gestor"], isAdmin: false };
const superintendente: PapelCtx = { roles: ["superintendente"], isAdmin: false };
const admin: PapelCtx = { roles: ["admin"], isAdmin: true };

const ids = (ctx: PapelCtx) => modulosVisiveis(MODULOS, ctx).map((m) => m.id);

describe("modulosVisiveis", () => {
  it("esconde todo o grupo de gestão para o corretor", () => {
    const visiveis = modulosVisiveis(MODULOS, corretor);
    expect(visiveis.every((m) => m.grupo === "operacao")).toBe(true);
    expect(visiveis.length).toBe(MODULOS.filter((m) => m.grupo === "operacao").length);
  });

  it("admin enxerga todos os módulos", () => {
    expect(ids(admin)).toEqual(MODULOS.map((m) => m.id));
  });

  it("gestor vê o hub de gestão, menos Configurações (só admin)", () => {
    const doGestor = ids(gestor);
    expect(doGestor).toContain("operacao");
    expect(doGestor).toContain("dinheiro");
    expect(doGestor).toContain("distribuicao");
    expect(doGestor).toContain("captacao");
    expect(doGestor).not.toContain("configuracoes");
  });

  it("superintendente vê Operação/Dinheiro mas não Distribuição/Captação/Configurações", () => {
    const doSuper = ids(superintendente);
    expect(doSuper).toContain("operacao");
    expect(doSuper).toContain("dinheiro");
    expect(doSuper).not.toContain("distribuicao");
    expect(doSuper).not.toContain("captacao");
    expect(doSuper).not.toContain("configuracoes");
  });
});

describe("badgeDoModulo", () => {
  const badges = { atendimento: 4, tarefasVencidas: 2, agendaHoje: 3, aprovacoes: 5 };
  const modulo = (id: string) => {
    const m = MODULOS.find((x) => x.id === id);
    if (!m) throw new Error(`módulo ${id} não existe no registro`);
    return m;
  };

  it("devolve 0 quando o nav_pendencias ainda não respondeu (badges null)", () => {
    expect(badgeDoModulo(modulo("atendimento"), null, corretor)).toBe(0);
  });

  it("Atendimento carrega a fila de entrada", () => {
    expect(badgeDoModulo(modulo("atendimento"), badges, corretor)).toBe(4);
  });

  it("Agenda & Tarefas soma agenda de hoje + tarefas vencidas", () => {
    expect(badgeDoModulo(modulo("agenda"), badges, corretor)).toBe(5);
  });

  it("badge de aprovações respeita badgeRoles: some para o corretor, aparece para a gestão", () => {
    expect(badgeDoModulo(modulo("dinheiro"), badges, corretor)).toBe(0);
    expect(badgeDoModulo(modulo("dinheiro"), badges, gestor)).toBe(5);
    expect(badgeDoModulo(modulo("dinheiro"), badges, admin)).toBe(5);
  });

  it("módulo sem badge definido devolve 0", () => {
    expect(badgeDoModulo(modulo("pipeline"), badges, corretor)).toBe(0);
  });
});
