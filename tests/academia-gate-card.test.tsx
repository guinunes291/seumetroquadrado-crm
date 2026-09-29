import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { DadosGate } from "@/features/academia/gestao/gestao-client";

const estado = vi.hoisted(() => ({
  isAdmin: false,
  gate: null as DadosGate | null,
  mutate: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useUserRoles: () => ({ isAdmin: estado.isAdmin, loading: false }),
}));
vi.mock("@/features/academia/gestao/gestao-client", () => ({
  useGateSombra: () => ({ isPending: false, isError: false, data: estado.gate }),
  useDefinirModoGate: () => ({ mutate: estado.mutate, isPending: false }),
  useAtribuicoesAbertas: vi.fn(),
  useEquipeAcademia: vi.fn(),
  useModulosAcademia: vi.fn(),
  usePraticasPendentes: vi.fn(),
}));

import { CardGate } from "@/features/academia/gestao/aba-agora";

const linhas: DadosGate["linhas"] = [
  {
    corretor_id: "a",
    corretor_nome: "A",
    situacao: "nao_habilitado",
    leads_30d: 3,
    pct_do_total: 30,
  },
  { corretor_id: "b", corretor_nome: "B", situacao: "habilitado", leads_30d: 7, pct_do_total: 70 },
];

afterEach(() => {
  cleanup();
  estado.mutate.mockReset();
});

describe("card do gate em sombra", () => {
  it("desligado: gestor não vê nada", () => {
    estado.isAdmin = false;
    estado.gate = { modo: "desligado", linhas: [] };
    const { container } = render(<CardGate />);
    expect(container.textContent).toBe("");
  });

  it("desligado: admin vê o card e liga com um clique", () => {
    estado.isAdmin = true;
    estado.gate = { modo: "desligado", linhas: [] };
    render(<CardGate />);
    expect(screen.getByText(/Simulação desligada/)).toBeTruthy();
    screen.getByRole("button", { name: "Ligar simulação" }).click();
    expect(estado.mutate.mock.calls[0][0]).toBe("sombra");
  });

  it("ligado: gestor vê os números e não tem botão", () => {
    estado.isAdmin = false;
    estado.gate = { modo: "sombra", linhas };
    render(<CardGate />);
    expect(screen.getByText(/de 10 leads/).textContent).toContain("3");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
