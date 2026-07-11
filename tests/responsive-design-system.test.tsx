import { useState } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { EntityCard, EntityRow } from "@/components/ui/entity-card";
import { FilterBar } from "@/components/ui/filter-bar";
import { ResponsiveTabs, ResponsiveTabsContent } from "@/components/ui/responsive-tabs";
import { StickyActionRail } from "@/components/ui/sticky-action-rail";

function TabsHarness() {
  const [value, setValue] = useState("lista");
  return (
    <ResponsiveTabs
      value={value}
      onValueChange={setValue}
      ariaLabel="Visões de leads"
      items={[
        { value: "lista", label: "Lista" },
        { value: "pipeline", label: "Pipeline" },
      ]}
    >
      <ResponsiveTabsContent value="lista">Conteúdo da lista</ResponsiveTabsContent>
      <ResponsiveTabsContent value="pipeline">Conteúdo do pipeline</ResponsiveTabsContent>
    </ResponsiveTabs>
  );
}

describe("primitives responsivos do CRM", () => {
  it("mantém tabs com semântica, estado atual e alvo de 44 px", () => {
    render(<TabsHarness />);

    const list = screen.getByRole("tablist", { name: "Visões de leads" });
    const lista = screen.getByRole("tab", { name: "Lista" });
    const pipeline = screen.getByRole("tab", { name: "Pipeline" });

    expect(list).toHaveClass("overflow-x-auto", "min-h-11");
    expect(lista).toHaveAttribute("aria-current", "page");
    expect(lista).toHaveClass("min-h-11");

    fireEvent.mouseDown(pipeline, { button: 0, ctrlKey: false });
    fireEvent.click(pipeline);
    expect(screen.getByRole("tab", { name: "Pipeline" })).toHaveAttribute("aria-current", "page");
    expect(lista).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Conteúdo do pipeline")).toBeVisible();
  });

  it("expõe filtros recolhíveis, resultado live e limpeza acessível", () => {
    const onClear = vi.fn();
    render(
      <FilterBar
        activeCount={2}
        onClear={onClear}
        resultsLabel="18 leads encontrados"
        primary={<input aria-label="Busca principal" />}
      >
        <label>
          Buscar
          <input />
        </label>
      </FilterBar>,
    );

    const toggle = screen.getByRole("button", { name: "Mostrar filtros" });
    expect(screen.getByRole("textbox", { name: "Busca principal" })).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveClass("min-h-11");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Ocultar filtros" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    expect(screen.getByRole("status")).toHaveTextContent("18 leads encontrados");
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("mantém seleção e ações em lote acima da navegação mobile", () => {
    const onClear = vi.fn();
    render(
      <BulkActionBar selectedCount={2} entityLabel="lead" onClear={onClear}>
        <button type="button">Transferir</button>
      </BulkActionBar>,
    );

    const region = screen.getByRole("region", { name: "Ações em lote" });
    expect(region).toHaveClass("bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]", "md:static");
    expect(screen.getByRole("status")).toHaveTextContent("2 leads selecionados");
    const clear = screen.getByRole("button", { name: "Limpar seleção" });
    expect(clear).toHaveClass("min-h-11", "min-w-11");
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("ativa cards por botão sem sequestrar ações internas", () => {
    const onActivate = vi.fn();
    const onInternal = vi.fn();
    render(
      <EntityCard
        selected
        onActivate={onActivate}
        activationLabel="Abrir lead Maria"
        aria-label="Lead Maria"
      >
        <p>Maria</p>
        <button type="button" onClick={onInternal}>
          WhatsApp
        </button>
      </EntityCard>,
    );

    const activate = screen.getByRole("button", { name: "Abrir lead Maria" });
    expect(activate).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    expect(onInternal).toHaveBeenCalledOnce();
    expect(onActivate).not.toHaveBeenCalled();
    fireEvent.click(activate);
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("expõe aria-selected e ativação por teclado nas linhas", () => {
    const onActivate = vi.fn();
    render(
      <table>
        <tbody>
          <EntityRow asChild selected onActivate={onActivate} aria-label="Abrir lead João">
            <tr>
              <td>João</td>
            </tr>
          </EntityRow>
        </tbody>
      </table>,
    );

    const row = screen.getByRole("row", { name: "Abrir lead João" });
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(row).toHaveAttribute("aria-keyshortcuts", "Enter Space");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("posiciona a action rail acima do BottomNav e anuncia mudanças", () => {
    render(
      <StickyActionRail statusMessage="Etapa atual: qualificado">
        <button type="button">Ligar</button>
        <button type="button">WhatsApp</button>
        <button type="button">Próxima etapa</button>
      </StickyActionRail>,
    );

    const toolbar = screen.getByRole("toolbar", { name: "Ações principais" });
    expect(toolbar).toHaveClass(
      "bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]",
      "z-30",
      "md:hidden",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Etapa atual: qualificado");
  });
});

describe("adoção nas jornadas comerciais", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("aplica os primitives na base de leads e no pipeline", () => {
    const leads = read("src/routes/_authenticated/leads.index.tsx");
    const kanban = read("src/components/leads-kanban-board.tsx");
    const pipeline = read("src/routes/_authenticated/pipeline.tsx");

    expect(leads).toContain("<FilterBar");
    expect(leads).toContain("<BulkActionBar");
    expect(leads).toContain("<EntityCard");
    expect(leads).toContain("<EntityRow");
    expect(leads).toContain('aria-pressed={viewMode === "cards"}');
    expect(kanban).toContain("<ResponsiveTabs");
    expect(kanban).toContain("setAnnouncement(`Etapa exibida:");
    expect(pipeline).toContain("<ResponsiveTabs");
  });

  it("mantém login invite-only com controles de pelo menos 44 px", () => {
    const auth = read("src/routes/auth.tsx");
    expect(auth).toContain("exclusivo para profissionais convidados");
    expect(auth).not.toContain("Criar conta");
    expect(auth).toContain('className="min-h-11"');
    expect(auth).toContain('className="min-h-11 pr-12"');
    expect(auth).toContain('className="min-h-11 w-full"');
    expect(auth).toContain("-my-3 min-h-11");
  });

  it("mantém as três ações comerciais fixas no dossiê mobile", () => {
    const dossier = read("src/routes/_authenticated/leads.$leadId.tsx");

    expect(dossier).toContain("<StickyActionRail");
    expect(dossier).toContain("<span>Ligar</span>");
    expect(dossier).toContain("<span>WhatsApp</span>");
    expect(dossier).toContain("<span>Próxima etapa</span>");
    expect(dossier).toContain('className="pb-44 md:pb-0"');
  });
});
