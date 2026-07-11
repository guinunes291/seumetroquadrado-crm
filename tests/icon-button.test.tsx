import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IconButton } from "@/components/ui/icon-button";

describe("<IconButton />", () => {
  it("expõe nome acessível e mantém o ícone decorativo", () => {
    render(<IconButton label="Abrir filtros" icon={<svg data-testid="filter-icon" />} />);

    const button = screen.getByRole("button", { name: "Abrir filtros" });
    expect(button).toHaveAttribute("title", "Abrir filtros");
    expect(screen.getByTestId("filter-icon").parentElement).toHaveAttribute("aria-hidden", "true");
  });

  it("garante alvo de toque de 44 px e preserva a ação", () => {
    const onClick = vi.fn();
    render(<IconButton label="Atualizar" icon={<svg />} onClick={onClick} className="h-7 w-7" />);

    const button = screen.getByRole("button", { name: "Atualizar" });
    expect(button).toHaveClass("h-11", "w-11", "min-h-11", "min-w-11");

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
