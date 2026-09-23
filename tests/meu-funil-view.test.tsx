import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { MeuFunilRpc } from "@/features/meu-funil/meu-funil";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "c1" }, session: null, loading: false }),
}));

// O hook é a única porta do banco; aqui interessa o desenho.
const estado = vi.hoisted(() => ({
  data: undefined as MeuFunilRpc | null | undefined,
  isPending: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));
vi.mock("@/features/meu-funil/use-meu-funil", () => ({
  useMeuFunil: () => estado,
}));

import { MeuFunilView } from "@/features/meu-funil/meu-funil-view";

afterEach(cleanup);

const DADOS: MeuFunilRpc = {
  dias: 90,
  inicio: "2026-06-26",
  fim: "2026-09-23",
  minhas: [
    {
      origem: "facebook",
      grupo: "real",
      recebidos: 60,
      conversou: 30,
      agendou: 6,
      visitou: 4,
      pasta: 2,
      vendas: 2,
      perdidos: 20,
    },
    {
      origem: "importacao",
      grupo: "base",
      recebidos: 800,
      conversou: 40,
      agendou: 3,
      visitou: 1,
      pasta: 0,
      vendas: 0,
      perdidos: 100,
    },
  ],
  time: [
    {
      grupo: "real",
      corretores: 8,
      recebidos: 1000,
      conversou: 600,
      agendou: 300,
      visitou: 200,
      pasta: 100,
      vendas: 50,
      perdidos: 300,
    },
  ],
  mes: { inicio: "2026-09-01", vendas: 1, meta_vendas: 3 },
  atualizado_em: null,
};

describe("MeuFunilView", () => {
  it("mostra a matemática da venda sem a base importada e o gargalo contra o time", () => {
    estado.data = DADOS;
    const onDiag = vi.fn();
    render(<MeuFunilView dia="2026-09-23" onDiagnostico={onDiag} />);

    // 60 leads reais / 2 vendas = 30 (as 800 fichas importadas não entram).
    expect(within(screen.getByTestId("por-venda-recebidos")).getByText("30")).toBeTruthy();
    // Conversa → agendamento: 20% contra 50% do time.
    expect(
      within(screen.getByTestId("meu-funil-diagnostico")).getByText(
        /Transformar conversa em agendamento/,
      ),
    ).toBeTruthy();
    expect(onDiag).toHaveBeenCalledWith(expect.objectContaining({ foco: "agendar" }));
    // Base em bloco próprio.
    expect(within(screen.getByTestId("meu-funil-base")).getAllByText("800").length).toBeGreaterThan(
      0,
    );
    // Plano: meta 3, 1 feita → faltam 2 → 60 leads.
    expect(within(screen.getByTestId("meu-funil-plano")).getByText("60")).toBeTruthy();
  });

  it("erro de leitura mostra o estado de erro, não um funil zerado", () => {
    estado.data = undefined;
    estado.isError = true;
    estado.error = new Error("rede");
    render(<MeuFunilView dia="2026-09-23" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("meu-funil-diagnostico")).toBeNull();
    estado.isError = false;
  });
});
