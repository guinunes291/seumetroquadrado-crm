// "Incluir minha localização" (pedido do dono, 13/10/2026) — no diálogo do
// check-in e no card de /presenca. A regra é do banco; aqui se trava a TELA:
// a leitura só no toque (nada ao abrir), a prévia das distâncias com
// "Você está aqui", o check-in direto com a MESMA leitura (o GPS lido uma vez
// só), o aviso antes do barrado (sem RPC), o resgate "você está na filial X",
// a leitura que vence, o "Incluir localização" do barrado que não grava nada
// quando falha, e o diagnóstico separado no Sentry.
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

/** Uma consulta encadeável (select/order/eq) que resolve com `r()`. */
function consulta(r: () => { data: unknown; error: unknown }) {
  const q = {
    select: () => q,
    order: () => q,
    eq: () => q,
    then: (
      ok: (v: { data: unknown; error: unknown }) => unknown,
      falhou?: (e: unknown) => unknown,
    ) => Promise.resolve(r()).then(ok, falhou),
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
  supabase: { rpc: estado.rpc, from: () => consulta(() => ({ data: [], error: null })) },
}));
vi.mock("@/integrations/supabase/pendentes", () => ({
  supabasePendente: { rpc: estado.rpc, from: estado.from },
}));
vi.mock("@/lib/error-tracking-browser", () => ({ captureClientError: estado.capture }));

import { CheckinObrigatorioGlobal } from "@/features/presenca/checkin-obrigatorio-global";
import { CheckinCard } from "@/features/presenca/checkin-card";
import { CheckinPendenteBanner } from "@/features/presenca/checkin-pendente-banner";
import { horaSaoPaulo } from "@/features/presenca/presenca-derive";
import {
  _reiniciarPedidoCheckin,
  pedirCheckin,
  usePedidoCheckin,
} from "@/features/presenca/use-checkin-obrigatorio";
import { publicarEstadoTreino } from "@/features/onboarding/treino-estado";

const HOJE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

/** As filiais de produção, como a tabela `filiais` devolve (pinos de 13/10/2026). */
const TABELA = [
  {
    id: "f1",
    slug: "barra-funda",
    nome: "Barra Funda",
    endereco: "Av. Marquês de São Vicente, 1619 – Barra Funda",
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
    endereco: "R. Galvão Bueno, 100 – Liberdade",
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
    endereco: "R. Herval, 50 – Belém",
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
  endereco: f.endereco,
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
const barradoFora = (over: Record<string, unknown> = {}) =>
  checkin({
    id: "kb",
    apto_roleta: false,
    motivo: "fora_da_filial",
    localizacao: "fora_do_raio",
    distancia_m: 6096,
    ...over,
  });
const barradoSemGps = (over: Record<string, unknown> = {}) =>
  checkin({
    id: "ks",
    apto_roleta: false,
    motivo: "sem_localizacao",
    localizacao: "sem_localizacao",
    distancia_m: null,
    precisao_m: null,
    ...over,
  });
const confirmadoPelaGestao = () =>
  checkin({ id: "k9", origem: "gestao", localizacao: "confirmada_gestao", distancia_m: null });

/** O banco de mentira: presenca_minha_v1 lê `atual`; presenca_checkin decide pela `resposta`. */
const banco = {
  atual: minha() as ReturnType<typeof minha>,
  resposta: (args: Record<string, unknown>) =>
    minha(
      checkin({ id: `k-${String(args._filial ?? args._modo)}`, filial_slug: args._filial }),
    ) as ReturnType<typeof minha>,
  /** A tabela `filiais` responde com erro (rede). */
  falharTabela: false,
  /** Segura a resposta de presenca_checkin até soltar. */
  segurarCheckin: null as Promise<void> | null,
  /** Segura a resposta de presenca_minha_v1 até soltar. */
  segurarLeitura: null as Promise<void> | null,
};

/** O "Corretor Teste" dentro da Barra Funda: 126 m do pino, ±90 m. */
const CORRETOR_TESTE = { latitude: -23.518983, longitude: -46.676975, accuracy: 90 };

function geolocalizacao(
  impl: ((ok: PositionCallback, erro: PositionErrorCallback) => void) | undefined,
) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: impl ? { getCurrentPosition: vi.fn(impl) } : undefined,
  });
}
const posicao =
  (coords: { latitude: number; longitude: number; accuracy: number }) => (ok: PositionCallback) =>
    ok({ coords } as GeolocationPosition);
const negada = (_ok: PositionCallback, erro: PositionErrorCallback) =>
  erro({ code: 1, message: "denied" } as GeolocationPositionError);
const gps = () => vi.mocked(navigator.geolocation.getCurrentPosition);
const leiturasGps = () => gps().mock.calls.map((c) => c[2] as PositionOptions);

