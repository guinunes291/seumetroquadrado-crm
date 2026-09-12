// A coluna lateral do desktop: a agenda de hoje com o estado de cada visita,
// os números da semana e o fluxo pré-venda → fila → desfecho.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const agenda = vi.hoisted(() => ({
  query: { isPending: false, isError: false, data: [] as unknown[] },
  classificada: { pendentes: [] as unknown[], hoje: [] as unknown[], amanha: [] as unknown[] },
  agora: new Date("2026-09-12T08:04:00-03:00"),
  escopoPronto: true,
}));
vi.mock("@/features/agenda/use-agenda-do-dia", () => ({ useAgendaDoDia: () => agenda }));
const semana = vi.hoisted(() => ({
  isPending: false,
  isError: false,
  data: { desfechos: 14, perdidos: 5, reentraram: 2 },
}));
vi.mock("@/features/fila-unica/use-fila-semana", () => ({ useFilaSemana: () => semana }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { FilaLateral } from "@/features/fila-unica/fila-lateral";

const visita = (id: string, hora: string, status: string, nome: string, projeto: string) => ({
  id,
  lead_id: `l-${id}`,
  corretor_id: "c1",
  tipo: "visita",
  status,
  titulo: `Visita · ${nome}`,
  descricao: null,
  local: null,
  data_inicio: `2026-09-12T${hora}:00-03:00`,
  data_fim: `2026-09-12T${hora}:00-03:00`,
  lembrete_minutos: null,
  lead: { id: `l-${id}`, nome, telefone: null, projeto_nome: projeto },
});

afterEach(() => {
  cleanup();
  agenda.classificada.hoje = [];
});

describe("FilaLateral", () => {
  it("agenda de hoje: hora, lead, projeto e o estado (confirmada / sem confirmação)", () => {
    agenda.classificada.hoje = [
      visita("1", "09:30", "confirmado", "Maisa L.", "Liber Jaçanã"),
      visita("2", "15:00", "agendado", "Marcia R.", "Novvo Santa Marina"),
    ];
    render(<FilaLateral />);
    const itens = screen.getAllByTestId("agenda-hoje-item");
    expect(itens).toHaveLength(2);
    // A hora sai no fuso do navegador (o mesmo que a Agenda usa).
    const nove30 = new Date("2026-09-12T09:30:00-03:00").toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(itens[0]).toHaveTextContent(nove30);
    expect(itens[0]).toHaveTextContent("Maisa L.");
    expect(itens[0]).toHaveTextContent("Liber Jaçanã");
    expect(itens[0]).toHaveTextContent("confirmada");
    expect(itens[1]).toHaveTextContent("sem confirmação");
    expect(screen.getByText("2 visitas")).toBeInTheDocument();
  });

  it("sem compromissos, diz isso; a semana mostra os três números e o fluxo com o teto", () => {
    render(<FilaLateral />);
    expect(screen.getByText("Sem compromissos hoje.")).toBeInTheDocument();
    const s = screen.getByTestId("fila-semana");
    expect(s).toHaveTextContent(/14 desfecho/);
    expect(s).toHaveTextContent(/5 perdido/);
    expect(s).toHaveTextContent(/2 reentraram/);
    expect(screen.getByText("Fila (máx. 40)")).toBeInTheDocument();
    expect(screen.getByText("O que a Sami faz aqui")).toBeInTheDocument();
  });
});
