// Check-in obrigatório (decisão do dono, 12/10/2026: "checkin obrigatório") e
// a localização que barra o check-in fora da filial ("localização deve barrar
// caso não esteja na filial"). A regra de aptidão é do banco
// (tests/db/presenca-filial.test.ts); aqui se trava a TELA: quando o diálogo
// abre, que ele não fecha sozinho, a confirmação antes da filial, o que mostra
// quando a localização barra, que um check-in que já liberou a roleta (no
// celular, pela gestão, pelo interruptor) fecha o diálogo e nunca é rebaixado,
// e que falha técnica nunca prende o corretor fora do CRM.
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const estado = vi.hoisted(() => ({
  rpc: vi.fn(),
  pathname: "/fila",
  papeis: { isCorretor: true, isGestor: false, loading: false },
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  capture: vi.fn(),
}));

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
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: estado.rpc } }));
vi.mock("@/integrations/supabase/pendentes", () => ({
  supabasePendente: { rpc: estado.rpc, from: vi.fn() },
}));
vi.mock("@/lib/error-tracking-browser", () => ({ captureClientError: estado.capture }));

import { CheckinObrigatorioGlobal } from "@/features/presenca/checkin-obrigatorio-global";
import { CheckinPendenteBanner } from "@/features/presenca/checkin-pendente-banner";
import {
  checkinObrigatorioPendente,
  desfechoCheckin,
  rotaSemCheckinObrigatorio,
} from "@/features/presenca/checkin-obrigatorio";
import { falhaDoCodigo, obterLocalizacao } from "@/features/presenca/presenca-client";
import { useCheckinObrigatorioPendente } from "@/features/presenca/use-checkin-obrigatorio";
import { AVISO_FORA_DO_REFORCO, parseMinhaPresenca } from "@/features/presenca/presenca-derive";
import { publicarEstadoTreino } from "@/features/onboarding/treino-estado";

const HOJE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const FILIAIS = [
  {
    slug: "barra-funda",
    nome: "Barra Funda",
    endereco: null,
    tem_coordenadas: true,
    raio_metros: 300,
  },
  { slug: "liberdade", nome: "Liberdade", endereco: null, tem_coordenadas: true, raio_metros: 300 },
  { slug: "belem", nome: "Belém", endereco: null, tem_coordenadas: true, raio_metros: 300 },
];

type Checkin = Record<string, unknown> | null;

function minha(checkin: Checkin = null, over: Record<string, unknown> = {}) {
  return {
    dia: HOJE,
    presente: !!checkin && checkin.apto_roleta === true && !checkin.encerrado_em,
    mes_referencia: "2026-09-01",
    vendas_mes_anterior: 2,
    vendas_minimas: 3,
    casa_liberada: false,
    exige_localizacao: true,
    checkin,
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
    distancia_m: 80,
    precisao_m: 20,
    origem: "corretor",
    criado_em: `${HOJE}T12:00:00Z`,
    encerrado_em: null,
    ...over,
  };
}

const barradoFora = (over: Record<string, unknown> = {}) =>
  checkin({
    apto_roleta: false,
    motivo: "fora_da_filial",
    localizacao: "fora_do_raio",
    distancia_m: 5830,
    ...over,
  });
const barradoSemGps = (over: Record<string, unknown> = {}) =>
  checkin({
    apto_roleta: false,
    motivo: "sem_localizacao",
    localizacao: "sem_localizacao",
    distancia_m: null,
    precisao_m: null,
    ...over,
  });
const casaRecusada = () =>
  checkin({
    id: "k3",
    modo: "casa",
    filial_slug: null,
    filial_nome: null,
    apto_roleta: false,
    motivo: "casa_abaixo_minimo_vendas",
    localizacao: null,
    distancia_m: null,
  });
/** A gestão confirmou no plantão (presenca_checkin com _corretor_id). */
const confirmadoPelaGestao = () =>
  checkin({ id: "k9", origem: "gestao", localizacao: "confirmada_gestao", distancia_m: null });

/** O banco de mentira: presenca_minha_v1 lê `atual`; presenca_checkin decide pela `resposta`. */
const banco = {
  atual: minha() as ReturnType<typeof minha>,
  resposta: (_args: Record<string, unknown>) => minha(checkin()) as ReturnType<typeof minha>,
  falharLeitura: false,
};

function geolocalizacao(
  impl: ((ok: PositionCallback, erro: PositionErrorCallback) => void) | undefined,
) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: impl ? { getCurrentPosition: vi.fn(impl) } : undefined,
  });
}
const leiturasGps = () =>
  (navigator.geolocation.getCurrentPosition as unknown as Mock).mock.calls.map(
    (c) => c[2] as PositionOptions,
  );

/** Celular (tela de toque) ou computador — o que `(pointer: coarse)` responde. */
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

const naLoja = (ok: PositionCallback) =>
  ok({ coords: { latitude: -23.52, longitude: -46.677, accuracy: 15 } } as GeolocationPosition);
const negada = (_ok: PositionCallback, erro: PositionErrorCallback) =>
  erro({ code: 1, message: "denied" } as GeolocationPositionError);

const chamadasCheckin = () =>
  estado.rpc.mock.calls
    .filter(([fn]) => fn === "presenca_checkin")
    .map(([, a]) => a as Record<string, unknown>);

