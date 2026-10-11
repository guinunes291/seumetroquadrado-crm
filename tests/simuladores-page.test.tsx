// Tela de Simuladores renderizada de ponta a ponta (com o catálogo, as
// preferências e o Supabase simulados): o link do dossiê traz o banco, o
// projeto traz a entrega, o corretor digita ato e chaves e a tela monta o
// fluxo, o "quanto custa esperar" e o cronograma.
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const navegar = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  useNavigate: () => navegar,
}));

vi.mock("@/hooks/use-preference", () => ({
  usePreference: <T,>(_chave: string, inicial: T) => useState<T>(inicial),
}));

vi.mock("@/features/projetos/use-prateleira-dados", () => ({
  useProjetosPrateleira: () => ({
    isLoading: false,
    data: [
      {
        id: "p-vibra",
        nome: "Vibra Estação",
        construtora: "Vibra Residencial",
        mes_entrega: 6,
        ano_entrega: 2028,
        status_entrega: "Em obras",
      },
      {
        id: "p-cury",
        nome: "Cury Centro",
        construtora: "Cury",
        mes_entrega: 1,
        ano_entrega: 2028,
        status_entrega: null,
      },
    ],
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    is: () => consulta,
    not: () => consulta,
    order: async () => ({ data: [], error: null }),
  };
  return { supabase: { from: () => consulta } };
});

import { SimuladoresPage } from "@/features/simuladores/simuladores-page";

function renderizar(construtora: "vibra" | "mundo-apto" = "vibra") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SimuladoresPage
        construtora={construtora}
        prefill={{
          projeto: "p-vibra",
          valor: 260_000,
          financiamento: 190_000,
          subsidio: 8_000,
          fgts: 12_000,
        }}
      />
    </QueryClientProvider>,
  );
}

const digitar = (rotulo: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 11, 10, 0));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  navegar.mockReset();
});

describe("Simuladores", () => {
  it("abas das quatro construtoras e o aviso de regras a conferir", () => {
    renderizar();
    for (const nome of ["Vibra", "Direcional", "Longitude", "Mundo Apto"]) {
      expect(screen.getByRole("tab", { name: new RegExp(nome) })).toBeInTheDocument();
    }
    expect(screen.getByRole("tab", { name: /Vibra/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/ainda não foram conferidas com a tabela vigente/)).toBeInTheDocument();
  });

  it("projeto do link traz a entrega; ato e chaves fecham 19 mensais de R$ 2.000", () => {
    renderizar();
    expect((screen.getByLabelText("Entrega das chaves") as HTMLInputElement).value).toBe("2028-06");
    expect((screen.getByLabelText("Mês do ato") as HTMLInputElement).value).toBe("2026-10");
    expect((screen.getByLabelText("Financiamento") as HTMLInputElement).value).toBe("190000");

    digitar("Ato (sinal)", "3000");
    digitar("Chaves", "9000");

    expect(screen.getByText(/19x R\$\s2\.000,00/)).toBeInTheDocument();
    expect(screen.getByText("Quanto custa esperar")).toBeInTheDocument();
    expect(screen.getByText(/\+R\$\s111,11\/mês/)).toBeInTheDocument();
    expect(screen.getByText("Cronograma mês a mês")).toBeInTheDocument();
    expect(screen.getByText("Mensal 19/19")).toBeInTheDocument();
    // Exportações liberadas com o fluxo montado.
    expect(screen.getByRole("button", { name: /Exportar PDF/ })).toBeEnabled();
  });

  it("parcelado acima do teto vira erro com quanto falta", () => {
    renderizar();
    digitar("Financiamento", "150000");
    expect(screen.getByText(/o teto é 20,0%/)).toBeInTheDocument();
  });

  it("projeto de outra construtora não aparece na aba; trocar de aba navega", () => {
    renderizar("mundo-apto");
    // O ?projeto= é da Vibra: na aba Mundo Apto ele não é aplicado.
    expect((screen.getByLabelText("Entrega das chaves") as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/Informe a previsão de entrega/)).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Longitude/ }));
    expect(navegar).toHaveBeenCalledWith(expect.objectContaining({ to: "/simuladores" }));
  });
});
