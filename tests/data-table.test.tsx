import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";

// usePreference exige AuthProvider + Supabase; para o teste da tabela basta
// um estado em memória com a mesma assinatura.
const prefStore = new Map<string, unknown>();
vi.mock("@/hooks/use-preference", () => ({
  usePreference: <T,>(key: string, fallback: T) => {
    const value = (prefStore.has(key) ? prefStore.get(key) : fallback) as T;
    const set = (next: T | ((p: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(value) : next;
      prefStore.set(key, resolved);
    };
    return [value, set] as const;
  },
}));

import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";

type Row = { id: string; nome: string; valor: number };

const DATA: Row[] = [
  { id: "1", nome: "Bruna", valor: 300 },
  { id: "2", nome: "Ana", valor: 100 },
  { id: "3", nome: "Caio", valor: 200 },
];

const COLUMNS: ColumnDef<Row, unknown>[] = [
  {
    accessorKey: "nome",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Nome" />,
    meta: { label: "Nome" },
  },
  {
    accessorKey: "valor",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Valor" />,
    meta: { label: "Valor", align: "right" },
  },
];

beforeEach(() => prefStore.clear());

function firstColumnTexts(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1) // pula o header
    .map((r) => r.querySelector("td")?.textContent ?? "");
}

describe("DataTable", () => {
  it("ordena por coluna com ciclo asc → desc → sem ordenação (aria-sort)", () => {
    render(<DataTable tableId="t1" columns={COLUMNS} data={DATA} />);
    const nomeBtn = screen.getByRole("button", { name: /ordenar por nome/i });

    fireEvent.click(nomeBtn);
    expect(firstColumnTexts()).toEqual(["Ana", "Bruna", "Caio"]);
    expect(screen.getAllByRole("columnheader")[0]).toHaveAttribute("aria-sort", "ascending");

    fireEvent.click(screen.getByRole("button", { name: /ordenado crescente/i }));
    expect(firstColumnTexts()).toEqual(["Caio", "Bruna", "Ana"]);
    expect(screen.getAllByRole("columnheader")[0]).toHaveAttribute("aria-sort", "descending");

    fireEvent.click(screen.getByRole("button", { name: /ordenado decrescente/i }));
    expect(firstColumnTexts()).toEqual(["Bruna", "Ana", "Caio"]); // ordem original
  });

  it("persiste o sort nas preferências da tabela", () => {
    render(<DataTable tableId="t2" columns={COLUMNS} data={DATA} />);
    fireEvent.click(screen.getByRole("button", { name: /ordenar por nome/i }));
    expect(prefStore.get("table:t2")).toMatchObject({ sort: { id: "nome", desc: false } });
  });

  it("mostra skeletons de célula no loading", () => {
    const { container } = render(
      <DataTable tableId="t3" columns={COLUMNS} data={[]} loading skeletonRows={3} />,
    );
    // 3 linhas × 2 colunas de skeleton
    expect(container.querySelectorAll("tbody tr").length).toBe(3);
  });

  it("estado vazio custom quando não há registros", () => {
    render(
      <DataTable tableId="t4" columns={COLUMNS} data={[]} empty={<span>Nada por aqui</span>} />,
    );
    expect(screen.getByText("Nada por aqui")).toBeInTheDocument();
  });

  it("seleção múltipla controlada por Set externo", () => {
    const onSelectedChange = vi.fn();
    render(
      <DataTable
        tableId="t5"
        columns={COLUMNS}
        data={DATA}
        enableSelection
        selected={new Set(["2"])}
        onSelectedChange={onSelectedChange}
      />,
    );
    const checks = screen.getAllByRole("checkbox", { name: /selecionar linha/i });
    expect(checks).toHaveLength(3);

    fireEvent.click(checks[0]);
    expect(onSelectedChange).toHaveBeenCalledWith(new Set(["2", "1"]));

    fireEvent.click(screen.getByRole("checkbox", { name: /selecionar todos/i }));
    expect(onSelectedChange).toHaveBeenLastCalledWith(new Set(["2", "1", "3"]));
  });

  it("onRowClick ignora cliques em controles internos", () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        tableId="t6"
        columns={COLUMNS}
        data={DATA}
        enableSelection
        selected={new Set()}
        onSelectedChange={() => {}}
        onRowClick={onRowClick}
      />,
    );
    // clique no checkbox NÃO abre a linha
    fireEvent.click(screen.getAllByRole("checkbox", { name: /selecionar linha/i })[0]);
    expect(onRowClick).not.toHaveBeenCalled();
    // clique na célula abre
    fireEvent.click(screen.getAllByText("Bruna")[0]);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("erro renderiza QueryErrorState com retry", () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        tableId="t7"
        columns={COLUMNS}
        data={[]}
        error={new Error("boom")}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("virtualiza listas longas (só o miolo visível entra no DOM)", () => {
    const big: Row[] = Array.from({ length: 500 }, (_, i) => ({
      id: String(i),
      nome: `Lead ${i}`,
      valor: i,
    }));
    const { container } = render(
      <DataTable tableId="t8" columns={COLUMNS} data={big} virtualizeOver={80} />,
    );
    // jsdom não tem layout: o virtualizador renderiza só o overscan inicial —
    // o que importa é NÃO renderizar as 500 linhas.
    const rendered = container.querySelectorAll("tbody tr").length;
    expect(rendered).toBeLessThan(120);
    expect(screen.getByText(/rolagem virtualizada/)).toBeInTheDocument();
  });
});