beforeEach(() => {
  estado.pathname = "/fila";
  estado.papeis = { isCorretor: true, isGestor: false, loading: false };
  banco.atual = minha();
  banco.resposta = () => minha(checkin());
  banco.falharLeitura = false;
  estado.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "presenca_minha_v1") {
      if (banco.falharLeitura) return { data: null, error: { message: "boom", code: "PGRST000" } };
      return { data: banco.atual, error: null };
    }
    if (fn === "presenca_checkin") {
      const r = banco.resposta(args);
      banco.atual = r;
      // Como a RPC: devolve o estado sem as filiais.
      return { data: { ...r, filiais: [] }, error: null };
    }
    return { data: null, error: null };
  });
  geolocalizacao(naLoja);
  aparelho("celular");
  publicarEstadoTreino({ decidido: true, aberto: false });
});

afterEach(() => {
  cleanup();
  estado.rpc.mockReset();
  estado.capture.mockReset();
  for (const f of Object.values(estado.toast)) f.mockReset();
  localStorage.clear();
  publicarEstadoTreino({ decidido: false, aberto: false });
});

/** O que o estudo do funil e as metas do dia enxergam (eles esperam o check-in). */
function Espera() {
  const pendente = useCheckinObrigatorioPendente();
  return <span data-testid="espera">{String(pendente)}</span>;
}

function montar({ faixa = false }: { faixa?: boolean } = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      {faixa && <CheckinPendenteBanner />}
      <CheckinObrigatorioGlobal />
      <Espera />
    </QueryClientProvider>,
  );
}

const dialogo = () => screen.queryByTestId("checkin-obrigatorio-dialog");
/** Espera a leitura da presença voltar (o diálogo decide só depois dela). */
const leituraFeita = () =>
  waitFor(() =>
    expect(estado.rpc.mock.calls.some(([fn]) => fn === "presenca_minha_v1")).toBe(true),
  );

/** Toca a filial e confirma "Estou na loja" (a exigência está ligada). */
async function checkinNaFilial(nome: RegExp) {
  const d = await screen.findByTestId("checkin-obrigatorio-dialog");
  fireEvent.click(within(d).getByRole("button", { name: nome }));
  fireEvent.click(await screen.findByRole("button", { name: "Estou na loja" }));
}

/** O corretor volta para a janela do CRM (outro aparelho, outra aba). */
function voltarParaAJanela() {
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
}

