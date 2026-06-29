import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ComponentType } from "react";

// Armazém mutável de respostas do Supabase por tabela/RPC (preenchido por teste).
const store = vi.hoisted(() => ({
  results: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u1" }, session: {}, loading: false }),
}));

// Router: createFileRoute devolve as próprias opções + stubs; Link vira <a>.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({
    ...opts,
    useSearch: () => ({}),
    useNavigate: () => vi.fn(),
  }),
  Link: ({ children, to, ...rest }: { children?: unknown; to?: unknown }) =>
    createElement("a", { href: typeof to === "string" ? to : "#", ...rest }, children as never),
}));

// Aba Analytics não é exercida aqui.
vi.mock("@/features/dashboard/relatorios-view", () => ({ RelatoriosView: () => null }));

// Supabase encadeável: todo método retorna o builder; thenable resolve a resposta.
vi.mock("@/integrations/supabase/client", () => {
  const make = (table: string) => {
    const result = () => store.results[table] ?? { data: [], error: null };
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const m of ["select", "eq", "is", "not", "or", "in", "gte", "lte", "order", "limit"]) {
      builder[m] = chain;
    }
    builder.maybeSingle = () => Promise.resolve(result());
    builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(res, rej);
    return builder;
  };
  return {
    supabase: {
      from: (t: string) => make(t),
      rpc: (name: string) => Promise.resolve(store.results[name] ?? { data: [], error: null }),
    },
  };
});

import { Route } from "@/routes/_authenticated/hoje";

const Page = (Route as unknown as { component: ComponentType }).component;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <Page />
    </QueryClientProvider>,
  );
}

function quenteLead(id: string, nome: string) {
  return {
    id,
    nome,
    telefone: "11999990000",
    status: "em_atendimento",
    temperatura: "quente",
    ultima_interacao: "2026-06-29T10:00:00Z",
    proximo_followup: null,
    projeto_nome: "Proj",
  };
}

beforeEach(() => {
  store.results = {
    atividades_diarias: { data: [], error: null },
    metas_diarias: { data: null, error: null },
    conquistas: { data: [], error: null },
    tipos_conquista: { data: [], error: null },
    leads: { data: [], error: null },
    agendamentos: { data: [], error: null },
    tarefas: { data: [], error: null },
    leads_com_sla: { data: [], error: null },
  };
});

describe("Página Hoje (aba Ação)", () => {
  it("contador do card de leads quentes bate com a lista renderizada", async () => {
    store.results.leads = {
      data: [
        quenteLead("a", "Ana Quente"),
        quenteLead("b", "Bruno Hot"),
        quenteLead("c", "Caio Lead"),
      ],
      error: null,
    };
    renderPage();

    const titulo = await screen.findByText("Leads quentes");
    const card = titulo.closest(".border-rose-500\\/30") as HTMLElement;
    const scope = within(card);
    // 3 leads na lista...
    expect(await scope.findByText("Ana Quente")).toBeInTheDocument();
    expect(scope.getByText("Bruno Hot")).toBeInTheDocument();
    expect(scope.getByText("Caio Lead")).toBeInTheDocument();
    // ...e o badge mostra exatamente 3.
    expect(scope.getByText("3")).toBeInTheDocument();
  });

  it("erro numa query mostra 'Tentar novamente' e NÃO um zero/vazio falso", async () => {
    // RPC do SLA usado por um único card → cenário de erro isolado.
    store.results.leads_com_sla = { data: null, error: { message: "boom" } };
    renderPage();

    await screen.findByText("Leads quentes"); // página montou
    await waitFor(() => expect(screen.getByText(/tentar novamente/i)).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(screen.getByText(/não foi possível carregar/i)).toBeInTheDocument();
    // SLA falhou → nunca mostra o estado vazio "tudo dentro do prazo" (zero falso).
    expect(screen.queryByText(/tudo dentro do prazo/i)).not.toBeInTheDocument();
  });

  it("produtividade soma as atividades do período (VGV)", async () => {
    store.results.atividades_diarias = {
      data: [
        {
          dia: "2026-06-29",
          ligacoes: 3,
          whatsapps: 2,
          agendamentos: 1,
          visitas: 0,
          documentacoes: 0,
          vendas: 1,
          vgv_dia: 100000,
          pontuacao_total: 1200,
        },
      ],
      error: null,
    };
    renderPage();

    expect(await screen.findByText(/R\$\s*100\.000/)).toBeInTheDocument();
    expect(screen.getByText("1.200")).toBeInTheDocument(); // pontuação formatada pt-BR
  });

  it("alternar o período marca o botão selecionado (aria-pressed)", async () => {
    renderPage();
    const semana = await screen.findByRole("button", { name: "Semana" });
    const hoje = screen.getByRole("button", { name: "Hoje" });
    expect(hoje).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(semana);
    await waitFor(() => expect(semana).toHaveAttribute("aria-pressed", "true"));
    expect(hoje).toHaveAttribute("aria-pressed", "false");
  });
});
