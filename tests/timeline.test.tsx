import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Phone } from "lucide-react";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";

function iso(daysAgo: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 30, 0, 0);
  return d.toISOString();
}

const ITEMS: TimelineItem[] = [
  { id: "1", icon: Phone, title: "Ligação atendida", timestamp: iso(0) },
  { id: "2", icon: Phone, title: "WhatsApp enviado", timestamp: iso(0, 8) },
  { id: "3", icon: Phone, title: "Primeiro contato", timestamp: iso(1) },
  { id: "4", icon: Phone, title: "Lead criado", timestamp: iso(10) },
];

describe("Timeline", () => {
  it("agrupa por dia com cabeçalhos Hoje/Ontem/data", () => {
    render(<Timeline items={ITEMS} />);
    expect(screen.getByText("Hoje")).toBeInTheDocument();
    expect(screen.getByText("Ontem")).toBeInTheDocument();
    // itens de hoje ficam no mesmo grupo
    const listas = screen.getAllByRole("list");
    expect(listas).toHaveLength(3);
  });

  it("preserva semântica de lista ordenada (ol/li)", () => {
    const { container } = render(<Timeline items={ITEMS} groupByDay={false} />);
    expect(container.querySelectorAll("ol")).toHaveLength(1);
    expect(container.querySelectorAll("li")).toHaveLength(4);
  });

  it("estado vazio orientado", () => {
    render(<Timeline items={[]} empty={<span>Registre o primeiro contato</span>} />);
    expect(screen.getByText("Registre o primeiro contato")).toBeInTheDocument();
  });

  it("loading anuncia aria-busy", () => {
    const { container } = render(<Timeline items={[]} loading />);
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
  });
});
