// O diálogo do check-in em modo VOLUNTÁRIO (pedido do dono, 13/10/2026): o
// bloco da barra lateral e a faixa do topo pedem (pedirCheckin) e o diálogo
// abre em qualquer tela para trocar ou refazer o check-in. Aqui se trava que
// ele nunca prende (ESC/X fecham), não fecha sozinho ao ver o check-in que ele
// mesmo veio trocar, nunca rebaixa um check-in que valeu sem o corretor ver,
// avisa quando a troca substitui a gestão, respeita o treino do onboarding
// (AGENTS.md: nada abre por cima dele), vence em 15 s e vira obrigatório se o
// dia virar com ele aberto.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const estado = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  pathname: "/fila",
  papeis: { isCorretor: true, isGestor: false, loading: false },
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  capture: vi.fn(),
}));

/** Uma consulta encadeável (select/order/eq) que resolve com `linhas`. */
function consulta(linhas: unknown[]) {
  const q = {
    select: () => q,
    order: () => q,
    eq: () => q,
    then: (ok: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: linhas, error: null }).then(ok),
  };
  return q;
}

vi.mock("sonner", () => ({ toast: estado.toast }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: estado.pathname } }),
  useLocation: () => ({ pathname: estado.pathname }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "c1" }, session: null, loading: false }),
  useUserRoles: () => estado.papeis,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: estado.rpc, from: () => consulta([]) },
}));
vi.mock("@/integrations/supabase/pendentes", () => ({
  supabasePendente: { rpc: estado.rpc, from: estado.from },
}));
vi.mock("@/lib/error-tracking-browser", () => ({ captureClientError: estado.capture }));

import { CheckinObrigatorioGlobal } from "@/features/presenca/checkin-obrigatorio-global";
import {
  _reiniciarPedidoCheckin,
  pedirCheckin,
  pedirCheckinNoToque,
  usePedidoCheckin,
} from "@/features/presenca/use-checkin-obrigatorio";
import { publicarEstadoTreino } from "@/features/onboarding/treino-estado";

const HOJE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const TABELA = [
  {
    id: "f1",
    slug: "barra-funda",
    nome: "Barra Funda",
    endereco: null,
    latitude: -23.520116,
    longitude: -46.676975,
    raio_metros: 300,
    ativa: true,
    ordem: 1,
  },
  {
    id: "f2",
    slug: "liberdade",
    nome: "Liberdade",
    endereco: null,
    latitude: -23.56125,
    longitude: -46.638897,
    raio_metros: 300,
    ativa: true,
    ordem: 2,
  },
  {
    id: "f3",
    slug: "belem",
    nome: "Belém",
    endereco: null,
    latitude: -23.544943,
    longitude: -46.585915,
    raio_metros: 300,
    ativa: true,
    ordem: 3,
  },
];
const FILIAIS = TABELA.map((f) => ({
  slug: f.slug,
  nome: f.nome,
  endereco: null,
  tem_coordenadas: true,
  raio_metros: 300,
}));

type Checkin = Record<string, unknown> | null;

function minha(c: Checkin = null, over: Record<string, unknown> = {}) {
  return {
    dia: HOJE,
    presente: !!c && c.apto_roleta === true && !c.encerrado_em,
    mes_referencia: "2026-09-01",
    vendas_mes_anterior: 2,
    vendas_minimas: 3,
    casa_liberada: false,
    exige_localizacao: true,
    checkin: c,
    filiais: FILIAIS,
    ...over,
  };
}

/** Check-in na Barra Funda às 09:00 (12:00Z), valendo. */
function checkin(over: Record<string, unknown> = {}) {
  return {
    id: "k1",
    modo: "loja",
    filial_slug: "barra-funda",
    filial_nome: "Barra Funda",
    apto_roleta: true,
    motivo: null,
    localizacao: "confirmada",
    distancia_m: 126,
    precisao_m: 90,
    origem: "corretor",
    criado_em: `${HOJE}T12:00:00Z`,
    encerrado_em: null,
    ...over,
  };
}
const confirmadoPelaGestao = (over: Record<string, unknown> = {}) =>
  checkin({ id: "k9", origem: "gestao", localizacao: "confirmada_gestao", ...over });