describe("quando o diálogo obrigatório abre", () => {
  it("corretor sem check-in hoje: abre com o porquê, as três filiais, Em casa, a dica e o aviso da localização", async () => {
    montar();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    expect(within(d).getByText("Para usar o CRM hoje, diga onde você está.")).toBeInTheDocument();
    for (const nome of ["Barra Funda", "Liberdade", "Belém", "Em casa"]) {
      expect(within(d).getByRole("button", { name: new RegExp(nome) })).toBeInTheDocument();
    }
    expect(
      within(d).getByText("Fora de uma filial (casa, visita, estande)? Escolha Em casa."),
    ).toBeInTheDocument();
    expect(within(d).getByText(/a localização do celular é conferida/)).toBeInTheDocument();
    // A régua não empurra quem está em casa para "escolher" uma filial.
    expect(within(d).getByText("este mês, a roleta só libera no plantão")).toBeInTheDocument();
    expect(within(d).queryByText(/só recebe leads no plantão/)).toBeNull();
  });

  it("o foco começa no título, não numa filial (um Enter solto não faz check-in)", async () => {
    montar();
    await screen.findByTestId("checkin-obrigatorio-dialog");
    await waitFor(() => expect(document.activeElement).toHaveTextContent("Check-in de hoje"));
    expect(document.activeElement?.tagName).toBe("H2");
  });

  it("enquanto a leitura não volta, não pisca diálogo", async () => {
    let soltar: (v: unknown) => void = () => {};
    estado.rpc.mockImplementation(
      () =>
        new Promise((r) => {
          soltar = r;
        }),
    );
    montar();
    await leituraFeita();
    expect(dialogo()).toBeNull();
    await act(async () => soltar({ data: minha(), error: null }));
    expect(await screen.findByTestId("checkin-obrigatorio-dialog")).toBeInTheDocument();
  });

  it("gestão sem papel corretor nunca é bloqueada (nem lê a presença)", async () => {
    estado.papeis = { isCorretor: false, isGestor: true, loading: false };
    montar();
    await new Promise((r) => setTimeout(r, 20));
    expect(dialogo()).toBeNull();
    expect(estado.rpc).not.toHaveBeenCalled();
  });

  it("quem é gestor E corretor passa pela trava (decisão do dono: vale para quem tem papel corretor)", async () => {
    estado.papeis = { isCorretor: true, isGestor: true, loading: false };
    montar();
    expect(await screen.findByTestId("checkin-obrigatorio-dialog")).toBeInTheDocument();
  });

  it("com check-in hoje — aberto, encerrado ou barrado — não abre", async () => {
    for (const c of [
      checkin(),
      checkin({ encerrado_em: `${HOJE}T18:00:00Z` }),
      barradoFora(),
      checkin({ modo: "casa", filial_slug: null, filial_nome: null, apto_roleta: false }),
    ]) {
      banco.atual = minha(c);
      const r = montar();
      await leituraFeita();
      await new Promise((res) => setTimeout(res, 20));
      expect(dialogo()).toBeNull();
      r.unmount();
      estado.rpc.mockClear();
    }
  });

  it("não abre nas telas que já têm o card (/presenca, /meu-perfil) nem na tela cheia de campo", async () => {
    for (const rota of ["/presenca", "/meu-perfil", "/modo-visita"]) {
      estado.pathname = rota;
      const r = montar();
      await leituraFeita();
      await new Promise((res) => setTimeout(res, 20));
      expect(dialogo()).toBeNull();
      r.unmount();
      estado.rpc.mockClear();
    }
    expect(rotaSemCheckinObrigatorio("/presenca")).toBe(true);
    expect(rotaSemCheckinObrigatorio("/inicio")).toBe(false);
  });

  it("não abre por cima do treino do onboarding (obrigatório ou reaberto) e espera ele decidir", async () => {
    publicarEstadoTreino({ decidido: true, aberto: true });
    montar();
    await leituraFeita();
    await new Promise((res) => setTimeout(res, 20));
    expect(dialogo()).toBeNull();
    // Concluiu o treino: aí sim, o check-in.
    act(() => publicarEstadoTreino({ decidido: true, aberto: false }));
    expect(await screen.findByTestId("checkin-obrigatorio-dialog")).toBeInTheDocument();
  });

  it("onboarding ainda não decidido (preferências carregando): espera", async () => {
    publicarEstadoTreino({ decidido: false, aberto: false });
    montar();
    await leituraFeita();
    await new Promise((res) => setTimeout(res, 20));
    expect(dialogo()).toBeNull();
  });

  it("aba aberta desde ontem: relê a presença antes de decidir — e relê uma vez só", async () => {
    // 1ª leitura: o check-in de ontem (cache velho); 2ª: hoje, sem check-in.
    const leituras = [minha(checkin(), { dia: "2026-10-11" }), minha()];
    estado.rpc.mockImplementation(async (fn: string) =>
      fn === "presenca_minha_v1"
        ? { data: leituras.shift() ?? minha(), error: null }
        : { data: null, error: null },
    );
    const r = montar();
    expect(await screen.findByTestId("checkin-obrigatorio-dialog")).toBeInTheDocument();
    r.unmount();

    // Relógio do aparelho discorda do servidor para sempre: relê uma vez e vale o servidor.
    estado.rpc.mockReset();
    estado.rpc.mockImplementation(async () => ({
      data: minha(checkin(), { dia: "2026-10-11" }),
      error: null,
    }));
    montar();
    await waitFor(() => expect(estado.rpc).toHaveBeenCalledTimes(2));
    await new Promise((res) => setTimeout(res, 50));
    expect(estado.rpc).toHaveBeenCalledTimes(2);
    expect(dialogo()).toBeNull();
  });

  it("leitura da presença com erro: libera o CRM (e o que espera o check-in também)", async () => {
    banco.falharLeitura = true;
    montar();
    await leituraFeita();
    await new Promise((res) => setTimeout(res, 20));
    expect(dialogo()).toBeNull();
    expect(screen.getByTestId("espera")).toHaveTextContent("false");
  });

  it("só a PRIMEIRA leitura com erro libera: com o diálogo aberto, a releitura que falha não fecha (e ele segue normal quando a leitura volta)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      montar();
      await screen.findByTestId("checkin-obrigatorio-dialog");
      const leituras = () =>
        estado.rpc.mock.calls.filter(([fn]) => fn === "presenca_minha_v1").length;
      // A rede soluça: a releitura de 15 s (e a do foco) falham.
      banco.falharLeitura = true;
      const antes = leituras();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_500);
      });
      voltarParaAJanela();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(leituras()).toBeGreaterThan(antes);
      expect(dialogo()).toBeInTheDocument();
      expect(screen.getByTestId("espera")).toHaveTextContent("true");
      // A leitura volta (ainda sem check-in): continua aberto, e relendo.
      banco.falharLeitura = false;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_500);
      });
      expect(dialogo()).toBeInTheDocument();
      // O check-in feito no celular chega pela releitura de 15 s: fecha com o verde.
      banco.atual = minha(checkin({ id: "k2" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_500);
      });
      await waitFor(() => expect(dialogo()).toBeNull());
      expect(estado.toast.success).toHaveBeenCalledWith(
        "Check-in feito: Barra Funda. Você está na roleta hoje.",
      );
      expect(chamadasCheckin()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("releitura com erro e o barrado na tela: o barrado continua (nada fecha por erro)", async () => {
    banco.resposta = () => minha(barradoFora());
    montar();
    await checkinNaFilial(/Barra Funda/);
    await screen.findByTestId("checkin-barrado-motivo");
    banco.falharLeitura = true;
    voltarParaAJanela();
    await new Promise((res) => setTimeout(res, 30));
    expect(screen.getByTestId("checkin-barrado-motivo")).toBeInTheDocument();
  });
});

describe("o diálogo não fecha sozinho", () => {
  it("ESC não fecha", async () => {
    montar();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.keyDown(d, { key: "Escape" });
    await new Promise((res) => setTimeout(res, 20));
    expect(dialogo()).toBeInTheDocument();
  });

  it("o X (escondido) também não fecha", async () => {
    montar();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    // A classe esconde o X; mesmo que alguém o alcance (teclado, leitor de tela), não fecha.
    expect(d.className).toContain("[&>button.absolute]:hidden");
    fireEvent.click(within(d).getByRole("button", { name: "Close" }));
    await new Promise((res) => setTimeout(res, 20));
    expect(dialogo()).toBeInTheDocument();
  });
});

