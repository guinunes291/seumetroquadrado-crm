// Tela de Simuladores renderizada de ponta a ponta (com o catálogo, as
// preferências e o Supabase simulados): o link do dossiê traz o banco, o
// projeto traz a entrega, o corretor digita ato e chaves e a tela monta o
// fluxo, o "quanto custa esperar" e o cronograma. A aba Vibra usa a tabela
// oficial da construtora (teto de cada parcela pela renda).
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
        id: "p-dir",
        nome: "Direcional Estação",
        construtora: "Direcional",
        mes_entrega: 6,
        ano_entrega: 2028,
        status_entrega: "Em obras",
      },
      {
        id: "p-pvs",
        nome: "Parque Vila Sonia",
        construtora: "Vibra",
        mes_entrega: 11,
        ano_entrega: 2028,
        status_entrega: "Lançamento",
      },
      {
        id: "p-mab",
        nome: "MA Brooklin",
        construtora: "Mundo Apto",
        mes_entrega: 6,
        ano_entrega: 2027,
        status_entrega: "Obras",
      },
      {
        id: "p-lc",
        nome: "Longitude Città",
        construtora: "Longitude",
        mes_entrega: null,
        ano_entrega: null,
        status_entrega: null,
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
    in: () => consulta,
    not: () => consulta,
    order: async () => ({ data: [], error: null }),
  };
  return { supabase: { from: () => consulta } };
});

import { SimuladoresPage } from "@/features/simuladores/simuladores-page";
import type { SimuladorId } from "@/lib/simuladores/ids";

function renderizar(
  construtora: SimuladorId = "direcional",
  prefill: React.ComponentProps<typeof SimuladoresPage>["prefill"] = {
    projeto: "p-dir",
    valor: 260_000,
    financiamento: 190_000,
    subsidio: 8_000,
    fgts: 12_000,
  },
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SimuladoresPage construtora={construtora} prefill={prefill} />
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
    expect(screen.getByRole("tab", { name: /Direcional/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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
    renderizar("direcional", { projeto: "p-pvs", valor: 260_000 });
    // O ?projeto= é da Vibra: na aba Direcional ele não é aplicado.
    expect((screen.getByLabelText("Entrega das chaves") as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/Informe a previsão de entrega/)).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Longitude/ }));
    expect(navegar).toHaveBeenCalledWith(expect.objectContaining({ to: "/simuladores" }));
  });

  it("trocar de aba leva os dados do cliente na URL", () => {
    renderizar();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Vibra/ }));
    expect(navegar).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.objectContaining({
          construtora: "vibra",
          valor: 260_000,
          financiamento: 190_000,
          subsidio: 8_000,
          fgts: 12_000,
        }),
      }),
    );
  });
});

describe("Simuladores · Vibra", () => {
  const vibra = () =>
    renderizar("vibra", {
      projeto: "p-pvs",
      valor: 300_000,
      renda: 5_000,
      financiamento: 210_000,
      subsidio: 30_000,
      fgts: 10_000,
    });

  it("projeto do catálogo abre o empreendimento da tabela; falta o total até a entrega", async () => {
    vibra();
    expect(await screen.findByText(/FALTA INCLUIR R\$\s52\.100,00/)).toBeInTheDocument();
    expect(screen.getByText(/Tabela da Vibra de out\/2026/)).toBeInTheDocument();
    expect((screen.getByLabelText("Subsídio + FGTS") as HTMLInputElement).value).toBe("40000");
    // Tetos da renda de R$ 5 mil na linha das Mensais 1 (28%).
    expect(
      screen.getByText(/fev\/2027 a mar\/2027 · máx\. R\$\s1\.400,00 cada/),
    ).toBeInTheDocument();
  });

  it("preencher pelo teto fecha; parcela acima do teto avisa", async () => {
    vibra();
    fireEvent.click(await screen.findByRole("button", { name: /Preencher pelo teto/ }));
    expect(screen.getByText("FECHOU! O cliente tem perfil para este projeto.")).toBeInTheDocument();
    const m1 = screen.getByLabelText("Mensais 1: valor da parcela") as HTMLInputElement;
    expect(m1.value).toBe("1400");
    expect(screen.getByText("Quanto custa esperar")).toBeInTheDocument();
    expect(screen.getByText(/\+R\$\s1\.400,00/)).toBeInTheDocument();

    fireEvent.change(m1, { target: { value: "1500" } });
    expect(screen.getByText(/FALTA INCLUIR|SOBRA/)).toHaveTextContent(/SOBRA R\$\s200,00/);
    fireEvent.change(screen.getByLabelText("1º ato (assinatura): valor da parcela"), {
      target: { value: "3475" },
    });
    expect(screen.getByRole("status")).toHaveTextContent(/A conta fecha, mas passa do limite/);
  });

  it("um mês depois a tabela já perdeu uma mensal", async () => {
    vibra();
    const mes = await screen.findByLabelText("Mês do ato (assinatura)");
    fireEvent.change(mes, { target: { value: "2026-11" } });
    expect(screen.getByText(/a primeira mensal já saiu da conta/)).toBeInTheDocument();
    expect(screen.getByText(/mar\/2027 · máx\. R\$\s1\.400,00 cada/)).toBeInTheDocument();
  });
});