const banco = {
  atual: minha() as ReturnType<typeof minha>,
  resposta: (_args: Record<string, unknown>) => minha(checkin()) as ReturnType<typeof minha>,
  falharCheckin: false,
};

const CORRETOR_TESTE = { latitude: -23.518983, longitude: -46.676975, accuracy: 90 };

beforeEach(() => {
  estado.pathname = "/fila";
  estado.papeis = { isCorretor: true, isGestor: false, loading: false };
  banco.atual = minha(checkin());
  banco.resposta = (args) =>
    minha(
      checkin({
        id: `k-${String(args._filial ?? args._modo)}`,
        modo: args._modo,
        filial_slug: args._filial ?? null,
        filial_nome: TABELA.find((f) => f.slug === args._filial)?.nome ?? null,
      }),
    );
  banco.falharCheckin = false;
  estado.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "presenca_minha_v1") return { data: banco.atual, error: null };
    if (fn === "presenca_checkin") {
      if (banco.falharCheckin) return { data: null, error: { message: "Failed to fetch" } };
      const r = banco.resposta(args);
      banco.atual = r;
      return { data: { ...r, filiais: [] }, error: null };
    }
    return { data: null, error: null };
  });
  estado.from.mockImplementation(() => consulta(TABELA));
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((ok: PositionCallback) =>
        ok({ coords: CORRETOR_TESTE } as GeolocationPosition),
      ),
    },
  });
  publicarEstadoTreino({ decidido: true, aberto: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  estado.rpc.mockReset();
  estado.from.mockReset();
  estado.capture.mockReset();
  for (const f of Object.values(estado.toast)) f.mockReset();
  localStorage.clear();
  publicarEstadoTreino({ decidido: false, aberto: false });
  _reiniciarPedidoCheckin();
});

/** O pedido em aberto (para conferir que foi consumido ou descartado). */
function Pedido() {
  const p = usePedidoCheckin();
  return <span data-testid="pedido">{p ? p.acao : "nenhum"}</span>;
}

function montar() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <CheckinObrigatorioGlobal />
      <Pedido />
    </QueryClientProvider>,
  );
}

const dialogo = () => screen.queryByTestId("checkin-obrigatorio-dialog");
const leituraFeita = () =>
  waitFor(() =>
    expect(estado.rpc.mock.calls.some(([fn]) => fn === "presenca_minha_v1")).toBe(true),
  );
const chamadasCheckin = () =>
  estado.rpc.mock.calls
    .filter(([fn]) => fn === "presenca_checkin")
    .map(([, a]) => a as Record<string, unknown>);
const opcao = (nome: string) => screen.getByRole("button", { name: new RegExp(`^${nome}`) });
const pedir = () => act(() => pedirCheckin({ acao: "abrir", origem: "lateral" }));
const espera = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function voltarParaAJanela() {
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
}