describe("a filial pede confirmação (um toque 'para ver' custaria as roletas e o reforço do dia)", () => {
  it("tocar a filial NÃO faz check-in: pergunta se está dentro da loja; Voltar volta às opções", async () => {
    montar();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(within(d).getByRole("button", { name: /Liberdade/ }));
    const titulo = await screen.findByRole("heading", {
      name: "Você está dentro da loja Liberdade agora?",
    });
    expect(
      screen.getByText(
        "O celular vai conferir. Se não confirmar, o check-in fica barrado e você fica fora das roletas e do reforço hoje.",
      ),
    ).toBeInTheDocument();
    // O foco vai para a pergunta.
    await waitFor(() => expect(document.activeElement).toBe(titulo));
    expect(chamadasCheckin()).toEqual([]);
    // Confirmação também não fecha com ESC.
    fireEvent.keyDown(screen.getByTestId("checkin-obrigatorio-dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(
      await screen.findByText("Para usar o CRM hoje, diga onde você está."),
    ).toBeInTheDocument();
    expect(chamadasCheckin()).toEqual([]);
  });

  it("no computador, a pergunta já avisa que a localização costuma falhar", async () => {
    aparelho("computador");
    montar();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(within(d).getByRole("button", { name: /Belém/ }));
    expect(
      await screen.findByText(/No computador a localização costuma falhar/),
    ).toBeInTheDocument();
  });

  it("com a exigência desligada, a filial vai direto (nada a perder)", async () => {
    banco.atual = minha(null, { exige_localizacao: false });
    montar();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(within(d).getByRole("button", { name: /Barra Funda/ }));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()).toHaveLength(1);
  });

  it("'Em casa' não pede confirmação (nunca pede localização)", async () => {
    banco.resposta = () =>
      minha(checkin({ modo: "casa", filial_slug: null, filial_nome: null }), {
        vendas_mes_anterior: 4,
      });
    montar();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(within(d).getByRole("button", { name: /Em casa/ }));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()[0]).toMatchObject({ _modo: "casa", _latitude: undefined });
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });
});

