// O hub /agendamentos no padrão Lançamento: um título só — o da aba aberta
// ("Agenda", o rótulo da sidebar, ou "Tarefas") — e, no celular, a linha de
// abas Agenda/Tarefas vem DEPOIS do título. "Novo agendamento" é a ação
// principal do cabeçalho da Agenda; o corretor vê também "Meu link" (o link de
// agendamento para o cliente). E o card do dia do hub /inicio (AgendaDoDiaCard)
// também liga pelo useLigarLead (decisão do dono, 12/10/2026).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const busca = vi.hoisted(() => ({ tab: undefined as "tarefas" | undefined }));
const navegar = vi.hoisted(() => vi.fn());
const ligar = vi.hoisted(() => vi.fn());
const dia = vi.hoisted(() => ({ itens: [] as unknown[], agora: new Date() }));
const papeis = vi.hoisted(() => ({ isCorretor: false }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useSearch: () => busca,
    useNavigate: () => navegar,
  }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/features/agenda/agenda-page", () => ({
  AgendaPage: () => <div data-testid="aba-agenda">grade</div>,
  NovoAgendamentoDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/agenda/link-agendamento-dialog", () => ({
  LinkAgendamentoDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/agenda/tarefas-page", () => ({
  TarefasPage: () => <div data-testid="aba-tarefas">lista</div>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
  useUserRoles: () => ({
    isAdmin: false,
    isGestor: false,
    isSuperintendente: false,
    isCorretor: papeis.isCorretor,
  }),
}));
vi.mock("@/hooks/use-ligar-lead", () => ({ useLigarLead: () => ({ ligar, discando: false }) }));
vi.mock("@/features/agenda/use-agenda-do-dia", async () => {
  const { classificarAgenda } = await import("@/features/agenda/agenda-do-dia");
  const mut = { mutate: vi.fn(), isPending: false, variables: undefined };
  return {
    useAgendaDoDia: () => ({
      query: { isLoading: false, isError: false, error: null, refetch: vi.fn() },
      agora: dia.agora,
      classificada: classificarAgenda(dia.itens as never[], dia.agora),
      escopo: { tipo: "minha", ids: ["u1"] },
      nomes: new Map(),
      escopoPronto: true,
      escopoErro: null,
      refetchEscopo: vi.fn(),
    }),
    useAcoesAgenda: () => ({ confirmar: mut, validar: mut, remarcar: mut }),
    useCriarAgendamento: () => mut,
  };
});

import { Route } from "@/routes/_authenticated/agendamentos";
import { AgendaDoDiaCard } from "@/features/agenda/agenda-do-dia-card";

const Hub = (Route as unknown as { options: { component: () => React.ReactElement } }).options
  .component;

const segue = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  busca.tab = undefined;
  papeis.isCorretor = false;
  navegar.mockClear();
  ligar.mockClear();
});
afterEach(() => cleanup());

describe("Hub Agenda & Tarefas", () => {
  it("Agenda: um título só, 'Novo agendamento' como única ação e as abas depois do título", () => {
    render(<Hub />);
    const titulo = screen.getByRole("heading", { level: 1 });
    expect(titulo).toHaveTextContent("Agenda");
    expect(screen.queryByText("Agendamentos")).toBeNull();
    expect(screen.getByText("Suas visitas e compromissos, e o que falta confirmar.")).toBeTruthy();
    const abas = screen.getByRole("tablist", { name: "Agenda e tarefas" });
    expect(segue(titulo, abas)).toBe(true);
    // Fora as abas e o conteúdo (stub), o único botão é o "Novo agendamento".
    const botoes = screen
      .getAllByRole("button")
      .filter((b) => !b.getAttribute("role")?.includes("tab"));
    expect(botoes.map((b) => b.textContent?.trim())).toEqual(["Novo agendamento"]);
    // "Modo Visita" saiu do cabeçalho (é link do cartão do dia).
    expect(screen.queryByText("Modo Visita")).toBeNull();
    expect(screen.getByTestId("aba-agenda")).toBeTruthy();
  });

  it("corretor: 'Meu link' (link de agendamento) antes do 'Novo agendamento'", () => {
    papeis.isCorretor = true;
    render(<Hub />);
    const botoes = screen
      .getAllByRole("button")
      .filter((b) => !b.getAttribute("role")?.includes("tab"));
    expect(botoes.map((b) => b.textContent?.trim())).toEqual(["Meu link", "Novo agendamento"]);
  });

  it("Tarefas: título 'Tarefas' antes das abas e sem ação no cabeçalho", () => {
    busca.tab = "tarefas";
    render(<Hub />);
    const titulo = screen.getByRole("heading", { level: 1 });
    expect(titulo).toHaveTextContent("Tarefas");
    expect(screen.getByText("O que você combinou fazer, na ordem do vencimento.")).toBeTruthy();
    expect(segue(titulo, screen.getByRole("tablist"))).toBe(true);
    expect(screen.queryByRole("button", { name: /Novo agendamento/ })).toBeNull();
    expect(screen.getByTestId("aba-tarefas")).toBeTruthy();
  });

  it("trocar de aba mantém o ?tab= de sempre", () => {
    render(<Hub />);
    const aba = within(screen.getByRole("tablist")).getByRole("tab", { name: "Tarefas" });
    fireEvent.mouseDown(aba, { button: 0 });
    expect(navegar).toHaveBeenCalledWith({ search: { tab: "tarefas" } });
  });
});

describe("AgendaDoDiaCard (hub /inicio)", () => {
  it("Ligar passa pelo useLigarLead, sem link tel:", () => {
    const agora = new Date(2026, 9, 12, 10, 0);
    dia.agora = agora;
    dia.itens = [
      {
        id: "a1",
        lead_id: "l1",
        corretor_id: "u1",
        tipo: "visita",
        status: "confirmado",
        titulo: "Visita",
        descricao: null,
        local: null,
        data_inicio: new Date(2026, 9, 12, 15, 0).toISOString(),
        data_fim: new Date(2026, 9, 12, 16, 0).toISOString(),
        lembrete_minutos: 30,
        lead: { id: "l1", nome: "Lilia Santos", telefone: "11977776666", projeto_nome: null },
      },
    ];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AgendaDoDiaCard />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ligar" }));
    expect(ligar).toHaveBeenCalledWith({ id: "l1", nome: "Lilia Santos", telefone: "11977776666" });
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
  });
});