describe("o diálogo voluntário (Trocar, Fazer check-in)", () => {
  it("Trocar com o check-in valendo: abre fechável, diz onde ele está agora; a releitura do mesmo check-in não fecha; ESC fecha", async () => {
    montar();
    await leituraFeita();
    await espera();
    expect(dialogo()).toBeNull();
    pedir();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    expect(d).toHaveAttribute("data-modo", "voluntario");
    expect(
      within(d).getByText(
        "Agora: Barra Funda · 09:00 — nas roletas. Para trocar, escolha onde você está.",
      ),
    ).toBeInTheDocument();
    // Fechável: o X aparece.
    expect(d.className).not.toContain("[&>button.absolute]:hidden");
    expect(within(d).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByTestId("pedido")).toHaveTextContent("nenhum");
    // A releitura (o mesmo check-in) não fecha: ele veio justamente trocar.
    voltarParaAJanela();
    await espera();
    expect(dialogo()).toBeInTheDocument();
    expect(estado.toast.success).not.toHaveBeenCalled();
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()).toEqual([]);
  });

  it("tocar a filial atual só avisa e fecha; tocar outra (vendo a que vale) pergunta e segue; se a gestão confirmou outro no meio, fecha com o verde sem RPC", async () => {
    montar();
    await leituraFeita();
    pedir();
    await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(opcao("Barra Funda"));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(estado.toast.info).toHaveBeenCalledWith("Você já está na roleta hoje: Barra Funda.");
    expect(chamadasCheckin()).toEqual([]);

    // Outra filial, vendo a que vale: a troca é de propósito e segue.
    pedir();
    await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(opcao("Liberdade"));
    fireEvent.click(await screen.findByRole("button", { name: "Estou na loja" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()).toEqual([expect.objectContaining({ _filial: "liberdade" })]);

    // A gestão confirmou outro check-in enquanto ele decidia: não rebaixa.
    banco.atual = minha(
      checkin({ id: "k-liberdade", filial_slug: "liberdade", filial_nome: "Liberdade" }),
    );
    estado.rpc.mockClear();
    pedir();
    await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(opcao("Belém"));
    await screen.findByRole("button", { name: "Estou na loja" });
    banco.atual = minha(confirmadoPelaGestao());
    const gps = vi.mocked(navigator.geolocation.getCurrentPosition);
    gps.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Estou na loja" }));
    // A leitura sai no toque (o pedido de permissão vem do gesto)...
    expect(gps).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Plantão confirmado pela gestão: Barra Funda. Você está na roleta hoje.",
    );
    // ...e é descartada: nenhuma RPC, nenhuma segunda leitura.
    expect(chamadasCheckin()).toEqual([]);
    expect(gps).toHaveBeenCalledTimes(1);
  });

  it("plantão confirmado pela gestão: a caixa avisa que a troca substitui; o aviso de uma filial longe diz que encerra a confirmação", async () => {
    banco.atual = minha(confirmadoPelaGestao());
    montar();
    await leituraFeita();
    pedir();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    expect(within(d).getByTestId("checkin-aviso-troca")).toHaveTextContent(
      "Seu plantão na Barra Funda foi confirmado pela gestão. Um check-in novo substitui essa confirmação.",
    );
    expect(
      within(d).getByText(
        "Agora: Barra Funda · 09:00 — nas roletas · confirmado pela gestão. Para trocar, escolha onde você está.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(d).getByRole("button", { name: "Incluir minha localização" }));
    await waitFor(() =>
      expect(within(opcao("Barra Funda")).getByText("Você está aqui")).toBeInTheDocument(),
    );
    fireEvent.click(opcao("Liberdade"));
    expect(
      await screen.findByText(
        "Isso também encerra o plantão na Barra Funda confirmado pela gestão.",
      ),
    ).toBeInTheDocument();
    expect(chamadasCheckin()).toEqual([]);
  });

  it("/modo-visita sem check-in: o pedido abre o voluntário e o X fecha; em /presenca o diálogo não abre (o card atende)", async () => {
    banco.atual = minha();
    estado.pathname = "/modo-visita";
    const r = montar();
    await leituraFeita();
    await espera();
    expect(dialogo()).toBeNull();
    pedir();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    expect(within(d).getByText("Diga onde você está para entrar nas roletas.")).toBeInTheDocument();
    fireEvent.click(within(d).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    r.unmount();

    estado.pathname = "/presenca";
    montar();
    await leituraFeita();
    pedir();
    await espera();
    expect(dialogo()).toBeNull();
    // O pedido fica para o card.
    expect(screen.getByTestId("pedido")).toHaveTextContent("abrir");
  });

  it("o treino na tela descarta o pedido; o treino ainda não decidido faz esperar; pedido velho (> 15 s) é descartado; pedido feito antes de montar abre ao montar", async () => {
    // Treino na tela: descartado (e não abre depois que o treino fecha).
    publicarEstadoTreino({ decidido: true, aberto: true });
    let r = montar();
    await leituraFeita();
    pedir();
    await waitFor(() => expect(screen.getByTestId("pedido")).toHaveTextContent("nenhum"));
    act(() => publicarEstadoTreino({ decidido: true, aberto: false }));
    await espera();
    expect(dialogo()).toBeNull();
    r.unmount();

    // Treino ainda não decidido: espera, e abre quando decide.
    publicarEstadoTreino({ decidido: false, aberto: false });
    r = montar();
    await leituraFeita();
    pedir();
    await espera();
    expect(dialogo()).toBeNull();
    expect(screen.getByTestId("pedido")).toHaveTextContent("abrir");
    act(() => publicarEstadoTreino({ decidido: true, aberto: false }));
    expect(await screen.findByTestId("checkin-obrigatorio-dialog")).toBeInTheDocument();
    r.unmount();
    _reiniciarPedidoCheckin();

    // Pedido de mais de 15 s atrás: descartado.
    pedirCheckin({ acao: "abrir", origem: "faixa" });
    const depois = Date.now() + 16_000;
    vi.spyOn(Date, "now").mockReturnValue(depois);
    r = montar();
    await leituraFeita();
    await waitFor(() => expect(screen.getByTestId("pedido")).toHaveTextContent("nenhum"));
    expect(dialogo()).toBeNull();
    r.unmount();
    vi.restoreAllMocks();

    // Pedido feito antes de o diálogo montar (o chunk ainda carregando): abre ao montar.
    pedirCheckin({ acao: "abrir", origem: "lateral" });
    montar();
    expect(await screen.findByTestId("checkin-obrigatorio-dialog")).toHaveAttribute(
      "data-modo",
      "voluntario",
    );
  });

  it("a virada do dia com o voluntário aberto: vira obrigatório — o X some, a descrição obrigatória, as telas zeradas", async () => {
    montar();
    await leituraFeita();
    pedir();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    // Uma tela no meio do caminho: a pergunta da Liberdade.
    fireEvent.click(opcao("Liberdade"));
    await screen.findByRole("heading", { name: "Você está dentro da loja Liberdade agora?" });
    // Meia-noite: o check-in de hoje passa a faltar (a releitura traz o dia novo).
    banco.atual = minha();
    voltarParaAJanela();
    expect(
      await screen.findByText("Para usar o CRM hoje, diga onde você está."),
    ).toBeInTheDocument();
    const agora = screen.getByTestId("checkin-obrigatorio-dialog");
    expect(agora).toHaveAttribute("data-modo", "obrigatorio");
    expect(agora.className).toContain("[&>button.absolute]:hidden");
    expect(screen.queryByRole("heading", { name: /Você está dentro da loja/ })).toBeNull();
    // Agora prende: ESC não fecha.
    fireEvent.keyDown(agora, { key: "Escape" });
    await espera();
    expect(dialogo()).toBeInTheDocument();
    expect(d).toBeTruthy();
  });

  it("pedido 'incluir-localizacao' (faixa, bloco) no barrado sem localização: abre no barrado e refaz na mesma filial com a leitura; 'abrir' no barrado fora abre no barrado, fechável; já valendo → só avisa", async () => {
    const semGps = checkin({
      id: "ks",
      apto_roleta: false,
      motivo: "sem_localizacao",
      localizacao: "sem_localizacao",
      distancia_m: null,
      precisao_m: null,
    });
    banco.atual = minha(semGps);
    let r = montar();
    await leituraFeita();
    const gps = vi.mocked(navigator.geolocation.getCurrentPosition);
    // Como a faixa e o bloco pedem: o GPS lido no toque, dentro do clique.
    act(() => {
      pedirCheckinNoToque("incluir-localizacao", "faixa", "/fila");
      expect(gps).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()).toEqual([
      expect.objectContaining({
        _filial: "barra-funda",
        _latitude: -23.518983,
        _longitude: -46.676975,
        _precisao_m: 90,
      }),
    ]);
    // O diálogo refez com a leitura do toque (nenhuma segunda leitura).
    expect(gps).toHaveBeenCalledTimes(1);
    expect((gps.mock.calls[0][2] as PositionOptions).maximumAge).toBe(0);
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Check-in feito: Barra Funda. Você está na roleta hoje.",
      { description: undefined },
    );
    r.unmount();

    // "Refazer check-in" (abrir) no barrado fora: abre no barrado, e fecha com ESC.
    estado.rpc.mockClear();
    banco.atual = minha(
      checkin({
        id: "kb",
        apto_roleta: false,
        motivo: "fora_da_filial",
        localizacao: "fora_do_raio",
        distancia_m: 6096,
      }),
    );
    r = montar();
    await leituraFeita();
    pedir();
    expect(await screen.findByTestId("checkin-barrado-motivo")).toHaveTextContent(
      "A localização deste aparelho ficou a 6,1 km da filial Barra Funda.",
    );
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId("checkin-obrigatorio-dialog"), { key: "Escape" });
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()).toEqual([]);
    r.unmount();

    // A gestão já confirmou: "Incluir localização" só avisa, não abre.
    estado.rpc.mockClear();
    banco.atual = minha(confirmadoPelaGestao());
    gps.mockClear();
    montar();
    await leituraFeita();
    act(() => pedirCheckinNoToque("incluir-localizacao", "lateral", "/fila"));
    await waitFor(() =>
      expect(estado.toast.info).toHaveBeenCalledWith(
        "Você já está na roleta hoje: Barra Funda (plantão confirmado pela gestão).",
      ),
    );
    await espera();
    expect(dialogo()).toBeNull();
    // A leitura do toque foi descartada: nada gravado.
    expect(gps).toHaveBeenCalledTimes(1);
    expect(chamadasCheckin()).toEqual([]);
  });

  it("erro técnico no voluntário: 'tente de novo ou feche esta janela', sem 'Continuar sem check-in'", async () => {
    banco.falharCheckin = true;
    montar();
    await leituraFeita();
    pedir();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(within(d).getByRole("button", { name: /^Em casa/ }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(
      "Não foi possível registrar o check-in (Failed to fetch). Tente de novo ou feche esta janela.",
    );
    expect(within(alerta).queryByRole("button", { name: "Continuar sem check-in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continuar sem check-in" })).toBeNull();
  });

  it("o voluntário tem uma saída visível, 'Fechar' (o X do canto é pequeno); o obrigatório não", async () => {
    montar();
    await leituraFeita();
    pedir();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(within(d).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()).toEqual([]);
    cleanup();

    // Obrigatório (sem check-in hoje): prende, sem "Fechar".
    banco.atual = minha();
    montar();
    const o = await screen.findByTestId("checkin-obrigatorio-dialog");
    expect(o).toHaveAttribute("data-modo", "obrigatorio");
    expect(within(o).queryByRole("button", { name: "Fechar" })).toBeNull();
  });

  it("'Em casa' abaixo do mínimo no voluntário: o motivo, sem 'Você já pode usar o CRM' (o CRM nunca esteve preso); no obrigatório, a frase continua", async () => {
    montar();
    await leituraFeita();
    pedir();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    banco.resposta = () =>
      minha(
        checkin({
          id: "kc",
          modo: "casa",
          filial_slug: null,
          filial_nome: null,
          apto_roleta: false,
          motivo: "casa_abaixo_minimo_vendas",
          localizacao: null,
        }),
      );
    fireEvent.click(within(d).getByRole("button", { name: /^Em casa/ }));
    expect(await screen.findByTestId("checkin-recusado-motivo")).toBeInTheDocument();
    expect(screen.queryByText(/Você já pode usar o CRM/)).toBeNull();
    cleanup();

    banco.atual = minha();
    montar();
    const o = await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(within(o).getByRole("button", { name: /^Em casa/ }));
    expect(await screen.findByTestId("checkin-recusado-motivo")).toBeInTheDocument();
    expect(
      screen.getByText("Você já pode usar o CRM: o check-in de hoje está feito."),
    ).toBeInTheDocument();
  });
});
