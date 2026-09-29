import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const papel = vi.hoisted(() => ({ isAdmin: false }));

vi.mock("@/hooks/use-auth", () => ({
  useUserRoles: () => ({ isAdmin: papel.isAdmin, loading: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/features/academia/gestao/aba-agora", () => ({ AbaAgora: () => <p>agora</p> }));
vi.mock("@/features/academia/gestao/aba-praticas", () => ({ AbaPraticas: () => <p>praticas</p> }));
vi.mock("@/features/academia/gestao/aba-time", () => ({ AbaTime: () => <p>time</p> }));
vi.mock("@/features/academia/gestao/aba-participantes", () => ({
  AbaParticipantes: () => <p>participantes</p>,
}));
vi.mock("@/features/academia/gestao/aba-recomendacoes", () => ({
  AbaRecomendacoes: () => <p>recomendacoes</p>,
}));
vi.mock("@/features/academia/gestao/aba-efeito", () => ({ AbaEfeito: () => <p>efeito</p> }));
vi.mock("@/features/academia/gestao/aba-encontros", () => ({
  AbaEncontros: () => <p>encontros</p>,
}));

import { GestaoPage } from "@/features/academia/gestao/gestao-page";

afterEach(cleanup);

describe("hub da gestão da Academia", () => {
  it("gestor não vê a aba Participantes nem o atalho de Conteúdo", () => {
    papel.isAdmin = false;
    render(<GestaoPage aba={undefined} onAbaChange={vi.fn()} />);
    expect(screen.queryByRole("tab", { name: "Participantes" })).toBeNull();
    expect(screen.queryByText("Conteúdo")).toBeNull();
    expect(screen.getByRole("tab", { name: "Agora" }).getAttribute("aria-selected")).toBe("true");
  });

  it("gestor que força ?tab=participantes cai em Agora", () => {
    papel.isAdmin = false;
    render(<GestaoPage aba="participantes" onAbaChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Agora" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("participantes")).toBeNull();
  });

  it("admin vê Participantes e o atalho de Conteúdo", () => {
    papel.isAdmin = true;
    render(<GestaoPage aba="participantes" onAbaChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Participantes" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByText("Conteúdo")).toBeTruthy();
  });
});
