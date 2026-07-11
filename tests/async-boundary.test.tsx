import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AsyncBoundary } from "@/components/ui/async-boundary";

describe("<AsyncBoundary />", () => {
  it("mostra carregamento sem renderizar o conteúdo", () => {
    render(
      <AsyncBoundary isLoading loadingLabel="Carregando leads">
        <p>Lista pronta</p>
      </AsyncBoundary>,
    );

    expect(screen.getByRole("status", { name: "Carregando leads" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.queryByText("Lista pronta")).not.toBeInTheDocument();
  });

  it("dá precedência ao erro e permite tentar novamente", () => {
    const onRetry = vi.fn();
    render(
      <AsyncBoundary
        isLoading
        isError
        error={new Error("Falha de rede")}
        errorTitle="Não foi possível carregar os leads."
        onRetry={onRetry}
      >
        <p>Estado vazio</p>
      </AsyncBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os leads.");
    expect(screen.getByText("Falha de rede")).toBeInTheDocument();
    expect(screen.queryByText("Estado vazio")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renderiza o conteúdo somente no estado de sucesso", () => {
    render(
      <AsyncBoundary isLoading={false}>
        <p>Lista pronta</p>
      </AsyncBoundary>,
    );

    expect(screen.getByText("Lista pronta")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
