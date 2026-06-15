import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/page-header";

describe("<PageHeader />", () => {
  it("renderiza título e descrição", () => {
    render(<PageHeader title="Tarefas" description="Centralize follow-ups" />);
    expect(screen.getByText("Tarefas")).toBeInTheDocument();
    expect(screen.getByText("Centralize follow-ups")).toBeInTheDocument();
  });

  it("renderiza ações quando informadas", () => {
    render(<PageHeader title="X" actions={<button>Acao</button>} />);
    expect(screen.getByRole("button", { name: "Acao" })).toBeInTheDocument();
  });
});
