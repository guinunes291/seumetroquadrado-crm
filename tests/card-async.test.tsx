import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CardAsync } from "@/components/card-async";

type Item = { id: string };

function renderState(
  over: Partial<Parameters<typeof CardAsync<Item[]>>[0]["query"]>,
  refetch = vi.fn(),
) {
  return render(
    <CardAsync<Item[]>
      query={{ isLoading: false, isError: false, data: [], refetch, ...over }}
      isEmpty={(d) => d.length === 0}
      empty={<p>Nada pendente.</p>}
      skeletonRows={2}
    >
      {(items) => (
        <ul>
          {items.map((i) => (
            <li key={i.id}>linha {i.id}</li>
          ))}
        </ul>
      )}
    </CardAsync>,
  );
}

describe("<CardAsync />", () => {
  it("carregando → mostra esqueleto e NÃO mostra vazio nem dados", () => {
    const { container } = renderState({ isLoading: true, data: undefined });
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText("Nada pendente.")).not.toBeInTheDocument();
  });

  it("erro → mostra 'Tentar novamente' e NUNCA o estado vazio (sem zero falso)", () => {
    const refetch = vi.fn();
    renderState({ isError: true, data: undefined }, refetch);
    expect(screen.queryByText("Nada pendente.")).not.toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /tentar novamente/i });
    fireEvent.click(btn);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("data indefinida sem erro (query ainda não rodou) → esqueleto, não erro", () => {
    const { container } = renderState({ data: undefined });
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tentar novamente/i })).not.toBeInTheDocument();
  });

  it("vazio → mostra a mensagem de vazio", () => {
    renderState({ data: [] });
    expect(screen.getByText("Nada pendente.")).toBeInTheDocument();
  });

  it("com dados → renderiza as linhas", () => {
    renderState({ data: [{ id: "1" }, { id: "2" }] });
    expect(screen.getByText("linha 1")).toBeInTheDocument();
    expect(screen.getByText("linha 2")).toBeInTheDocument();
  });
});
