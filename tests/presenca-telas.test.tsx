// Presença por filial — o card de /presenca (e Meu Perfil) e o quadro da
// gestão, renderizados. A regra é do banco; aqui se trava o que a tela mostra:
// a confirmação antes da filial também no card, a mesma proteção do diálogo
// (um check-in que já liberou a roleta sem o corretor ver nunca é refeito), a
// releitura do card barrado, a régua das vendas que não empurra quem está em
// casa para uma filial, o aviso do reforço perdido depois de um barrado, e o
// quadro cujo cabeçalho de filial conta só os válidos (os barrados num selo ao
// lado) e sinaliza quem foi barrado e trocou para casa.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const estado = vi.hoisted(() => ({
  rpc: vi.fn(),
  checkinsDoDia: [] as Record<string, unknown>[],
  filtros: [] as [string, unknown][],
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

/** Uma consulta encadeável (select/eq/order) que resolve com `linhas`. */
function consulta(linhas: () => unknown[]) {
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => {
      estado.filtros.push([col, v]);
      return q;
    },
    order: () => q,
    then: (ok: (r: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: linhas(), error: null }).then(ok),
  };
  return q;
}

const FILIAIS_TABELA = [
  { id: "f1", slug: "barra-funda", nome: "Barra Funda", ativa: true, ordem: 1, raio_metros: 300 },
  { id: "f2", slug: "liberdade", nome: "Liberdade", ativa: true, ordem: 2, raio_metros: 300 },
  { id: "f3", slug: "belem", nome: "Belém", ativa: true, ordem: 3, raio_metros: 300 },
];

vi.mock("sonner", () => ({ toast: estado.toast }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "c1" }, session: null, loading: false }),
  useUserRoles: () => ({ isCorretor: true, loading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: estado.rpc, from: () => consulta(() => estado.checkinsDoDia) },
}));
vi.mock("@/integrations/supabase/pendentes", () => ({
  supabasePendente: { rpc: estado.rpc, from: () => consulta(() => FILIAIS_TABELA) },
}));
vi.mock("@/lib/error-tracking-browser", () => ({ captureClientError: vi.fn() }));

import { CheckinCard } from "@/features/presenca/checkin-card";
import { PresencaQuadro } from "@/features/presenca/presenca-quadro";
import { AVISO_FORA_DO_REFORCO } from "@/features/presenca/presenca-derive";

const HOJE = "2026-10-13";
const FILIAIS = FILIAIS_TABELA.map((f) => ({
  slug: f.slug,
  nome: f.nome,
  endereco: null,
  tem_coordenadas: true,
  raio_metros: 300,
}));

function minha(checkin: Record<string, unknown> | null, over: Record<string, unknown> = {}) {
  return {
    dia: HOJE,
    presente: !!checkin && checkin.apto_roleta === true,
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

let atual = minha(null);

beforeEach(() => {
  atual = minha(null);
  estado.checkinsDoDia = [];
  estado.filtros = [];
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((ok: PositionCallback) =>
        ok({
          coords: { latitude: -23.52, longitude: -46.677, accuracy: 15 },
        } as GeolocationPosition),
      ),
    },
  });
  estado.rpc.mockImplementation(async (fn: string) => {
    if (fn === "presenca_minha_v1") return { data: atual, error: null };
    if (fn === "presenca_checkin") {
      atual = minha({
        id: "k1",
        modo: "loja",
        filial_slug: "liberdade",
        filial_nome: "Liberdade",
        apto_roleta: true,
        origem: "corretor",
        criado_em: `${HOJE}T12:00:00Z`,
        encerrado_em: null,
      });
      return { data: atual, error: null };
    }
    return { data: [], error: null };
  });
});

afterEach(() => {
  cleanup();
  estado.rpc.mockReset();
  for (const f of Object.values(estado.toast)) f.mockReset();
});