describe("Simuladores · Mundo Apto", () => {
  const mundoApto = () =>
    renderizar("mundo-apto", {
      projeto: "p-mab",
      valor: 322_720,
      renda: 6_000,
      financiamento: 230_000,
      subsidio: 10_000,
      fgts: 15_000,
    });

  it("projeto do catálogo abre o empreendimento da política; preencher fecha", async () => {
    mundoApto();
    expect(await screen.findByText(/FALTA INCLUIR R\$\s67\.720,00/)).toBeInTheDocument();
    expect(
      screen.getByText(/Política de crédito da Mundo Apto de 09\/04\/2026/),
    ).toBeInTheDocument();
    expect((screen.getByLabelText("Habite-se") as HTMLInputElement).value).toBe("2027-06");
    fireEvent.click(screen.getByRole("button", { name: /Preencher pela política/ }));
    expect(
      screen.getByText("FECHOU! O fluxo atende a política da Mundo Apto."),
    ).toBeInTheDocument();
    expect(screen.getByText("Conferência da política")).toBeInTheDocument();
    expect(screen.getAllByText("36 meses").length).toBeGreaterThan(0);
    expect(
      (screen.getByLabelText("Mensais durante a obra: valor da parcela") as HTMLInputElement).value,
    ).toBe("1800");
  });

  it("sem pós o fluxo perde as parcelas e o prazo fica abaixo de 36 meses", async () => {
    mundoApto();
    fireEvent.click(await screen.findByRole("button", { name: /Preencher pela política/ }));
    fireEvent.change(screen.getByLabelText("Parcelas depois do habite-se"), {
      target: { value: "0" },
    });
    // As 27 parcelas de R$ 600 saem da conta.
    expect(screen.getByRole("status")).toHaveTextContent(/FALTA INCLUIR R\$\s16\.200,00/);
    fireEvent.click(screen.getByRole("button", { name: /Preencher pela política/ }));
    expect(screen.getByRole("status")).toHaveTextContent(/fora da política: Prazo do contrato/);
  });
});

describe("Simuladores · Longitude", () => {
  const longitude = () =>
    renderizar("longitude", {
      projeto: "p-lc",
      valor: 220_000,
      renda: 4_000,
      financiamento: 160_000,
      subsidio: 10_000,
      parcela: 1_200,
    });

  it("projeto do catálogo abre o empreendimento; sem entrega, pede a data", async () => {
    longitude();
    expect(
      await screen.findByText(/Informe a previsão de entrega: as pré-chaves/),
    ).toBeInTheDocument();
    expect((screen.getByLabelText("Parcelas do pró-soluto") as HTMLInputElement).value).toBe("60");
    expect((screen.getByLabelText("Pré-chaves (% da renda)") as HTMLInputElement).value).toBe(
      "25.99",
    );
  });

  it("com entrega e avaliação, preencher pelas premissas deixa APTO PARA VENDA", async () => {
    longitude();
    fireEvent.change(await screen.findByLabelText("Previsão de entrega"), {
      target: { value: "2028-06" },
    });
    fireEvent.change(screen.getByLabelText("Valor de avaliação"), { target: { value: "230000" } });
    fireEvent.click(screen.getByRole("button", { name: /Preencher pelas premissas/ }));
    expect(screen.getByRole("status")).toHaveTextContent(/APTO PARA VENDA/);
    expect((screen.getByLabelText("Ato: valor da parcela") as HTMLInputElement).value).toBe(
      "10230",
    );
    expect(screen.getByText("Premissas práticas")).toBeInTheDocument();
    expect(screen.getByText(/\+R\$\s1\.039,60/)).toBeInTheDocument();

    // Tirando R$ 1.000 do ato o fluxo fica abaixo da tabela: desconto pede aprovação.
    fireEvent.change(screen.getByLabelText("Ato: valor da parcela"), { target: { value: "9230" } });
    expect(screen.getByRole("status")).toHaveTextContent(
      /NECESSÁRIO APROVAÇÃO: desconto de R\$\s1\.000,00/,
    );
  });
});
