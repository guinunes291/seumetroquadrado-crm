import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import {
  SISTEMAS,
  SISTEMAS_NAV,
  SISTEMA_ACADEMIA,
  secoesVisiveis,
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
  isGestor: false,
  isSuperintendente: false,
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
  useUserRoles: () => ({
    isAdmin: estado.isAdmin,
    isGestor: estado.isGestor,
    isSuperintendente: estado.isSuperintendente,
    roles: [],
    loading: false,
  }),
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

  it("admin que não participa entra pela gestão, não pela trilha", () => {
    Object.assign(estado, { menu: true, card: true, participa: false, isAdmin: true });
    expect(flags().has("academia_menu")).toBe(false);
    expect(flags().has("academia_gestao")).toBe(true);
  });

  it("admin gere mesmo com a flag desligada: prepara conteúdo e inscreve antes de abrir", () => {
    Object.assign(estado, { menu: false, card: false, participa: false, isAdmin: true });
    expect(flags().has("academia_gestao")).toBe(true);
    expect(flags().has("academia_menu")).toBe(false);
  });

  it("gestor e superintendente só gerem com a flag ligada", () => {
    for (const papel of ["isGestor", "isSuperintendente"] as const) {
      Object.assign(estado, {
        menu: false,
        card: false,
        participa: false,
        isAdmin: false,
        isGestor: false,
        isSuperintendente: false,
        [papel]: true,
      });
      expect(flags().has("academia_gestao"), `${papel} com flag desligada`).toBe(false);
      Object.assign(estado, { menu: true });
      expect(flags().has("academia_gestao"), `${papel} com flag ligada`).toBe(true);
    }
    Object.assign(estado, { isGestor: false, isSuperintendente: false });
  });

  it("corretor nunca ganha a porta da gestão", () => {
    Object.assign(estado, { menu: true, card: true, participa: true, isAdmin: false });
    expect(flags().has("academia_gestao")).toBe(false);
  });

  it("mas o card do /inicio é só de quem estuda: admin que não participa não vê", () => {
    Object.assign(estado, { menu: true, card: true, participa: false, isAdmin: true });
    expect(flags().has("academia_card_inicio")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Seções: aluno e gestão entram por portas diferentes
// ---------------------------------------------------------------------------
describe("seções da Academia", () => {
  const ids = (ctx: PapelCtx) => secoesVisiveis(SISTEMA_ACADEMIA, ctx).map((s) => s.id);

  it("aluno vê trilha e progresso, sem gestão", () => {
    expect(ids({ ...corretor, flagsLigadas: LIGADA })).toEqual(["trilha", "progresso"]);
  });

  it("admin que só gere vê Gestão e Conteúdo e cai na gestão", () => {
    const ctx = { ...admin, flagsLigadas: new Set(["academia_gestao"]) };
    expect(sistemaVisivel(SISTEMA_ACADEMIA, ctx)).toBe(true);
    expect(ids(ctx)).toEqual(["gestao", "conteudo"]);
    expect(SISTEMA_ACADEMIA.homePorPapel?.(ctx)).toEqual({ to: "/academia/gestao" });
  });

  it("gestor que gere não vê Conteúdo (só admin)", () => {
    const ctx = { ...gestor, flagsLigadas: new Set(["academia_gestao"]) };
    expect(ids(ctx)).toEqual(["gestao"]);
  });

  it("quem estuda cai na trilha", () => {
    const ctx = { ...gestor, flagsLigadas: new Set(["academia_menu", "academia_gestao"]) };
    expect(SISTEMA_ACADEMIA.homePorPapel?.(ctx)).toEqual({ to: "/academia" });
  });

  it("as rotas de gestão, conteúdo e certificado resolvem para a Academia", () => {
    for (const rota of [
      "/academia/gestao",
      "/academia/conteudo/M01",
      "/academia/certificado/ABC12345",
    ]) {
      expect(sistemaAtivo({ pathname: rota, search: {} }, SISTEMAS_NAV)?.id, rota).toBe("academia");
    }
  });
});
