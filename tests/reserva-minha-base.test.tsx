// Minha base no padrão Lançamento (Fase 1 das demais páginas, 12/10/2026).
//
// O que a tela decide com o que o banco devolve — a regra do resgate continua
// em `carteira_resgatar`:
//   - o placar é o mesmo anel da Central (X de 65 em atendimento), e "vagas
//     livres" é a conta da carteira ativa, a mesma do botão "Trazer";
//   - porta fechada desde 28/09 (status do lote diz `portas_legadas: false`)
//     vira UM aviso acima da lista, sem 50 botões que falham no clique; banco
//     que não manda a chave mantém os botões (o banco responde no clique);
//   - sem vaga livre, o mesmo: um aviso, nenhum botão cinza;
//   - os chips por motivo filtram a lista;
//   - a gestão vendo a base de um corretor lê "Vendo a base de <nome>", sem
//     botão de resgate.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LinhaCarteira, LinhaReserva } from "@/features/carteira-ativa/derive";

const estado = vi.hoisted(() => ({
  ativa: [] as unknown[],
  reserva: [] as unknown[] | null,
  contador: undefined as unknown,
  status: undefined as unknown,
  roles: {
    isAdmin: false,
    isGestor: false,
    isSuperintendente: false,
    isCorretor: true,
  },
  resgatar: vi.fn(),
  fetchStatus: vi.fn(),
}));

