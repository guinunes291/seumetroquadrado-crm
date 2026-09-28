import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import {
  SISTEMAS,
  SISTEMAS_NAV,
  SISTEMA_ACADEMIA,
  sistemaAtivo,
  sistemaVisivel,
  sistemasVisiveis,
  type PapelCtx,
} from "@/features/nav/sistemas";

const corretor: PapelCtx = { roles: ["corretor"], isAdmin: false };
const gestor: PapelCtx = { roles: ["gestor"], isAdmin: false };
const admin: PapelCtx = { roles: ["admin"], isAdmin: true };
const LIGADA = new Set(["academia_menu"]);

describe("Academia no menu: a flag manda", () => {
  it("sem flag no contexto, ninguém vê, nem o admin", () => {
    for (const ctx of [corretor, gestor, admin]) {
      expect(sistemaVisivel(SISTEMA_ACADEMIA, ctx)).toBe(false);
    }
  });

  it("conjunto de flags vazio é igual a flag desligada", () => {
    const desligada = { ...corretor, flagsLigadas: new Set<string>() };
    expect(sistemaVisivel(SISTEMA_ACADEMIA, desligada)).toBe(false);
  });

  it("com a flag ligada, aparece para corretor, gestor e admin", () => {
    for (const ctx of [corretor, gestor, admin]) {
      expect(sistemaVisivel(SISTEMA_ACADEMIA, { ...ctx, flagsLigadas: LIGADA })).toBe(true);
    }
  });

  it("entra na lista de navegação só com a flag, e no fim", () => {
    expect(sistemasVisiveis(corretor, SISTEMAS_NAV).map((s) => s.id)).not.toContain("academia");
    const comFlag = sistemasVisiveis({ ...corretor, flagsLigadas: LIGADA }, SISTEMAS_NAV);
    expect(comFlag.map((s) => s.id)).toContain("academia");
  });

  it("a flag não altera a visibilidade de nenhum outro sistema", () => {
    const sem = sistemasVisiveis(corretor, SISTEMAS_NAV).map((s) => s.id);
    const com = sistemasVisiveis({ ...corretor, flagsLigadas: LIGADA }, SISTEMAS_NAV)
      .map((s) => s.id)
      .filter((id) => id !== "academia");
    expect(com).toEqual(sem);
  });

  it("fica fora de SISTEMAS: o registro estável não muda por causa de uma flag", () => {
    expect(SISTEMAS.map((s) => s.id)).not.toContain("academia");
    expect(SISTEMAS_NAV).toHaveLength(SISTEMAS.length + 1);
  });

  it("a rota /academia resolve para o sistema Academia", () => {
    expect(sistemaAtivo({ pathname: "/academia", search: {} }, SISTEMAS_NAV)?.id).toBe("academia");
    expect(sistemaAtivo({ pathname: "/academia/progresso", search: {} }, SISTEMAS_NAV)?.id).toBe(
      "academia",
    );
  });

  it("reaproveita a cor de Docs & Projetos: a paleta é fechada", () => {
    expect(SISTEMA_ACADEMIA.cor).toBe("projetos");
  });
});

// ---------------------------------------------------------------------------
// useFlagsNav: quem decide o que entra no conjunto de flags
// ---------------------------------------------------------------------------
const estado = vi.hoisted(() => ({
  menu: false,
  card: false,
  participa: false,
  isAdmin: false,
}));

vi.mock("@/hooks/use-app-flags", () => ({
  useAppFlag: (chave: string) => ({
    ligada: chave === "academia_menu" ? estado.menu : estado.card,
    carregando: false,
    erro: null,
    recarregar: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-auth", () => ({
  useUserRoles: () => ({ isAdmin: estado.isAdmin, roles: [], loading: false }),
}));
vi.mock("@/features/academia/academia-client", () => ({
  useEhParticipante: () => ({ participa: estado.participa, carregando: false }),
}));

import { useFlagsNav } from "@/features/academia/use-flags-nav";

afterEach(cleanup);

function flags() {
  return renderHook(() => useFlagsNav()).result.current;
}

describe("useFlagsNav", () => {
  it("flag desligada esconde, mesmo para participante", () => {
    Object.assign(estado, { menu: false, card: false, participa: true, isAdmin: false });
    expect(flags().has("academia_menu")).toBe(false);
    expect(flags().has("academia_card_inicio")).toBe(false);
  });

  it("flag ligada mostra para quem participa", () => {
    Object.assign(estado, { menu: true, card: true, participa: true, isAdmin: false });
    expect(flags().has("academia_menu")).toBe(true);
    expect(flags().has("academia_card_inicio")).toBe(true);
  });

  it("flag ligada não mostra para quem NÃO participa", () => {
    Object.assign(estado, { menu: true, card: true, participa: false, isAdmin: false });
    expect(flags().has("academia_menu")).toBe(false);
  });

  it("admin entra no menu sem participar, para pré-visualizar", () => {
    Object.assign(estado, { menu: true, card: true, participa: false, isAdmin: true });
    expect(flags().has("academia_menu")).toBe(true);
  });

  it("mas o card do /inicio é só de quem estuda: admin que não participa não vê", () => {
    Object.assign(estado, { menu: true, card: true, participa: false, isAdmin: true });
    expect(flags().has("academia_card_inicio")).toBe(false);
  });
});
