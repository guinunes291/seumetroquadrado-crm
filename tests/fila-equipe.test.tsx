// A tabela do gestor: uma linha por corretor com os números que a fila cobra,
// o medidor contra o teto, "Ver a fila" e a linha "Sem corretor" → Higiene.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { FilaEquipeRow } from "@/features/fila-unica/use-fila-equipe";

const estado = vi.hoisted(() => ({
  data: undefined as FilaEquipeRow[] | null | undefined,
  isPending: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));
vi.mock("@/features/fila-unica/use-fila-equipe", () => ({
  useFilaEquipe: () => estado,
  FILA_UNICA_EQUIPE_KEY: "fila-unica:equipe",
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children: React.ReactNode;
    to: string;
    search?: Record<string, string | undefined>;
  }) => <a href={search?.corretor ? `${to}?corretor=${search.corretor}` : to}>{children}</a>,
}));

import { FilaEquipe } from "@/features/fila-unica/fila-equipe";

const row = (p: Partial<FilaEquipeRow> & { nome: string }): FilaEquipeRow => ({
  corretor_id: "11111111-1111-4111-8111-111111111111",
  carteira_ativa: 0,
  vencidos: 0,
  sem_proximo_passo: 0,
  fundo_parado: 0,
  em_jogo: 0,
  ...p,
});

afterEach(() => {
  cleanup();
  estado.data = undefined;
  estado.isPending = false;
  estado.isError = false;
});

describe("FilaEquipe", () => {
  it("uma linha por corretor: medidor contra o teto, números em vermelho quando há o que cobrar, VGV e o link", () => {
    estado.data = [
      row({
        nome: "Leticia Castro",
        carteira_ativa: 57,
        vencidos: 14,
        sem_proximo_passo: 6,
        fundo_parado: 5,
        em_jogo: 3_120_000,
      }),
      row({
        corretor_id: "22222222-2222-4222-8222-222222222222",
        nome: "Jessica Sobral",
        carteira_ativa: 31,
        em_jogo: 0,
      }),
      row({ corretor_id: null, nome: "Sem corretor", carteira_ativa: 22_445, em_jogo: 0 }),
    ];
    render(<FilaEquipe atual="22222222-2222-4222-8222-222222222222" />);
    const linhas = screen.getAllByTestId("fila-equipe-linha");
    expect(linhas).toHaveLength(3);

    const leticia = within(linhas[0]);
    expect(leticia.getByText("40 / 40")).toHaveClass("text-destructive");
    expect(leticia.getByText("14")).toHaveClass("text-destructive");
    expect(leticia.getByText("5")).toHaveClass("text-destructive");
    expect(leticia.getByText(/R\$\s?3,1\s?mi/)).toBeInTheDocument();
    expect(leticia.getByRole("link", { name: "Ver a fila" })).toHaveAttribute(
      "href",
      "/fila?corretor=11111111-1111-4111-8111-111111111111",
    );

    const jessica = within(linhas[1]);
    expect(jessica.getByText("31 / 40")).not.toHaveClass("text-destructive");
    expect(linhas[1]).toHaveAttribute("data-atual");

    const semDono = within(linhas[2]);
    expect(semDono.getByText("22.445")).toBeInTheDocument();
    expect(semDono.getByRole("link", { name: "Abrir higiene" })).toHaveAttribute(
      "href",
      "/higiene-funil",
    );
  });

  it("sem a RPC diz 'sem dado'; com erro, oferece tentar de novo", () => {
    estado.data = null;
    const { unmount } = render(<FilaEquipe />);
    expect(screen.getByText(/Sem dado/)).toBeInTheDocument();
    unmount();
    estado.data = undefined;
    estado.isError = true;
    estado.error = new Error("boom");
    render(<FilaEquipe />);
    expect(screen.getByText("Não foi possível ler a equipe.")).toBeInTheDocument();
  });
});