function montar(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const chamadasCheckin = () => estado.rpc.mock.calls.filter(([fn]) => fn === "presenca_checkin");
const leiturasMinha = () =>
  estado.rpc.mock.calls.filter(([fn]) => fn === "presenca_minha_v1").length;

/** Check-in na Barra Funda barrado: o navegador não deu a localização. */
const barradoSemGps = () => ({
  id: "k0",
  modo: "loja",
  filial_slug: "barra-funda",
  filial_nome: "Barra Funda",
  apto_roleta: false,
  motivo: "sem_localizacao",
  localizacao: "sem_localizacao",
  distancia_m: null,
  precisao_m: null,
  origem: "corretor",
  criado_em: `${HOJE}T11:00:00Z`,
  encerrado_em: null,
});
/** A gestão confirmou no plantão (presenca_checkin com _corretor_id). */
const confirmadoPelaGestao = () => ({
  id: "k9",
  modo: "loja",
  filial_slug: "barra-funda",
  filial_nome: "Barra Funda",
  apto_roleta: true,
  motivo: null,
  localizacao: "confirmada_gestao",
  distancia_m: null,
  precisao_m: null,
  origem: "gestao",
  criado_em: `${HOJE}T11:30:00Z`,
  encerrado_em: null,
});

describe("card de check-in (/presenca, Meu Perfil)", () => {
  it("a filial pede confirmação também aqui; Voltar não faz nada; 'Estou na loja' faz o check-in", async () => {
    montar(<CheckinCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Liberdade/ }));
    expect(screen.getByText("Você está dentro da loja Liberdade agora?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(chamadasCheckin()).toHaveLength(0);
    expect(screen.getByText("Onde você está trabalhando hoje?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Liberdade/ }));
    fireEvent.click(screen.getByRole("button", { name: "Estou na loja" }));
    await waitFor(() => expect(chamadasCheckin()).toHaveLength(1));
    expect(chamadasCheckin()[0][1]).toMatchObject({ _modo: "loja", _filial: "liberdade" });
    expect(await screen.findByText("Liberdade — na roleta")).toBeInTheDocument();
    // A escolha que liberou a roleta aparece marcada.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Liberdade/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("já na roleta nesta filial (a gestão confirmou no plantão): tocar de novo não refaz o check-in", async () => {
    atual = minha({
      id: "k9",
      modo: "loja",
      filial_slug: "barra-funda",
      filial_nome: "Barra Funda",
      apto_roleta: true,
      localizacao: "confirmada_gestao",
      origem: "gestao",
      criado_em: `${HOJE}T12:00:00Z`,
      encerrado_em: null,
    });
    montar(<CheckinCard />);
    const barra = await screen.findByRole("button", { name: /Barra Funda/ });
    expect(barra).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(barra);
    expect(screen.queryByText(/Você está dentro da loja/)).toBeNull();
    expect(chamadasCheckin()).toHaveLength(0);
    expect(estado.toast.info).toHaveBeenCalledWith(
      "Você já está na roleta hoje: Barra Funda (plantão confirmado pela gestão).",
    );
  });

  it("barrado na tela → a gestão confirma no plantão → tocar a filial e 'Estou na loja' NÃO chama a RPC (a confirmação fica)", async () => {
    atual = minha(barradoSemGps());
    montar(<CheckinCard />);
    expect(await screen.findByText("Barra Funda — fora da roleta")).toBeInTheDocument();
    // A gestão confirma; o card ainda não releu (nem 15 s, nem foco).
    atual = minha(confirmadoPelaGestao());
    fireEvent.click(screen.getByRole("button", { name: /Barra Funda/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Estou na loja" }));
    await waitFor(() =>
      expect(estado.toast.info).toHaveBeenCalledWith(
        "Você já está na roleta hoje: Barra Funda (plantão confirmado pela gestão).",
      ),
    );
    expect(chamadasCheckin()).toHaveLength(0);
    // Desde 13/10 a leitura do GPS sai no toque de "Estou na loja" (o
    // navegador só mostra o pedido de permissão de dentro do gesto — decisão
    // do dono, "Pedir localização no check-in") e corre junto com a releitura;
    // como a gestão já confirmou, ela é descartada: nada é gravado.
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
    // A confirmação some e o card mostra o que vale agora.
    expect(screen.queryByRole("button", { name: "Estou na loja" })).toBeNull();
    expect(await screen.findByText("Barra Funda — na roleta")).toBeInTheDocument();
    expect(screen.getByText("Confirmado pela gestão")).toBeInTheDocument();
  });

  it("barrado na tela → o interruptor libera → 'Em casa' também não refaz", async () => {
    atual = minha(barradoSemGps());
    montar(<CheckinCard />);
    await screen.findByText("Barra Funda — fora da roleta");
    atual = minha({
      ...confirmadoPelaGestao(),
      id: "k8",
      modo: "liberado_gestao",
      filial_slug: null,
      filial_nome: null,
      localizacao: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /Em casa/ }));
    await waitFor(() =>
      expect(estado.toast.info).toHaveBeenCalledWith(
        "Você já está na roleta hoje: liberado pela gestão.",
      ),
    );
    expect(chamadasCheckin()).toHaveLength(0);
  });

  it("barrado na tela: o card relê sozinho (foco da janela e 15 s) e sai do 'fora da roleta' quando a gestão confirma", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      atual = minha(barradoSemGps());
      montar(<CheckinCard />);
      await screen.findByText("Barra Funda — fora da roleta");
      const leituras = leiturasMinha();
      // A releitura de 15 s, sem nada mudar: continua barrado.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_500);
      });
      expect(leiturasMinha()).toBeGreaterThan(leituras);
      expect(screen.getByText("Barra Funda — fora da roleta")).toBeInTheDocument();
      // A gestão confirma; o corretor volta para a janela.
      atual = minha(confirmadoPelaGestao());
      act(() => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(await screen.findByText("Barra Funda — na roleta")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Barra Funda/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      // Valendo, o card para de reler.
      const depois = leiturasMinha();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });
      expect(leiturasMinha()).toBe(depois);
      // E tocar a filial agora só avisa: nada de refazer a confirmação.
      fireEvent.click(screen.getByRole("button", { name: /Barra Funda/ }));
      expect(estado.toast.info).toHaveBeenCalledWith(
        "Você já está na roleta hoje: Barra Funda (plantão confirmado pela gestão).",
      );
      expect(chamadasCheckin()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("barrado na tela e a releitura falha (rede): o card continua com o último dado, e a próxima releitura segue", async () => {
    atual = minha(barradoSemGps());
    montar(<CheckinCard />);
    await screen.findByText("Barra Funda — fora da roleta");
    const ler = estado.rpc.getMockImplementation()!;
    estado.rpc.mockImplementation(async (fn: string, args?: unknown) =>
      fn === "presenca_minha_v1"
        ? { data: null, error: { message: "Failed to fetch" } }
        : ler(fn, args),
    );
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(leiturasMinha()).toBeGreaterThan(1));
    await new Promise((res) => setTimeout(res, 20));
    expect(screen.getByText("Barra Funda — fora da roleta")).toBeInTheDocument();
    expect(screen.queryByText("Não foi possível carregar o seu check-in.")).toBeNull();
    // A leitura volta com a confirmação da gestão.
    estado.rpc.mockImplementation(ler);
    atual = minha(confirmadoPelaGestao());
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByText("Barra Funda — na roleta")).toBeInTheDocument();
  });

  it("sem barrado, o card não fica relendo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      montar(<CheckinCard />);
      await screen.findByText("Você ainda não fez o check-in de hoje");
      const leituras = leiturasMinha();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });
      act(() => {
        window.dispatchEvent(new Event("focus"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(leiturasMinha()).toBe(leituras);
    } finally {
      vi.useRealTimers();
    }
  });

  it("já na roleta e VENDO isso no card: trocar de filial é de propósito e segue", async () => {
    atual = minha({
      id: "k1",
      modo: "loja",
      filial_slug: "barra-funda",
      filial_nome: "Barra Funda",
      apto_roleta: true,
      localizacao: "confirmada",
      origem: "corretor",
      criado_em: `${HOJE}T12:00:00Z`,
      encerrado_em: null,
    });
    montar(<CheckinCard />);
    await screen.findByText("Barra Funda — na roleta");
    fireEvent.click(screen.getByRole("button", { name: /Liberdade/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Estou na loja" }));
    await waitFor(() => expect(chamadasCheckin()).toHaveLength(1));
    expect(chamadasCheckin()[0][1]).toMatchObject({ _modo: "loja", _filial: "liberdade" });
    expect(estado.toast.info).not.toHaveBeenCalled();
  });

  it("régua das vendas: 'a roleta só libera no plantão' (não 'só recebe leads'), e a dica de quem está fora de uma filial", async () => {
    montar(<CheckinCard />);
    expect(await screen.findByText("este mês, a roleta só libera no plantão")).toBeInTheDocument();
    expect(screen.queryByText(/só recebe leads no plantão/)).toBeNull();
    expect(
      screen.getByText("Fora de uma filial (casa, visita, estande)? Escolha Em casa."),
    ).toBeInTheDocument();
  });

  it("barrado na filial (aberto): a filial não aparece marcada; refazer lê a posição na hora", async () => {
    atual = minha({
      id: "k0",
      modo: "loja",
      filial_slug: "liberdade",
      filial_nome: "Liberdade",
      apto_roleta: false,
      motivo: "fora_da_filial",
      localizacao: "fora_do_raio",
      distancia_m: 2100,
      origem: "corretor",
      criado_em: `${HOJE}T11:00:00Z`,
      encerrado_em: null,
    });
    montar(<CheckinCard />);
    const liberdade = await screen.findByRole("button", { name: /Liberdade/ });
    expect(liberdade).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText(/A localização deste aparelho ficou a 2,1 km da filial Liberdade/),
    ).toBeInTheDocument();
    fireEvent.click(liberdade);
    fireEvent.click(screen.getByRole("button", { name: "Estou na loja" }));
    await waitFor(() => expect(chamadasCheckin()).toHaveLength(1));
    const opcoes = (navigator.geolocation.getCurrentPosition as ReturnType<typeof vi.fn>).mock
      .calls[0][2] as PositionOptions;
    expect(opcoes.maximumAge).toBe(0);
  });

  it("'Em casa' depois de um barrado hoje: o card avisa que o reforço não volta (lido dos check-ins do dia)", async () => {
    atual = minha({
      id: "k2",
      modo: "casa",
      filial_slug: null,
      filial_nome: null,
      apto_roleta: false,
      motivo: "casa_abaixo_minimo_vendas",
      origem: "corretor",
      criado_em: `${HOJE}T12:05:00Z`,
      encerrado_em: null,
    });
    estado.checkinsDoDia = [
      {
        corretor_id: "c1",
        modo: "loja",
        apto_roleta: false,
        motivo: "sem_localizacao",
        created_at: `${HOJE}T12:00:00Z`,
      },
      {
        corretor_id: "c1",
        modo: "casa",
        apto_roleta: false,
        motivo: "casa_abaixo_minimo_vendas",
        created_at: `${HOJE}T12:05:00Z`,
      },
    ];
    montar(<CheckinCard />);
    expect(await screen.findByText(new RegExp(AVISO_FORA_DO_REFORCO.slice(0, 40)))).toBeTruthy();
    // Só os check-ins de hoje, só os dele.
    expect(estado.filtros).toEqual(
      expect.arrayContaining([
        ["dia", HOJE],
        ["corretor_id", "c1"],
      ]),
    );
  });
});

describe("quadro da gestão", () => {
  const linha = (over: Record<string, unknown>) => ({
    corretor_id: String(over.nome),
    avatar_url: null,
    presente: false,
    modo: null,
    filial_slug: null,
    filial_nome: null,
    apto_roleta: null,
    motivo: null,
    localizacao: null,
    distancia_m: null,
    origem: null,
    checkin_em: null,
    encerrado_em: null,
    vendas_mes_anterior: 0,
    vendas_minimas: 3,
    ...over,
  });

  it("filial: válidos no número, barrados no selo; o porquê da falha no rótulo; 'fora do reforço hoje' para quem foi barrado e foi para casa", async () => {
    const hoje = [
      linha({
        nome: "Ana",
        modo: "loja",
        filial_slug: "barra-funda",
        filial_nome: "Barra Funda",
        presente: true,
        apto_roleta: true,
        localizacao: "confirmada",
      }),
      linha({
        nome: "Bia",
        modo: "loja",
        filial_slug: "barra-funda",
        filial_nome: "Barra Funda",
        apto_roleta: false,
        motivo: "sem_localizacao",
        localizacao: "sem_localizacao",
        falha_localizacao: "negada",
      }),
      linha({
        nome: "Caio",
        modo: "casa",
        apto_roleta: false,
        motivo: "casa_abaixo_minimo_vendas",
      }),
      linha({ nome: "Duda", modo: "casa", apto_roleta: true, presente: true }),
    ];
    estado.rpc.mockImplementation(async (fn: string) =>
      fn === "presenca_hoje_v1" ? { data: hoje, error: null } : { data: null, error: null },
    );
    estado.checkinsDoDia = [
      {
        corretor_id: "Caio",
        modo: "loja",
        apto_roleta: false,
        motivo: "fora_da_filial",
        created_at: "2026-10-13T12:00:00Z",
      },
      {
        corretor_id: "Caio",
        modo: "casa",
        apto_roleta: false,
        motivo: "casa_abaixo_minimo_vendas",
        created_at: "2026-10-13T12:05:00Z",
      },
      {
        corretor_id: "Duda",
        modo: "casa",
        apto_roleta: true,
        motivo: null,
        created_at: "2026-10-13T12:05:00Z",
      },
    ];
    montar(<PresencaQuadro podeOperar={false} />);

    const barra = await screen.findByTestId("contagem-filial:barra-funda");
    expect(barra).toHaveTextContent(/^1\s*1 barrado$/);
    expect(screen.getByTestId("contagem-filial:liberdade")).toHaveTextContent(/^0$/);
    expect(screen.getByText("Barrado: sem localização (permissão negada)")).toBeInTheDocument();
    // Tile e colunas batem: 1 no plantão, 1 fora da conta.
    expect(screen.getByText("Fora da conta: 1 barrado pela localização")).toBeInTheDocument();

    await waitFor(() => expect(screen.getAllByText("fora do reforço hoje")).toHaveLength(1));
    const caio = screen.getByText("Caio").closest("div.rounded-md") as HTMLElement;
    expect(within(caio).getByText("fora do reforço hoje")).toBeInTheDocument();
    const duda = screen.getByText("Duda").closest("div.rounded-md") as HTMLElement;
    expect(within(duda).queryByText("fora do reforço hoje")).toBeNull();
  });

  it("com a precisão na linha (presenca_hoje_v1 desde a 0082): localização por Wi-Fi/IP não vira 'a 8 km da filial'", async () => {
    const hoje = [
      linha({
        nome: "Edu",
        modo: "loja",
        filial_slug: "barra-funda",
        filial_nome: "Barra Funda",
        apto_roleta: false,
        motivo: "fora_da_filial",
        localizacao: "fora_do_raio",
        distancia_m: 8363,
        precisao_m: 5000,
      }),
      linha({
        nome: "Fabi",
        modo: "loja",
        filial_slug: "liberdade",
        filial_nome: "Liberdade",
        apto_roleta: false,
        motivo: "fora_da_filial",
        localizacao: "fora_do_raio",
        distancia_m: 2100,
        precisao_m: 25,
      }),
    ];
    estado.rpc.mockImplementation(async (fn: string) =>
      fn === "presenca_hoje_v1" ? { data: hoje, error: null } : { data: null, error: null },
    );
    montar(<PresencaQuadro podeOperar={false} />);
    expect(await screen.findByText("Barrado: localização imprecisa (±5 km)")).toBeInTheDocument();
    expect(screen.queryByText("Barrado: a 8,4 km da filial")).toBeNull();
    // Com o GPS preciso, a distância vale.
    expect(screen.getByText("Barrado: a 2,1 km da filial")).toBeInTheDocument();
  });
});