function aparelho(tipo: "celular" | "computador") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (q: string) => ({
      matches: q === "(pointer: coarse)" ? tipo === "celular" : false,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

const chamadasCheckin = () =>
  estado.rpc.mock.calls
    .filter(([fn]) => fn === "presenca_checkin")
    .map(([, a]) => a as Record<string, unknown>);
const leiturasFiliais = () => estado.from.mock.calls.filter(([t]) => t === "filiais").length;

beforeEach(() => {
  estado.pathname = "/fila";
  estado.papeis = { isCorretor: true, isGestor: false, loading: false };
  banco.atual = minha();
  banco.resposta = (args) =>
    minha(
      checkin({
        id: `k-${String(args._filial ?? args._modo)}`,
        filial_slug: args._filial ?? null,
        filial_nome: TABELA.find((f) => f.slug === args._filial)?.nome ?? null,
        modo: args._modo,
      }),
    );
  banco.falharTabela = false;
  banco.segurarCheckin = null;
  banco.segurarLeitura = null;
  estado.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "presenca_minha_v1") {
      if (banco.segurarLeitura) await banco.segurarLeitura;
      return { data: banco.atual, error: null };
    }
    if (fn === "presenca_checkin") {
      if (banco.segurarCheckin) await banco.segurarCheckin;
      const r = banco.resposta(args);
      banco.atual = r;
      // Como a RPC: devolve o estado sem as filiais.
      return { data: { ...r, filiais: [] }, error: null };
    }
    return { data: null, error: null };
  });
  estado.from.mockImplementation(() =>
    consulta(() =>
      banco.falharTabela
        ? { data: null, error: { message: "Failed to fetch" } }
        : { data: TABELA, error: null },
    ),
  );
  geolocalizacao(posicao(CORRETOR_TESTE));
  aparelho("celular");
  publicarEstadoTreino({ decidido: true, aberto: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  estado.rpc.mockReset();
  estado.from.mockReset();
  estado.capture.mockReset();
  for (const f of Object.values(estado.toast)) f.mockReset();
  localStorage.clear();
  publicarEstadoTreino({ decidido: false, aberto: false });
  _reiniciarPedidoCheckin();
});

function montar(ui: React.ReactNode = <CheckinObrigatorioGlobal />) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const dialogo = () => screen.queryByTestId("checkin-obrigatorio-dialog");
const regiao = () => screen.getByTestId("checkin-anuncio");
const botao = (nome: string | RegExp) => screen.getByRole("button", { name: nome });

/** Abre o diálogo e toca "Incluir minha localização"; espera a leitura voltar. */
async function incluir() {
  const d = await screen.findByTestId("checkin-obrigatorio-dialog");
  fireEvent.click(within(d).getByRole("button", { name: "Incluir minha localização" }));
  await leituraNaTela();
}

/** A linha sob o botão "Incluir minha localização" (o que se vê). */
const linhaDaLeitura = () => screen.getByTestId("incluir-localizacao-texto");

/** A linha sob o botão saiu do "lendo" (incluída, aproximada ou falhou). */
const leituraNaTela = () =>
  waitFor(() =>
    expect(screen.getByTestId("incluir-localizacao-texto")).toHaveTextContent(
      /Localização (incluída|aproximada)|não informou|bloqueou/,
    ),
  );

/** A opção da filial (pelo nome no começo do botão). */
const opcao = (nome: string) => screen.getByRole("button", { name: new RegExp(`^${nome}`) });

describe("Incluir minha localização (diálogo)", () => {
  it("lê o GPS na hora (maximumAge 0) e as filiais só no toque; mostra 'Você está aqui' e as distâncias; nenhuma RPC de check-in", async () => {
    montar();
    await screen.findByTestId("checkin-obrigatorio-dialog");
    // Nada lido ao abrir: nem o GPS, nem a tabela de filiais.
    expect(gps()).not.toHaveBeenCalled();
    expect(leiturasFiliais()).toBe(0);
    expect(
      screen.getByText(
        "Mostra a que distância você está de cada filial antes de escolher. Nada é registrado.",
      ),
    ).toBeInTheDocument();
    await incluir();
    expect(leiturasGps()).toEqual([expect.objectContaining({ maximumAge: 0 })]);
    expect(leiturasFiliais()).toBe(1);
    expect(chamadasCheckin()).toEqual([]);
    expect(screen.getByText("Localização incluída (±90 m)")).toBeInTheDocument();
    expect(within(opcao("Barra Funda")).getByText("Você está aqui")).toBeInTheDocument();
    expect(within(opcao("Liberdade")).getByText("a 6,1 km")).toBeInTheDocument();
    expect(within(opcao("Belém")).getByText("a 9,7 km")).toBeInTheDocument();
    // A ordem não muda.
    const filiais = screen
      .getAllByRole("button", { name: /^(Barra Funda|Liberdade|Belém)/ })
      .map((b) => b.querySelector("span")?.textContent?.trim());
    expect(filiais).toEqual(["Barra Funda", "Liberdade", "Belém"]);
    // A região única do diálogo anuncia.
    expect(regiao()).toHaveTextContent("Localização incluída: você está na filial Barra Funda.");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("tocar a filial onde ele está: check-in direto, sem a pergunta, com a MESMA leitura (o GPS lido uma vez só)", async () => {
    let soltar: () => void = () => {};
    montar();
    await incluir();
    banco.segurarCheckin = new Promise((r) => {
      soltar = r;
    });
    fireEvent.click(opcao("Barra Funda"));
    await waitFor(() => expect(chamadasCheckin()).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "Estou na loja" })).toBeNull();
    expect(chamadasCheckin()[0]).toMatchObject({
      _modo: "loja",
      _filial: "barra-funda",
      _latitude: -23.518983,
      _longitude: -46.676975,
      _precisao_m: 90,
    });
    expect(chamadasCheckin()[0]).not.toHaveProperty("_falha_localizacao");
    expect(gps()).toHaveBeenCalledTimes(1);
    // A RPC vai sem ler o GPS: "Registrando", não "Conferindo".
    expect(regiao()).toHaveTextContent("Registrando o check-in…");
    await act(async () => soltar());
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Check-in feito: Barra Funda. Você está na roleta hoje.",
      { description: undefined },
    );
    expect(estado.capture).not.toHaveBeenCalled();
  });

  it("tocar uma filial longe: o aviso ANTES do barrado (sem RPC), com o foco no título; Voltar mantém a prévia", async () => {
    montar();
    await incluir();
    fireEvent.click(opcao("Liberdade"));
    const titulo = await screen.findByRole("heading", {
      name: "Você está a 6,1 km da filial Liberdade",
    });
    await waitFor(() => expect(document.activeElement).toBe(titulo));
    expect(
      screen.getByText(/Se fizer o check-in na filial Liberdade agora, ele fica barrado/),
    ).toBeInTheDocument();
    expect(screen.getByText(/escolher Em casa depois não devolve/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Está dentro da loja e o celular não confirma? Peça ao gestor para confirmar no plantão.",
      ),
    ).toBeInTheDocument();
    expect(regiao()).toHaveTextContent("Você está a 6,1 km da filial Liberdade");
    expect(chamadasCheckin()).toEqual([]);
    // O aviso continua prendendo (obrigatório): ESC não fecha.
    fireEvent.keyDown(screen.getByTestId("checkin-obrigatorio-dialog"), { key: "Escape" });
    fireEvent.click(botao("Voltar"));
    expect(
      await screen.findByText("Para usar o CRM hoje, diga onde você está."),
    ).toBeInTheDocument();
    expect(within(opcao("Barra Funda")).getByText("Você está aqui")).toBeInTheDocument();
    expect(chamadasCheckin()).toEqual([]);
    expect(gps()).toHaveBeenCalledTimes(1);
  });

  it("o resgate no aviso: 'Fazer check-in na Barra Funda' faz o check-in lá com a mesma leitura", async () => {
    montar();
    await incluir();
    fireEvent.click(opcao("Liberdade"));
    expect(
      await screen.findByText("Pela localização, você está na filial Barra Funda."),
    ).toBeInTheDocument();
    fireEvent.click(botao("Fazer check-in na Barra Funda"));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()).toEqual([
      expect.objectContaining({ _filial: "barra-funda", _latitude: -23.518983, _precisao_m: 90 }),
    ]);
    expect(gps()).toHaveBeenCalledTimes(1);
  });

  it("'assim mesmo': lê a posição de NOVO (maximumAge 0) e o banco decide — barrou, a tela do barrado", async () => {
    banco.resposta = (args) =>
      minha(barradoFora({ filial_slug: args._filial, filial_nome: "Liberdade" }));
    montar();
    await incluir();
    fireEvent.click(opcao("Liberdade"));
    fireEvent.click(await screen.findByRole("button", { name: /assim mesmo$/ }));
    expect(await screen.findByTestId("checkin-barrado-motivo")).toHaveTextContent(
      "A localização deste aparelho ficou a 6,1 km da filial Liberdade.",
    );
    expect(leiturasGps().map((o) => o.maximumAge)).toEqual([0, 0]);
    expect(chamadasCheckin()).toEqual([
      expect.objectContaining({ _filial: "liberdade", _latitude: -23.518983 }),
    ]);
  });

  it("'Incluir minha localização de novo' no aviso: volta às opções e relê, sem check-in", async () => {
    montar();
    await incluir();
    fireEvent.click(opcao("Liberdade"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Incluir minha localização de novo" }),
    );
    expect(
      await screen.findByText("Para usar o CRM hoje, diga onde você está."),
    ).toBeInTheDocument();
    await waitFor(() => expect(gps()).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Localização incluída (±90 m)")).toBeInTheDocument();
    expect(leiturasFiliais()).toBe(2);
    await new Promise((r) => setTimeout(r, 20));
    expect(chamadasCheckin()).toEqual([]);
  });

  it("a leitura vence em 60 s: a tela diz a hora e o toque volta à pergunta", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    montar();
    await incluir();
    const lidaEm = Date.now();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001 + 60);
    });
    expect(
      await screen.findByText(
        `A localização das ${horaSaoPaulo(lidaEm)} venceu: inclua de novo para ver as distâncias.`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Você está aqui")).toBeNull();
    fireEvent.click(opcao("Barra Funda"));
    expect(
      await screen.findByRole("heading", { name: "Você está dentro da loja Barra Funda agora?" }),
    ).toBeInTheDocument();
    expect(chamadasCheckin()).toEqual([]);
  });

  it("leitura aproximada (±5 km): '≈', ninguém é 'aqui'; dentro → a pergunta (que usa a mesma leitura); fora → o aviso da precisão", async () => {
    geolocalizacao(posicao({ ...CORRETOR_TESTE, accuracy: 5000 }));
    montar();
    await incluir();
    expect(linhaDaLeitura()).toHaveTextContent(
      "Localização aproximada (±5 km): não dá para saber em que filial você está.",
    );
    expect(within(opcao("Barra Funda")).getByText("≈ 130 m")).toBeInTheDocument();
    expect(screen.queryByText("Você está aqui")).toBeNull();
    await waitFor(() =>
      expect(estado.capture).toHaveBeenCalledWith(
        expect.objectContaining({ message: "geolocalizacao-previa:aproximada" }),
        "presenca.previa",
        true,
      ),
    );
    // Fora (Liberdade): o aviso com o título da precisão.
    fireEvent.click(opcao("Liberdade"));
    expect(
      await screen.findByRole("heading", {
        name: "A localização deste aparelho é aproximada (±5 km)",
      }),
    ).toBeInTheDocument();
    fireEvent.click(botao("Voltar"));
    // Dentro (Barra Funda): a pergunta, e "Estou na loja" usa a mesma leitura.
    fireEvent.click(await screen.findByRole("button", { name: /^Barra Funda/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Estou na loja" }));
    await waitFor(() => expect(chamadasCheckin()).toHaveLength(1));
    expect(chamadasCheckin()[0]).toMatchObject({ _filial: "barra-funda", _precisao_m: 5000 });
    expect(gps()).toHaveBeenCalledTimes(1);
  });

  it("a gestão confirmou depois da leitura: o toque direto relê, fecha com o verde e não chama a RPC", async () => {
    montar();
    await incluir();
    banco.atual = minha(confirmadoPelaGestao());
    fireEvent.click(opcao("Barra Funda"));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Plantão confirmado pela gestão: Barra Funda. Você está na roleta hoje.",
    );
    expect(chamadasCheckin()).toEqual([]);
  });

  it("a leitura vence enquanto a presença é relida (antes da RPC): a pergunta, sem RPC", async () => {
    montar();
    await incluir();
    let soltar: () => void = () => {};
    banco.segurarLeitura = new Promise((r) => {
      soltar = r;
    });
    fireEvent.click(opcao("Barra Funda"));
    await waitFor(() =>
      expect(estado.rpc.mock.calls.filter(([fn]) => fn === "presenca_minha_v1").length).toBe(2),
    );
    const depois = Date.now() + 61_000;
    vi.spyOn(Date, "now").mockReturnValue(depois);
    banco.segurarLeitura = null;
    await act(async () => soltar());
    expect(
      await screen.findByRole("heading", { name: "Você está dentro da loja Barra Funda agora?" }),
    ).toBeInTheDocument();
    expect(chamadasCheckin()).toEqual([]);
  });

  it("permissão negada no Incluir: o passo a passo, Sentry da prévia, nada gravado; tocar a filial → o aviso de 'sem localização'; 'assim mesmo' lê de novo", async () => {
    geolocalizacao(negada);
    montar();
    await incluir();
    expect(linhaDaLeitura()).toHaveTextContent("O navegador bloqueou a localização");
    expect(linhaDaLeitura()).toHaveTextContent(/toque no cadeado/);
    expect(regiao()).toHaveTextContent("O navegador bloqueou a localização");
    await waitFor(() =>
      expect(estado.capture).toHaveBeenCalledWith(
        expect.objectContaining({ message: "geolocalizacao-previa:negada" }),
        "presenca.previa",
        true,
      ),
    );
    expect(chamadasCheckin()).toEqual([]);
    // As opções continuam habilitadas.
    expect(opcao("Belém")).not.toBeDisabled();
    fireEvent.click(opcao("Belém"));
    expect(
      await screen.findByRole("heading", {
        name: "Sem a localização, o check-in na filial Belém fica barrado",
      }),
    ).toBeInTheDocument();
    expect(chamadasCheckin()).toEqual([]);
    fireEvent.click(botao(/assim mesmo$/));
    await waitFor(() => expect(chamadasCheckin()).toHaveLength(1));
    expect(chamadasCheckin()[0]).toMatchObject({
      _filial: "belem",
      _latitude: undefined,
      _falha_localizacao: "negada",
    });
    expect(leiturasGps().map((o) => o.maximumAge)).toEqual([0, 0]);
  });

  it("no computador, a falha diz que este computador não informou", async () => {
    aparelho("computador");
    geolocalizacao((_ok, erro) => erro({ code: 2, message: "x" } as GeolocationPositionError));
    montar();
    await incluir();
    expect(linhaDaLeitura()).toHaveTextContent("Este computador não informou a localização");
  });

  it("a tabela de filiais não veio: a leitura vale, 'escolha normalmente', e a pergunta usa a mesma leitura", async () => {
    banco.falharTabela = true;
    montar();
    await incluir();
    expect(
      screen.getByText(
        "Localização incluída (±90 m), mas as distâncias não carregaram agora: escolha normalmente.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Você está aqui")).toBeNull();
    fireEvent.click(opcao("Barra Funda"));
    fireEvent.click(await screen.findByRole("button", { name: "Estou na loja" }));
    await waitFor(() => expect(chamadasCheckin()).toHaveLength(1));
    expect(chamadasCheckin()[0]).toMatchObject({ _latitude: -23.518983 });
    expect(gps()).toHaveBeenCalledTimes(1);
  });

  it("Cancelar enquanto lê: a resposta tardia é ignorada; fechar o voluntário enquanto lê também", async () => {
    let responder: PositionCallback = () => {};
    geolocalizacao((ok) => {
      responder = ok;
    });
    montar();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(within(d).getByRole("button", { name: "Incluir minha localização" }));
    expect(await screen.findByRole("button", { name: "Lendo a localização…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(regiao()).toHaveTextContent("Lendo a localização…");
    // As opções esperam a leitura.
    expect(opcao("Barra Funda")).toBeDisabled();
    fireEvent.click(botao("Cancelar"));
    await act(async () => responder({ coords: CORRETOR_TESTE } as GeolocationPosition));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Localização incluída/)).toBeNull();
    expect(
      screen.getByText(
        "Mostra a que distância você está de cada filial antes de escolher. Nada é registrado.",
      ),
    ).toBeInTheDocument();
    cleanup();

    // Voluntário (o check-in de hoje já vale): fechar enquanto lê.
    banco.atual = minha(checkin());
    montar();
    await waitFor(() =>
      expect(estado.rpc.mock.calls.some(([fn]) => fn === "presenca_minha_v1")).toBe(true),
    );
    act(() => pedirCheckin({ acao: "abrir", origem: "lateral" }));
    const v = await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(within(v).getByRole("button", { name: "Incluir minha localização" }));
    await screen.findByRole("button", { name: "Lendo a localização…" });
    fireEvent.keyDown(v, { key: "Escape" });
    await waitFor(() => expect(dialogo()).toBeNull());
    await act(async () => responder({ coords: CORRETOR_TESTE } as GeolocationPosition));
    // Reabre: nada da leitura que chegou depois.
    act(() => pedirCheckin({ acao: "abrir", origem: "lateral" }));
    await screen.findByTestId("checkin-obrigatorio-dialog");
    expect(screen.queryByText(/Localização incluída/)).toBeNull();
    expect(chamadasCheckin()).toEqual([]);
  });

  it("a prévia disse 'dentro' e o banco, com a mesma leitura, não confirmou: o barrado e o Sentry da divergência", async () => {
    banco.resposta = () => minha(barradoFora({ distancia_m: 420 }));
    montar();
    await incluir();
    fireEvent.click(opcao("Barra Funda"));
    expect(await screen.findByTestId("checkin-barrado-motivo")).toBeInTheDocument();
    await waitFor(() =>
      expect(estado.capture).toHaveBeenCalledWith(
        expect.objectContaining({ message: "presenca:previa_divergente:dentro:fora_do_raio" }),
        "presenca.previa",
        true,
      ),
    );
  });

  it("barrado sem localização: 'Incluir localização' lê ANTES e refaz na mesma filial com a leitura; se falhar de novo, nada é gravado e o motivo muda", async () => {
    geolocalizacao(negada);
    banco.resposta = (args) =>
      args._latitude === undefined
        ? minha(barradoSemGps({ falha_localizacao: "negada" }))
        : minha(checkin({ id: "k2" }));
    montar();
    // Sem o Incluir: tocar, confirmar, o celular nega → barrado sem localização.
    fireEvent.click(await screen.findByRole("button", { name: /^Barra Funda/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Estou na loja" }));
    expect(await screen.findByTestId("checkin-barrado-motivo")).toHaveTextContent("cadeado");
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
    expect(screen.getByTestId("checkin-barrado-efeito")).toHaveTextContent(
      "Chegou à loja depois? Inclua a localização pela faixa no topo do CRM ou pelo Check-in da barra lateral.",
    );
    estado.capture.mockClear();

    // Falha de novo (agora o GPS não responde): nenhuma RPC, o motivo muda.
    geolocalizacao((_ok, erro) => erro({ code: 3, message: "x" } as GeolocationPositionError));
    fireEvent.click(botao("Incluir localização"));
    await waitFor(() =>
      expect(screen.getByTestId("checkin-barrado-motivo")).toHaveTextContent(
        "O celular não conseguiu informar a localização.",
      ),
    );
    expect(leiturasGps().map((o) => o.maximumAge)).toEqual([0]);
    expect(chamadasCheckin()).toHaveLength(1);
    expect(regiao()).toHaveTextContent("O celular não conseguiu informar a localização.");
    await waitFor(() =>
      expect(estado.capture).toHaveBeenCalledWith(
        expect.objectContaining({ message: "geolocalizacao:tempo" }),
        "presenca.checkin",
        true,
      ),
    );

    // Agora o celular responde: refaz na mesma filial, com essa leitura.
    geolocalizacao(posicao(CORRETOR_TESTE));
    fireEvent.click(botao("Incluir localização"));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()).toHaveLength(2);
    expect(chamadasCheckin()[1]).toMatchObject({
      _filial: "barra-funda",
      _latitude: -23.518983,
      _precisao_m: 90,
    });
    expect(gps()).toHaveBeenCalledTimes(1);
    expect(leiturasGps()[0].maximumAge).toBe(0);
  });

  it("o resgate no barrado: a leitura diz Barra Funda, o banco barrou na Liberdade → 'Fazer check-in na Barra Funda'", async () => {
    banco.resposta = (args) =>
      args._filial === "liberdade"
        ? minha(barradoFora({ filial_slug: "liberdade", filial_nome: "Liberdade" }))
        : minha(checkin({ id: "k2" }));
    montar();
    await incluir();
    fireEvent.click(opcao("Liberdade"));
    fireEvent.click(await screen.findByRole("button", { name: /assim mesmo$/ }));
    await screen.findByTestId("checkin-barrado-motivo");
    const resgate = screen.getByTestId("resgate-aqui");
    expect(resgate).toHaveTextContent("Pela localização, você está na filial Barra Funda.");
    fireEvent.click(within(resgate).getByRole("button", { name: "Fazer check-in na Barra Funda" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin().map((a) => a._filial)).toEqual(["liberdade", "barra-funda"]);
    expect(chamadasCheckin()[1]).toMatchObject({ _latitude: -23.518983, _precisao_m: 90 });
    // O Incluir e o "assim mesmo": o resgate não leu o GPS de novo.
    expect(gps()).toHaveBeenCalledTimes(2);
  });

  it("exigência desligada: as distâncias aparecem e o toque vai direto com a leitura; filial sem pino mantém o endereço e pergunta", async () => {
    banco.atual = minha(null, { exige_localizacao: false });
    const r = montar();
    await incluir();
    expect(within(opcao("Barra Funda")).getByText("Você está aqui")).toBeInTheDocument();
    fireEvent.click(opcao("Liberdade"));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()[0]).toMatchObject({ _filial: "liberdade", _latitude: -23.518983 });
    expect(gps()).toHaveBeenCalledTimes(1);
    r.unmount();

    // Exigência ligada, Belém sem pino.
    estado.rpc.mockClear();
    banco.atual = minha(null, {
      filiais: FILIAIS.map((f) => (f.slug === "belem" ? { ...f, tem_coordenadas: false } : f)),
    });
    estado.from.mockImplementation(() =>
      consulta(() => ({
        data: TABELA.map((f) =>
          f.slug === "belem" ? { ...f, latitude: null, longitude: null } : f,
        ),
        error: null,
      })),
    );
    montar();
    await incluir();
    expect(within(opcao("Belém")).getByText("R. Herval, 50")).toBeInTheDocument();
    fireEvent.click(opcao("Belém"));
    expect(
      await screen.findByRole("heading", { name: "Você está dentro da loja Belém agora?" }),
    ).toBeInTheDocument();
    expect(chamadasCheckin()).toEqual([]);
  });
});

describe("Incluir minha localização (card de /presenca)", () => {
  /** Pedido em aberto, para conferir que o card o consumiu. */
  function Pedido() {
    const p = usePedidoCheckin();
    return <span data-testid="pedido">{p ? String(p.id) : "nenhum"}</span>;
  }

  async function incluirNoCard() {
    fireEvent.click(await screen.findByRole("button", { name: "Incluir minha localização" }));
    await leituraNaTela();
  }

  it("Incluir e tocar a filial onde ele está: check-in direto com a mesma leitura", async () => {
    montar(<CheckinCard />);
    await screen.findByText("Onde você está trabalhando hoje?");
    expect(leiturasFiliais()).toBe(0);
    await incluirNoCard();
    expect(screen.getByTestId("incluir-localizacao-anuncio")).toHaveTextContent(
      "Localização incluída: você está na filial Barra Funda.",
    );
    fireEvent.click(opcao("Barra Funda"));
    await waitFor(() => expect(chamadasCheckin()).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "Estou na loja" })).toBeNull();
    expect(chamadasCheckin()[0]).toMatchObject({
      _filial: "barra-funda",
      _latitude: -23.518983,
      _precisao_m: 90,
    });
    expect(gps()).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Barra Funda — na roleta")).toBeInTheDocument();
  });

  it("tocar uma filial longe: o aviso no lugar das opções, sem RPC; Voltar volta às opções", async () => {
    montar(<CheckinCard />);
    await screen.findByText("Onde você está trabalhando hoje?");
    await incluirNoCard();
    fireEvent.click(opcao("Liberdade"));
    const aviso = await screen.findByTestId("aviso-checkin");
    expect(within(aviso).getByTestId("aviso-checkin-titulo")).toHaveTextContent(
      "Você está a 6,1 km da filial Liberdade",
    );
    expect(screen.getByTestId("incluir-localizacao-anuncio")).toHaveTextContent(
      "Você está a 6,1 km da filial Liberdade",
    );
    expect(screen.queryByRole("button", { name: /^Liberdade/ })).toBeNull();
    expect(chamadasCheckin()).toEqual([]);
    fireEvent.click(within(aviso).getByRole("button", { name: "Voltar" }));
    expect(await screen.findByRole("button", { name: /^Liberdade/ })).toBeInTheDocument();
    expect(within(opcao("Barra Funda")).getByText("Você está aqui")).toBeInTheDocument();
    expect(chamadasCheckin()).toEqual([]);
  });

  it("barrado sem localização: 'Incluir localização' refaz na mesma filial com a leitura; se falhar, nada é gravado e o cabeçalho mostra o passo a passo novo", async () => {
    banco.atual = minha(barradoSemGps());
    banco.resposta = () => minha(checkin({ id: "k2" }));
    geolocalizacao(negada);
    montar(<CheckinCard />);
    expect(await screen.findByText("Barra Funda — fora da roleta")).toBeInTheDocument();
    expect(
      screen.getByText("Está na loja? Inclua a localização para ser liberado."),
    ).toBeInTheDocument();
    fireEvent.click(botao("Incluir localização"));
    await waitFor(() => expect(screen.getByText(/toque no cadeado/)).toBeInTheDocument());
    expect(chamadasCheckin()).toEqual([]);
    await waitFor(() =>
      expect(estado.capture).toHaveBeenCalledWith(
        expect.objectContaining({ message: "geolocalizacao:negada" }),
        "presenca.checkin",
        true,
      ),
    );

    geolocalizacao(posicao(CORRETOR_TESTE));
    fireEvent.click(botao("Incluir localização"));
    await waitFor(() => expect(chamadasCheckin()).toHaveLength(1));
    expect(chamadasCheckin()[0]).toMatchObject({
      _filial: "barra-funda",
      _latitude: -23.518983,
      _precisao_m: 90,
    });
    expect(leiturasGps().map((o) => o.maximumAge)).toEqual([0]);
    expect(await screen.findByText("Barra Funda — na roleta")).toBeInTheDocument();
  });

  it("atende o pedido da barra lateral: rola até o card, põe o foco no título e consome o pedido", async () => {
    const rolar = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: rolar,
    });
    try {
      estado.pathname = "/presenca";
      montar(
        <>
          <CheckinCard />
          <Pedido />
        </>,
      );
      await screen.findByText("Onde você está trabalhando hoje?");
      act(() => pedirCheckin({ acao: "abrir", origem: "lateral" }));
      await waitFor(() => expect(screen.getByTestId("pedido")).toHaveTextContent("nenhum"));
      expect(rolar).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
      expect(document.activeElement).toHaveTextContent("Check-in de hoje");
    } finally {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });
});

describe("a faixa do topo no barrado sem localização", () => {
  /** A faixa e o diálogo no mesmo shell (o diálogo pode montar depois: chunk lazy). */
  function Shell({ comDialogo = true }: { comDialogo?: boolean }) {
    return (
      <>
        <CheckinPendenteBanner />
        {comDialogo && <CheckinObrigatorioGlobal />}
      </>
    );
  }
  function montarShell(comDialogo = true) {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const ui = (com: boolean) => (
      <QueryClientProvider client={qc}>
        <Shell comDialogo={com} />
      </QueryClientProvider>
    );
    const r = render(ui(comDialogo));
    return { ...r, comDialogo: () => r.rerender(ui(true)) };
  }
  const faixa = () => screen.queryByTestId("faixa-checkin-barrado");
  const voltarParaAJanela = () =>
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

  it("'Incluir localização' abre o diálogo voluntário no barrado e refaz na mesma filial; liberou → verde, a faixa some; o banco barra de novo (fora) → o diálogo fica no barrado com o motivo", async () => {
    banco.atual = minha(barradoSemGps());
    banco.resposta = () => minha(checkin({ id: "k2" }));
    // O GPS só responde quando o teste soltar (para ver o diálogo no meio).
    const gpsPreso: { soltar: (() => void) | null } = { soltar: null };
    geolocalizacao((ok) => {
      gpsPreso.soltar = () => ok({ coords: CORRETOR_TESTE } as GeolocationPosition);
    });
    const r = montarShell();
    const f = await screen.findByTestId("faixa-checkin-barrado");
    expect(f).toHaveAttribute("data-motivo", "sem_localizacao");
    expect(f).toHaveTextContent(
      "Seu check-in em Barra Funda ficou sem a localização e não vale para as roletas. " +
        "Está na loja? Inclua a localização para ser liberado.",
    );
    // O link de antes continua lá, para quem prefere escolher em /presenca.
    expect(within(f).getByRole("link", { name: "Refazer check-in" })).toHaveAttribute(
      "href",
      "/presenca",
    );
    // Já fez check-in hoje: o diálogo obrigatório não abre sozinho.
    expect(dialogo()).toBeNull();
    expect(gps()).not.toHaveBeenCalled();

    fireEvent.click(within(f).getByRole("button", { name: "Incluir localização" }));
    // A faixa só PEDE: o diálogo abre voluntário, no barrado, e lê o GPS.
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    expect(d).toHaveAttribute("data-modo", "voluntario");
    expect(within(d).getByTestId("checkin-barrado-motivo")).toBeInTheDocument();
    await waitFor(() => expect(gps()).toHaveBeenCalledTimes(1));
    expect(leiturasGps()[0].maximumAge).toBe(0);
    expect(regiao()).toHaveTextContent("Conferindo a localização…");
    expect(chamadasCheckin()).toEqual([]);

    act(() => gpsPreso.soltar?.());
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()).toEqual([
      expect.objectContaining({
        _modo: "loja",
        _filial: "barra-funda",
        _latitude: -23.518983,
        _longitude: -46.676975,
        _precisao_m: 90,
      }),
    ]);
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Check-in feito: Barra Funda. Você está na roleta hoje.",
      { description: undefined },
    );
    await waitFor(() => expect(faixa()).toBeNull());
    r.unmount();

    // De novo, e agora o banco barra pela distância: o diálogo fica no
    // barrado com o motivo novo (e a faixa passa à do fora, como antes).
    estado.rpc.mockClear();
    banco.atual = minha(barradoSemGps());
    banco.resposta = () => minha(barradoFora({ id: "k3" }));
    geolocalizacao(posicao(CORRETOR_TESTE));
    montarShell();
    fireEvent.click(
      within(await screen.findByTestId("faixa-checkin-barrado")).getByRole("button", {
        name: "Incluir localização",
      }),
    );
    await waitFor(() => expect(chamadasCheckin()).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId("checkin-barrado-motivo")).toHaveTextContent(
        "A localização deste aparelho ficou a 6,1 km da filial Barra Funda.",
      ),
    );
    expect(dialogo()).toHaveAttribute("data-modo", "voluntario");
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    const agora = screen.getByTestId("faixa-checkin-barrado");
    expect(agora).toHaveAttribute("data-motivo", "fora_da_filial");
    expect(agora).toHaveTextContent(
      "Seu check-in em Barra Funda não valeu: a localização não confirmou a loja. Chegou à loja? Refaça o check-in.",
    );
    expect(within(agora).queryByRole("button", { name: "Incluir localização" })).toBeNull();
  });

  it("a gestão confirmou antes do toque: nenhuma RPC e nada rebaixado — já sabido ao atender, só o aviso (o diálogo não abre); descoberto na releitura, o verde da gestão", async () => {
    // O chunk do diálogo ainda carregando quando ele toca; até montar, a
    // releitura da faixa (ao voltar para a janela) já trouxe a confirmação.
    banco.atual = minha(barradoSemGps());
    const r = montarShell(false);
    const f = await screen.findByTestId("faixa-checkin-barrado");
    banco.atual = minha(confirmadoPelaGestao());
    fireEvent.click(within(f).getByRole("button", { name: "Incluir localização" }));
    voltarParaAJanela();
    await waitFor(() => expect(faixa()).toBeNull());
    r.comDialogo();
    await waitFor(() =>
      expect(estado.toast.info).toHaveBeenCalledWith(
        "Você já está na roleta hoje: Barra Funda (plantão confirmado pela gestão).",
      ),
    );
    await new Promise((res) => setTimeout(res, 30));
    expect(dialogo()).toBeNull();
    expect(chamadasCheckin()).toEqual([]);
    // A leitura do GPS sai no toque da faixa (o navegador só mostra o pedido
    // de permissão de dentro do gesto — "Pedir localização no check-in", dono,
    // 13/10) e é descartada: nada é gravado e a confirmação da gestão fica.
    expect(gps()).toHaveBeenCalledTimes(1);
    r.unmount();

    // A faixa ainda mostrava o barrado (a releitura dela não tinha passado):
    // o diálogo abre, relê antes de qualquer RPC e fecha com o verde da
    // gestão — o check-in confirmado não é refeito.
    estado.rpc.mockClear();
    for (const t of Object.values(estado.toast)) t.mockClear();
    banco.atual = minha(barradoSemGps());
    montarShell();
    const f2 = await screen.findByTestId("faixa-checkin-barrado");
    banco.atual = minha(confirmadoPelaGestao());
    fireEvent.click(within(f2).getByRole("button", { name: "Incluir localização" }));
    await waitFor(() =>
      expect(estado.toast.success).toHaveBeenCalledWith(
        "Plantão confirmado pela gestão: Barra Funda. Você está na roleta hoje.",
      ),
    );
    await waitFor(() => expect(dialogo()).toBeNull());
    await waitFor(() => expect(faixa()).toBeNull());
    expect(chamadasCheckin()).toEqual([]);
  });
});