vi.mock("@/features/carteira-ativa/use-carteira", () => ({
  TETO_PADRAO: 65,
  CAP_RESGATE_PADRAO: 13,
  useCarteiraConfig: () => ({ data: { teto: 65 } }),
  useCarteiraAtiva: () => ({ data: estado.ativa }),
  useCarteiraFormacao: () => ({ data: { em_formacao: 4 } }),
  useCarteiraReserva: () => ({
    data: estado.reserva,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useResgate: () => ({ resgatar: { mutate: estado.resgatar, isPending: false } }),
}));
vi.mock("@/features/em-atendimento/use-em-atendimento", () => ({
  useEmAtendimentoContador: () => ({ data: estado.contador }),
}));
vi.mock("@/features/prospeccao/lote-client", async (original) => ({
  ...(await original<typeof import("@/features/prospeccao/lote-client")>()),
  fetchStatusLote: estado.fetchStatus,
}));
vi.mock("@/hooks/use-nome-do-corretor", () => ({
  useNomeDoCorretor: (id?: string) => ({ data: id ? "Ana Souza" : undefined }),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "00000009-0000-4000-8000-000000000000" } }),
  useUserRoles: () => estado.roles,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search: _search,
    params: _params,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    search?: unknown;
    params?: unknown;
  } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import { ReservaPage } from "@/features/carteira-ativa/reserva-page";

function linhaAtiva(i: number): LinhaCarteira {
  return {
    lead_id: `a-${i}`,
    nome: `Ativo ${i}`,
    telefone: null,
    status: "em_atendimento",
    temperatura: null,
    projeto_nome: null,
    created_at: "2026-10-01T12:00:00Z",
    movimento: "2026-10-10T12:00:00Z",
    dias_parado: 1,
    proximo_followup: null,
    valor: null,
    faixa: "conversa",
    posicao: i,
  };
}

function linhaReserva(id: string, nome: string, motivo: string, total: number): LinhaReserva {
  return {
    lead_id: id,
    nome,
    telefone: "(11) 98888-0000",
    status: "aguardando_retorno",
    temperatura: null,
    projeto_nome: "Vila Nova",
    created_at: "2026-09-01T12:00:00Z",
    movimento: "2026-09-20T12:00:00Z",
    dias_parado: 22,
    valor: null,
    motivo,
    total,
  };
}

const RESERVA = [
  linhaReserva("r1", "Bruno Lima", "Sem próximo passo há 9 dias", 3),
  linhaReserva("r2", "Carla Dias", "Sem movimento há 22 dias", 3),
  linhaReserva("r3", "Diego Rocha", "Sem movimento há 30 dias", 3),
];

const CONTADOR = {
  corretor_id: "00000009-0000-4000-8000-000000000000",
  corretor: true,
  modo: "ativo",
  em_atendimento: 60,
  teto: 65,
  trava_roleta: 60,
  lotado: false,
  escolhidos: 0,
  minha_base: 212,
  teto_base: 400,
  retorno_max_dias: 30,
  dias_sem_toque: 5,
};

function montar(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function preparar({
  ativas = 60,
  portas,
}: {
  ativas?: number;
  portas?: boolean;
} = {}) {
  estado.ativa = Array.from({ length: ativas }, (_, i) => linhaAtiva(i + 1));
  estado.reserva = RESERVA;
  estado.contador = CONTADOR;
  estado.fetchStatus.mockResolvedValue({
    lote_id: null,
    zona: null,
    criado_em: null,
    entregues: 0,
    em_cadencia: 0,
    ficaram: 0,
    sairam: 0,
    vagas: 5,
    teto: 65,
    pode_pedir: true,
    motivo: null,
    ...(portas === undefined ? {} : { portas_legadas: portas }),
  });
}

afterEach(() => {
  cleanup();
  estado.resgatar.mockReset();
  estado.fetchStatus.mockReset();
  estado.roles = { isAdmin: false, isGestor: false, isSuperintendente: false, isCorretor: true };
});

describe("Minha base — placar", () => {
  it("mostra o mesmo anel da Central e as vagas da carteira ativa", async () => {
    preparar({ ativas: 60, portas: true });
    montar(<ReservaPage />);
    const placar = screen.getByTestId("reserva-placar");
    expect(within(placar).getByRole("img", { name: "60 de 65 em atendimento" })).toBeTruthy();
    expect(within(placar).getByText("vagas livres").previousSibling?.textContent).toBe("5");
    expect(within(placar).getByText("na Minha base").previousSibling?.textContent).toBe("212");
    expect(within(placar).getByText("em formação (cadência)").previousSibling?.textContent).toBe(
      "4",
    );
    // A frase longa do placar saiu do cabeçalho.
    expect(screen.queryByText(/vagas ocupadas/i)).toBeNull();
  });
});

describe("Minha base — resgate", () => {
  it("porta fechada (portas_legadas false): um aviso só, nenhum botão Trazer", async () => {
    preparar({ portas: false });
    montar(<ReservaPage />);
    const aviso = await screen.findByTestId("reserva-sem-resgate");
    expect(aviso.textContent).toContain("fechado desde 28/09");
    expect(within(aviso).getByRole("link", { name: "Prospecção" }).getAttribute("href")).toBe(
      "/prospeccao",
    );
    expect(screen.queryAllByRole("button", { name: /Trazer/ })).toHaveLength(0);
    expect(screen.getAllByTestId("reserva-sem-resgate")).toHaveLength(1);
  });

  it("porta aberta e com vaga: cada linha tem Trazer e o clique chama o banco", async () => {
    preparar({ portas: true });
    montar(<ReservaPage />);
    const botoes = await screen.findAllByRole("button", { name: /Trazer/ });
    expect(botoes).toHaveLength(3);
    expect(screen.queryByTestId("reserva-sem-resgate")).toBeNull();
    fireEvent.click(botoes[0]);
    expect(estado.resgatar).toHaveBeenCalledWith("r1", expect.anything());
  });

  it("enquanto o status do lote chega, nenhum botão pisca na tela", () => {
    preparar({ portas: false });
    estado.fetchStatus.mockReturnValue(new Promise(() => {}));
    montar(<ReservaPage />);
    expect(screen.getAllByTestId("reserva-lista")).toHaveLength(1);
    expect(screen.queryAllByRole("button", { name: /Trazer/ })).toHaveLength(0);
  });

  it("banco antigo (sem a chave): mantém os botões — o banco responde no clique", async () => {
    preparar({ portas: undefined });
    montar(<ReservaPage />);
    expect(await screen.findAllByRole("button", { name: /Trazer/ })).toHaveLength(3);
    expect(screen.queryByTestId("reserva-sem-resgate")).toBeNull();
  });

  it("sem vaga livre: um aviso só, em vez de botões cinza", async () => {
    preparar({ ativas: 65, portas: true });
    montar(<ReservaPage />);
    expect((await screen.findByTestId("reserva-sem-resgate")).textContent).toContain(
      "Sem vaga livre",
    );
    await waitFor(() => expect(estado.fetchStatus).toHaveBeenCalled());
    expect(screen.queryAllByRole("button", { name: /Trazer/ })).toHaveLength(0);
  });
});

describe("Minha base — motivos", () => {
  it("os chips por motivo filtram a lista e 'Todos' volta", () => {
    preparar({ portas: true });
    montar(<ReservaPage />);
    const motivos = screen.getByTestId("reserva-motivos");
    const lista = () => screen.getByTestId("reserva-lista");
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(3);

    const parados = within(motivos).getByRole("button", { name: /Parados/ });
    expect(parados.textContent).toContain("2");
    fireEvent.click(parados);
    expect(parados.getAttribute("aria-pressed")).toBe("true");
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(2);
    expect(within(lista()).queryByText("Bruno Lima")).toBeNull();

    fireEvent.click(within(motivos).getByRole("button", { name: "Todos" }));
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("Minha base — gestão vendo um corretor", () => {
  it("diz de quem é a base, volta para a própria e não oferece resgate", () => {
    estado.roles = { isAdmin: false, isGestor: true, isSuperintendente: false, isCorretor: false };
    preparar({ portas: false });
    montar(<ReservaPage corretorId="00000007-0000-4000-8000-000000000000" />);
    const faixa = screen.getByTestId("reserva-de-outro");
    expect(faixa.textContent).toContain("Vendo a base de Ana Souza");
    expect(within(faixa).getByRole("link").getAttribute("href")).toBe("/reserva");
    expect(screen.queryAllByRole("button", { name: /Trazer/ })).toHaveLength(0);
    // Status do lote é do corretor logado — a gestão não lê.
    expect(estado.fetchStatus).not.toHaveBeenCalled();
    expect(screen.queryByTestId("reserva-sem-resgate")).toBeNull();
  });
});
