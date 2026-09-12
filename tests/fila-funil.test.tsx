import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { FunilRow } from "@/features/fila-unica/funil-derive";

const roles = {
  isAdmin: false,
  isGestor: false,
  isSuperintendente: false,
  isCorretor: true,
  isSdr: false,
  roles: ["corretor"],
  loading: false,
  error: null,
  has: () => false,
};
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "c1" }, session: null, loading: false }),
  useUserRoles: () => roles,
}));

// O hook é a única porta do banco; aqui interessa o desenho.
const estado = vi.hoisted(() => ({
  data: undefined as FunilRow[] | null | undefined,
  isPending: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));
vi.mock("@/features/fila-unica/use-fila-funil", () => ({
  useFilaFunil: () => estado,
  FILA_UNICA_FUNIL_KEY: "fila-unica:funil",
}));

import { FilaFunil } from "@/features/fila-unica/fila-funil";

const row = (
  recorte: string,
  etapa: string,
  ordem: number,
  quantidade: number,
  parados = 0,
): FunilRow => ({
  recorte,
  etapa,
  ordem,
  quantidade,
  parados,
});

const ROWS: FunilRow[] = [
  row("base", "aguardando_atendimento", 1, 20, 12),
  row("base", "em_atendimento", 4, 40, 36),
  row("base", "agendado", 5, 4, 2),
  row("base", "analise_credito", 7, 8, 7),
  row("base", "venda", 8, 5),
  row("base", "perdido", 99, 30),
  row("safra", "aguardando_atendimento", 1, 5, 2),
  row("safra", "em_atendimento", 4, 9, 4),
  row("safra", "perdido", 99, 3),
];

afterEach(() => {
  cleanup();
  estado.data = undefined;
  estado.isPending = false;
  estado.isError = false;
  estado.error = null;
});

describe("FilaFunil", () => {
  it("desenha os oito degraus, os marcadores atual → meta e a saída lateral", () => {
    estado.data = ROWS;
    render(<FilaFunil />);
    expect(
      screen.getByRole("heading", { name: "Onde os seus clientes somem" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("funil-etapa")).toHaveLength(8);
    const marcadores = screen.getAllByTestId("funil-marcador");
    expect(marcadores).toHaveLength(7);
    // Safra é o recorte inicial: a venda fica sem dado (ciclo > 30 dias).
    expect(marcadores[6]).toHaveAttribute("data-tom", "none");
    expect(marcadores[6]).toHaveTextContent("—");
    // A origem da meta chega ao leitor de tela e ao teclado, não só ao hover.
    expect(marcadores[0]).toHaveAttribute("aria-label", expect.stringContaining("meta 50%"));
    expect(marcadores[0]).toHaveAttribute("tabindex", "0");
    expect(within(screen.getByText(/Saída lateral/)).getByText("3")).toBeInTheDocument();
    expect(screen.getAllByTestId("funil-vazamento")).toHaveLength(2);
  });

  it("alterna para a base inteira e mede o fechamento contra a meta", () => {
    estado.data = ROWS;
    render(<FilaFunil />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Base inteira" }));
    fireEvent.click(screen.getByRole("tab", { name: "Base inteira" }));
    const marcadores = screen.getAllByTestId("funil-marcador");
    // analise_credito → venda: 5 de 13 = 38% contra 30% → na meta.
    expect(marcadores[6]).toHaveAttribute("data-tom", "good");
    expect(marcadores[6]).toHaveTextContent("38%");
    expect(within(screen.getByText(/Saída lateral/)).getByText("30")).toBeInTheDocument();
    expect(screen.getAllByTestId("funil-vazamento")).toHaveLength(3);
  });

  it("sem a RPC diz 'sem dado'; com erro, oferece tentar de novo", () => {
    estado.data = null;
    const { unmount } = render(<FilaFunil />);
    expect(screen.getByText(/Sem dado/)).toBeInTheDocument();
    unmount();
    estado.data = undefined;
    estado.isError = true;
    estado.error = new Error("boom");
    render(<FilaFunil />);
    expect(screen.getByText("Não foi possível montar o funil.")).toBeInTheDocument();
  });

  it("carteira zerada não desenha um funil de zeros", () => {
    estado.data = [];
    render(<FilaFunil />);
    expect(screen.getByTestId("funil-vazio")).toHaveTextContent(
      /Nenhum lead criado nos últimos 30 dias/,
    );
    expect(screen.queryAllByTestId("funil-etapa")).toHaveLength(0);
  });

  it("no celular o painel abre fechado e o botão 'Ver funil' o abre", () => {
    estado.data = ROWS;
    render(<FilaFunil />);
    const botao = screen.getByRole("button", { name: /Ver funil/ });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(botao).toHaveAttribute("aria-controls");
    fireEvent.click(botao);
    expect(screen.getByRole("button", { name: /Ocultar/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});