describe("depois do check-in", () => {
  it("na filial, dentro do raio: fecha com o toast verde", async () => {
    montar();
    await screen.findByTestId("checkin-obrigatorio-dialog");
    expect(screen.getByTestId("espera")).toHaveTextContent("true");
    await checkinNaFilial(/Barra Funda/);
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()[0]).toMatchObject({
      _modo: "loja",
      _filial: "barra-funda",
      _latitude: -23.52,
    });
    // Com a localização lida, nada de porquê da falha.
    expect(chamadasCheckin()[0]).not.toHaveProperty("_falha_localizacao");
    expect(estado.capture).not.toHaveBeenCalled();
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Check-in feito: Barra Funda. Você está na roleta hoje.",
      { description: undefined },
    );
    // Fechou e não volta: o check-in de hoje existe — e o que vem depois segue.
    await new Promise((res) => setTimeout(res, 20));
    expect(dialogo()).toBeNull();
    expect(screen.getByTestId("espera")).toHaveTextContent("false");
  });

  it("leitor de tela: UMA região aria-live sempre montada, que troca só o texto (conferindo → motivo)", async () => {
    let responder: PositionCallback = () => {};
    geolocalizacao((ok) => {
      responder = ok;
    });
    banco.resposta = () => minha(barradoFora());
    montar();
    await screen.findByTestId("checkin-obrigatorio-dialog");
    const regiao = screen.getByTestId("checkin-anuncio");
    expect(regiao).toHaveAttribute("aria-live", "polite");
    expect(regiao).toHaveAttribute("role", "status");
    expect(regiao).toHaveTextContent(/^$/);
    await checkinNaFilial(/Barra Funda/);
    await waitFor(() => expect(regiao).toHaveTextContent("Conferindo a localização…"));
    // O spinner visível não é uma segunda região (seria anunciado duas vezes).
    expect(screen.getByTestId("checkin-status")).toHaveAttribute("aria-hidden", "true");
    await waitFor(() => expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalled());
    act(() =>
      responder({
        coords: { latitude: -23.6, longitude: -46.7, accuracy: 15 },
      } as GeolocationPosition),
    );
    await screen.findByTestId("checkin-barrado-motivo");
    // A MESMA região (não uma nova, nascida com o texto) agora diz o motivo.
    expect(screen.getByTestId("checkin-anuncio")).toBe(regiao);
    expect(regiao).toHaveTextContent(
      "A localização deste aparelho ficou a 5,8 km da filial Barra Funda.",
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
    // "Estou em casa" abaixo do mínimo: a mesma região diz o motivo do recusado.
    banco.resposta = () => minha(casaRecusada());
    fireEvent.click(screen.getByRole("button", { name: "Estou em casa" }));
    await screen.findByTestId("checkin-recusado-motivo");
    expect(screen.getByTestId("checkin-anuncio")).toBe(regiao);
    expect(regiao).toHaveTextContent("Em casa, a roleta só libera com 3 vendas aprovadas");
  });

  it("enquanto o aparelho lê a posição: 'Conferindo a localização…' (role=status)", async () => {
    let responder: PositionCallback = () => {};
    geolocalizacao((ok) => {
      responder = ok;
    });
    montar();
    await checkinNaFilial(/Barra Funda/);
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Conferindo a localização…");
    await waitFor(() => expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalled());
    act(() =>
      responder({
        coords: { latitude: -23.52, longitude: -46.677, accuracy: 15 },
      } as GeolocationPosition),
    );
    await waitFor(() => expect(dialogo()).toBeNull());
  });

  it("fora da filial: diz onde o APARELHO ficou, que não vale para as roletas nem para o reforço, e as saídas — sem toast", async () => {
    banco.resposta = () => minha(barradoFora());
    montar();
    await checkinNaFilial(/Barra Funda/);
    const motivo = await screen.findByTestId("checkin-barrado-motivo");
    expect(motivo).toHaveTextContent(
      "A localização deste aparelho ficou a 5,8 km da filial Barra Funda. O check-in na filial só vale de dentro da loja. " +
        "Se você está na loja, peça ao gestor para confirmar no plantão.",
    );
    // O leitor de tela ouve o motivo pela região sempre montada (não por uma
    // que nasce com o texto).
    expect(screen.getByTestId("checkin-anuncio")).toHaveTextContent(
      "A localização deste aparelho ficou a 5,8 km da filial Barra Funda.",
    );
    expect(motivo).not.toHaveAttribute("aria-live");
    const efeito = screen.getByTestId("checkin-barrado-efeito");
    expect(efeito).toHaveTextContent(
      "Seu check-in em Barra Funda ficou registrado, mas não vale para as roletas nem para o reforço de hoje. " +
        "Visitas marcadas pelo SDR continuam chegando.",
    );
    // Nada de "menu" que não existe: a saída é a faixa do topo.
    expect(efeito).not.toHaveTextContent("no menu");
    expect(efeito).toHaveTextContent("faixa no topo");
    // O foco foi para o título da nova tela.
    await waitFor(() =>
      expect(document.activeElement).toHaveTextContent(
        "A localização não confirmou a filial Barra Funda",
      ),
    );
    const aberto = screen.getByTestId("checkin-obrigatorio-dialog");
    for (const nome of ["Tentar de novo", "Estou em casa", "Continuar fora das roletas"]) {
      expect(within(aberto).getByRole("button", { name: nome })).toBeInTheDocument();
    }
    expect(estado.toast.success).not.toHaveBeenCalled();
    // O diálogo mostra o motivo: sem toast amarelo repetindo.
    expect(estado.toast.warning).not.toHaveBeenCalled();
    // O banco já conta "fez check-in hoje", mas o estudo e as metas esperam o
    // diálogo fechar (não abrem por cima da explicação).
    expect(screen.getByTestId("espera")).toHaveTextContent("true");
    // Barrado continua bloqueante: ESC não fecha.
    fireEvent.keyDown(aberto, { key: "Escape" });
    await new Promise((res) => setTimeout(res, 20));
    expect(dialogo()).toBeInTheDocument();
    // Seguir fora das roletas fecha e não reabre; aí o estudo e as metas seguem.
    fireEvent.click(within(aberto).getByRole("button", { name: "Continuar fora das roletas" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    await new Promise((res) => setTimeout(res, 20));
    expect(dialogo()).toBeNull();
    expect(screen.getByTestId("espera")).toHaveTextContent("false");
  });

  it("localização aproximada (±5 km, típico de computador): não acusa a distância, manda usar o celular", async () => {
    banco.resposta = () => minha(barradoFora({ distancia_m: 8363, precisao_m: 5000 }));
    montar();
    await checkinNaFilial(/Barra Funda/);
    const motivo = await screen.findByTestId("checkin-barrado-motivo");
    expect(motivo).toHaveTextContent(
      "A localização deste aparelho é aproximada (±5 km): faça o check-in pelo celular, de dentro da loja, " +
        "ou peça ao gestor para confirmar no plantão.",
    );
    expect(motivo).not.toHaveTextContent("8,4 km");
  });

  it("barrado e 'Continuar fora das roletas': a faixa do topo passa a avisar e leva a /presenca", async () => {
    banco.resposta = () => minha(barradoFora());
    montar({ faixa: true });
    await checkinNaFilial(/Barra Funda/);
    fireEvent.click(await screen.findByRole("button", { name: "Continuar fora das roletas" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    const faixa = await screen.findByTestId("faixa-checkin-barrado");
    expect(faixa).toHaveTextContent(
      "Seu check-in em Barra Funda não valeu: a localização não confirmou a loja. Chegou à loja? Refaça o check-in.",
    );
    expect(within(faixa).getByRole("link", { name: "Refazer check-in" })).toHaveAttribute(
      "href",
      "/presenca",
    );
  });

  it("barrado → Escolher outra filial: volta às opções sem marcar a barrada, e a saída continua lá", async () => {
    banco.resposta = () => minha(barradoFora({ distancia_m: 2100 }));
    montar();
    await checkinNaFilial(/Barra Funda/);
    fireEvent.click(await screen.findByRole("button", { name: "Escolher outra filial" }));
    const d = screen.getByTestId("checkin-obrigatorio-dialog");
    expect(within(d).getByRole("button", { name: /Liberdade/ })).toBeInTheDocument();
    // A filial barrada não aparece como escolha feita.
    expect(within(d).getByRole("button", { name: /Barra Funda/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.click(within(d).getByRole("button", { name: "Continuar fora das roletas" }));
    await waitFor(() => expect(dialogo()).toBeNull());
  });

  it("barrado → Tentar de novo na mesma filial: lê a posição AGORA (maximumAge 0) e, dentro do raio, fecha", async () => {
    let tentativas = 0;
    banco.resposta = (args) => {
      tentativas += 1;
      const filial = { filial_slug: args._filial, filial_nome: "Liberdade" };
      return tentativas === 1
        ? minha(barradoFora({ ...filial, distancia_m: 900 }))
        : minha(checkin({ ...filial, id: "k2" }));
    };
    montar();
    await checkinNaFilial(/Liberdade/);
    fireEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin().map((a) => a._filial)).toEqual(["liberdade", "liberdade"]);
    const [primeira, segunda] = leiturasGps();
    expect(primeira.maximumAge).toBe(60_000);
    expect(segunda.maximumAge).toBe(0);
  });

  it("sem localização porque o navegador negou: ensina a liberar (Android e iPhone), manda o porquê ao banco e ao Sentry; 'Estou em casa' abaixo do mínimo avisa do reforço e libera", async () => {
    geolocalizacao(negada);
    banco.resposta = (args) =>
      args._modo === "casa" ? minha(casaRecusada()) : minha(barradoSemGps());
    montar();
    await checkinNaFilial(/Belém/);
    const motivo = await screen.findByTestId("checkin-barrado-motivo");
    expect(motivo).toHaveTextContent("cadeado");
    expect(motivo).toHaveTextContent("Localização → Permitir");
    expect(motivo).toHaveTextContent("aA ao lado do endereço → Ajustes do Site → Localização");
    expect(motivo).toHaveTextContent(
      "Ajustes → Privacidade e Segurança → Serviços de Localização → Sites do Safari",
    );
    // Sem coordenada — e, desde a 0082, o porquê vai junto.
    expect(chamadasCheckin()[0]).toMatchObject({
      _modo: "loja",
      _filial: "belem",
      _latitude: undefined,
      _falha_localizacao: "negada",
    });
    await waitFor(() =>
      expect(estado.capture).toHaveBeenCalledWith(
        expect.objectContaining({ message: "geolocalizacao:negada" }),
        "presenca.checkin",
        true,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Estou em casa" }));
    const recusa = await screen.findByTestId("checkin-recusado-motivo");
    expect(recusa).toHaveTextContent(
      "Em casa, a roleta só libera com 3 vendas aprovadas em setembro",
    );
    expect(recusa).toHaveTextContent("é preciso estar numa filial");
    // O barrado de antes tira também o reforço hoje — a tela diz.
    expect(screen.getByTestId("checkin-recusado-reforco")).toHaveTextContent(AVISO_FORA_DO_REFORCO);
    // Cumpriu o check-in com sinceridade: o CRM está liberado (ESC fecha).
    fireEvent.keyDown(screen.getByTestId("checkin-obrigatorio-dialog"), { key: "Escape" });
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(estado.toast.success).not.toHaveBeenCalled();
  });

  it("'Em casa' sincero desde o início (abaixo do mínimo): sem aviso de reforço perdido", async () => {
    banco.resposta = () => minha(casaRecusada());
    montar();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(within(d).getByRole("button", { name: /Em casa/ }));
    expect(await screen.findByTestId("checkin-recusado-motivo")).toBeInTheDocument();
    expect(screen.queryByTestId("checkin-recusado-reforco")).toBeNull();
  });

  it("barrado → 'Estou em casa' com a meta (ou mínimo 0): fecha com o verde, avisando que o reforço não volta", async () => {
    banco.resposta = (args) =>
      args._modo === "casa"
        ? minha(checkin({ id: "k4", modo: "casa", filial_slug: null, filial_nome: null }), {
            vendas_minimas: 0,
          })
        : minha(barradoFora());
    montar();
    await checkinNaFilial(/Barra Funda/);
    fireEvent.click(await screen.findByRole("button", { name: "Estou em casa" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Check-in feito: Em casa. Você está na roleta hoje.",
      { description: AVISO_FORA_DO_REFORCO },
    );
  });

  it("no computador, sem localização: orienta fazer pelo celular", async () => {
    aparelho("computador");
    geolocalizacao((_ok, erro) => erro({ code: 2, message: "x" } as GeolocationPositionError));
    banco.resposta = () => minha(barradoSemGps());
    montar();
    await checkinNaFilial(/Barra Funda/);
    const motivo = await screen.findByTestId("checkin-barrado-motivo");
    expect(motivo).toHaveTextContent(
      "No computador a localização costuma falhar: faça o check-in pelo celular, de dentro da loja, " +
        "ou peça ao gestor para confirmar no plantão.",
    );
    expect(
      screen.getByRole("heading", { name: /Sem a localização deste computador/ }),
    ).toBeTruthy();
  });

  it("banco ainda sem a 0082 (sem _falha_localizacao): refaz o mesmo check-in sem o porquê", async () => {
    geolocalizacao(negada);
    estado.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "presenca_minha_v1") return { data: banco.atual, error: null };
      if (fn === "presenca_checkin") {
        if ("_falha_localizacao" in args) {
          return {
            data: null,
            error: {
              code: "PGRST202",
              message:
                "Could not find the function public.presenca_checkin(_falha_localizacao, _filial, _modo) in the schema cache",
            },
          };
        }
        banco.atual = minha(barradoSemGps());
        return { data: { ...banco.atual, filiais: [] }, error: null };
      }
      return { data: null, error: null };
    });
    montar();
    await checkinNaFilial(/Barra Funda/);
    expect(await screen.findByTestId("checkin-barrado-motivo")).toHaveTextContent("cadeado");
    const [primeira, segunda] = chamadasCheckin();
    expect(primeira).toMatchObject({ _falha_localizacao: "negada" });
    expect(segunda).not.toHaveProperty("_falha_localizacao");
    expect(segunda).toMatchObject({ _modo: "loja", _filial: "barra-funda" });
    expect(estado.toast.error).not.toHaveBeenCalled();
  });

  it("erro técnico no check-in: mostra o erro (sem toast vermelho repetindo) e deixa seguir sem check-in", async () => {
    estado.rpc.mockImplementation(async (fn: string) => {
      if (fn === "presenca_minha_v1") return { data: minha(), error: null };
      return { data: null, error: { message: "function presenca_checkin does not exist" } };
    });
    const r = montar();
    fireEvent.click(
      within(await screen.findByTestId("checkin-obrigatorio-dialog")).getByRole("button", {
        name: /Em casa/,
      }),
    );
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("function presenca_checkin does not exist");
    expect(estado.toast.error).not.toHaveBeenCalled();
    fireEvent.click(within(alerta).getByRole("button", { name: "Continuar sem check-in" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    // Recarregou a página no mesmo aparelho: continua liberado hoje.
    r.unmount();
    montar();
    await leituraFeita();
    await new Promise((res) => setTimeout(res, 20));
    expect(dialogo()).toBeNull();
  });
});

describe("erro técnico com o barrado na tela", () => {
  it("'Estou em casa' (ou 'Tentar de novo') dá erro: 'Não foi possível registrar o check-in: …', e o barrado e as saídas continuam", async () => {
    banco.resposta = () => minha(barradoFora());
    montar();
    await checkinNaFilial(/Barra Funda/);
    await screen.findByTestId("checkin-barrado-motivo");
    banco.resposta = () => {
      throw new Error("Failed to fetch");
    };
    fireEvent.click(screen.getByRole("button", { name: "Estou em casa" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível registrar o check-in: Failed to fetch");
    expect(alerta).not.toHaveTextContent("tentar de novo");
    expect(estado.toast.error).not.toHaveBeenCalled();
    expect(screen.getByTestId("checkin-barrado-motivo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar fora das roletas" }));
    await waitFor(() => expect(dialogo()).toBeNull());
  });
});

describe("check-in que liberou a roleta chegou de fora: fecha, e nunca é rebaixado", () => {
  it("celular: o diálogo está no computador; o check-in feito no celular aparece ao voltar para a janela → fecha com o verde", async () => {
    montar();
    await screen.findByTestId("checkin-obrigatorio-dialog");
    banco.atual = minha(checkin({ id: "k2" }));
    voltarParaAJanela();
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Check-in feito: Barra Funda. Você está na roleta hoje.",
    );
    expect(chamadasCheckin()).toEqual([]);
    expect(screen.getByTestId("espera")).toHaveTextContent("false");
  });

  it("celular: sem voltar à janela, a releitura de 15 s também fecha", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      montar();
      await screen.findByTestId("checkin-obrigatorio-dialog");
      banco.atual = minha(checkin({ id: "k2" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_500);
      });
      await waitFor(() => expect(dialogo()).toBeNull());
      expect(chamadasCheckin()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("celular: tocou uma opção no computador depois do check-in do celular → relê na hora e fecha SEM chamar a RPC", async () => {
    montar();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    // O celular fez o check-in; o computador ainda não releu.
    banco.atual = minha(checkin({ id: "k2" }));
    fireEvent.click(within(d).getByRole("button", { name: /Em casa/ }));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()).toEqual([]);
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Check-in feito: Barra Funda. Você está na roleta hoje.",
    );
  });

  it("gestão: barrado na tela, a gestão confirma no plantão → ao voltar para a aba, fecha com 'Plantão confirmado'", async () => {
    banco.resposta = () => minha(barradoFora());
    montar();
    await checkinNaFilial(/Barra Funda/);
    await screen.findByTestId("checkin-barrado-motivo");
    banco.atual = minha(confirmadoPelaGestao());
    // react-query relê no "visibilitychange" (aba de volta à frente; o evento
    // sobe do document para a window, onde o react-query escuta).
    act(() => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    });
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Plantão confirmado pela gestão: Barra Funda. Você está na roleta hoje.",
    );
    expect(chamadasCheckin()).toHaveLength(1);
  });

  it("gestão: confirmou, o diálogo ainda não releu e o corretor toca 'Tentar de novo' → não refaz (a confirmação fica)", async () => {
    banco.resposta = () => minha(barradoFora());
    montar();
    await checkinNaFilial(/Barra Funda/);
    await screen.findByTestId("checkin-barrado-motivo");
    banco.atual = minha(confirmadoPelaGestao());
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    // Só o check-in barrado de antes: o "Tentar de novo" não chamou a RPC.
    expect(chamadasCheckin()).toHaveLength(1);
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Plantão confirmado pela gestão: Barra Funda. Você está na roleta hoje.",
    );
  });

  it("gestão: confirmou e o corretor toca 'Estou em casa' → também não refaz", async () => {
    banco.resposta = () => minha(barradoFora());
    montar();
    await checkinNaFilial(/Barra Funda/);
    await screen.findByTestId("checkin-barrado-motivo");
    banco.atual = minha(confirmadoPelaGestao());
    fireEvent.click(screen.getByRole("button", { name: "Estou em casa" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(chamadasCheckin()).toHaveLength(1);
  });

  it("interruptor da gestão (liberado) com o barrado na tela: fecha com 'Liberado pela gestão'", async () => {
    banco.resposta = () => minha(barradoSemGps());
    montar();
    await checkinNaFilial(/Barra Funda/);
    await screen.findByTestId("checkin-barrado-motivo");
    banco.atual = minha(
      checkin({
        id: "k8",
        modo: "liberado_gestao",
        filial_slug: null,
        filial_nome: null,
        localizacao: null,
        origem: "gestao",
      }),
    );
    voltarParaAJanela();
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Liberado pela gestão: você está na roleta hoje.",
    );
  });

  it("a releitura que só traz o mesmo barrado não fecha nada", async () => {
    banco.resposta = () => minha(barradoFora());
    montar();
    await checkinNaFilial(/Barra Funda/);
    await screen.findByTestId("checkin-barrado-motivo");
    voltarParaAJanela();
    await new Promise((res) => setTimeout(res, 30));
    expect(dialogo()).toBeInTheDocument();
    expect(estado.toast.success).not.toHaveBeenCalled();
  });
});

describe("a faixa do barrado relê e some quando o check-in passa a valer", () => {
  const leituras = () => estado.rpc.mock.calls.filter(([fn]) => fn === "presenca_minha_v1").length;

  it("a gestão confirma no plantão: a faixa some ao voltar para a janela", async () => {
    banco.atual = minha(barradoFora());
    montar({ faixa: true });
    await screen.findByTestId("faixa-checkin-barrado");
    banco.atual = minha(confirmadoPelaGestao());
    voltarParaAJanela();
    await waitFor(() => expect(screen.queryByTestId("faixa-checkin-barrado")).toBeNull());
    // Nada de "Faça o check-in" no lugar: o check-in de hoje vale.
    expect(screen.queryByTestId("faixa-checkin")).toBeNull();
    expect(dialogo()).toBeNull();
  });

  it("o interruptor libera: a faixa some sozinha na releitura de 15 s (sem foco)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      banco.atual = minha(barradoSemGps());
      montar({ faixa: true });
      await screen.findByTestId("faixa-checkin-barrado");
      banco.atual = minha(
        checkin({
          id: "k8",
          modo: "liberado_gestao",
          filial_slug: null,
          filial_nome: null,
          localizacao: null,
          origem: "gestao",
        }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_500);
      });
      await waitFor(() => expect(screen.queryByTestId("faixa-checkin-barrado")).toBeNull());
      // Valendo, ninguém fica relendo.
      const depois = leituras();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });
      expect(leituras()).toBe(depois);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a faixa de quem encerrou a presença não fica relendo (só o barrado relê)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      banco.atual = minha(checkin({ encerrado_em: `${HOJE}T15:00:00Z` }));
      montar({ faixa: true });
      await screen.findByTestId("faixa-checkin");
      const antes = leituras();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });
      voltarParaAJanela();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(leituras()).toBe(antes);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("regras puras", () => {
  const p = (c: Checkin) => parseMinhaPresenca(minha(c));
  const base = {
    carregando: false,
    ehCorretor: true,
    erro: false,
    aguardandoReleitura: false,
    liberadoPorFalha: false,
  };

  it("pendente só sem nenhum check-in hoje; null enquanto não dá para saber", () => {
    expect(checkinObrigatorioPendente({ ...base, presenca: p(null) })).toBe(true);
    expect(checkinObrigatorioPendente({ ...base, presenca: p(checkin()) })).toBe(false);
    expect(
      checkinObrigatorioPendente({ ...base, presenca: p(checkin({ encerrado_em: "x" })) }),
    ).toBe(false);
    expect(checkinObrigatorioPendente({ ...base, presenca: undefined })).toBeNull();
    expect(checkinObrigatorioPendente({ ...base, carregando: true, presenca: p(null) })).toBeNull();
    expect(
      checkinObrigatorioPendente({ ...base, aguardandoReleitura: true, presenca: p(null) }),
    ).toBeNull();
    expect(checkinObrigatorioPendente({ ...base, ehCorretor: false, presenca: undefined })).toBe(
      false,
    );
    expect(checkinObrigatorioPendente({ ...base, erro: true, presenca: undefined })).toBe(false);
    expect(checkinObrigatorioPendente({ ...base, liberadoPorFalha: true, presenca: p(null) })).toBe(
      false,
    );
  });

  it("desfecho: na roleta fecha; casa abaixo do mínimo libera; localização barra", () => {
    expect(desfechoCheckin(p(checkin()))).toBe("na_roleta");
    expect(
      desfechoCheckin(
        p(checkin({ modo: "casa", apto_roleta: false, motivo: "casa_abaixo_minimo_vendas" })),
      ),
    ).toBe("recusado");
    expect(desfechoCheckin(p(checkin({ apto_roleta: false, motivo: "fora_da_filial" })))).toBe(
      "barrado",
    );
    expect(desfechoCheckin(p(checkin({ apto_roleta: false, motivo: "sem_localizacao" })))).toBe(
      "barrado",
    );
  });
});

describe("obterLocalizacao: por que o celular não deu a posição", () => {
  it("mapeia os códigos do navegador e o navegador sem suporte", async () => {
    expect(falhaDoCodigo(1)).toBe("negada");
    expect(falhaDoCodigo(2)).toBe("indisponivel");
    expect(falhaDoCodigo(3)).toBe("tempo");

    for (const [code, falha] of [
      [1, "negada"],
      [2, "indisponivel"],
      [3, "tempo"],
    ] as const) {
      geolocalizacao((_ok, erro) => erro({ code, message: "x" } as GeolocationPositionError));
      await expect(obterLocalizacao()).resolves.toEqual({ ok: false, falha });
    }

    geolocalizacao(naLoja);
    await expect(obterLocalizacao()).resolves.toEqual({
      ok: true,
      lat: -23.52,
      lng: -46.677,
      precisao: 15,
    });

    geolocalizacao(undefined);
    await expect(obterLocalizacao()).resolves.toEqual({ ok: false, falha: "sem_suporte" });
  });

  it("aparelho que nunca responde: desiste depois do prazo (o botão não gira para sempre)", async () => {
    vi.useFakeTimers();
    try {
      geolocalizacao(() => {});
      const leitura = obterLocalizacao(1_000);
      await vi.advanceTimersByTimeAsync(21_000);
      await expect(leitura).resolves.toEqual({ ok: false, falha: "tempo" });
    } finally {
      vi.useRealTimers();
    }
  });
});
