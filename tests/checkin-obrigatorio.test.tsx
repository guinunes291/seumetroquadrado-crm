// Check-in obrigatório (decisão do dono, 12/10/2026: "checkin obrigatório") e
// a localização que barra o check-in fora da filial ("localização deve barrar
// caso não esteja na filial"). A regra de aptidão é do banco
// (tests/db/presenca-filial.test.ts); aqui se trava a TELA: quando o diálogo
// abre, que ele não fecha sozinho, o que mostra quando a localização barra e
// que falha técnica nunca prende o corretor fora do CRM.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const estado = vi.hoisted(() => ({
  rpc: vi.fn(),
  pathname: "/fila",
  papeis: { isCorretor: true, loading: false },
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: estado.toast }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: estado.pathname } }),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "c1" }, session: null, loading: false }),
  useUserRoles: () => estado.papeis,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: estado.rpc } }));
vi.mock("@/integrations/supabase/pendentes", () => ({
  supabasePendente: { rpc: estado.rpc, from: vi.fn() },
}));

import { CheckinObrigatorioGlobal } from "@/features/presenca/checkin-obrigatorio-global";
import {
  checkinObrigatorioPendente,
  desfechoCheckin,
  rotaSemCheckinObrigatorio,
} from "@/features/presenca/checkin-obrigatorio";
import { falhaDoCodigo, obterLocalizacao } from "@/features/presenca/presenca-client";
import { useCheckinObrigatorioPendente } from "@/features/presenca/use-checkin-obrigatorio";
import { parseMinhaPresenca } from "@/features/presenca/presenca-derive";
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

const naLoja = (ok: PositionCallback) =>
  ok({ coords: { latitude: -23.52, longitude: -46.677, accuracy: 15 } } as GeolocationPosition);
const negada = (_ok: PositionCallback, erro: PositionErrorCallback) =>
  erro({ code: 1, message: "denied" } as GeolocationPositionError);

beforeEach(() => {
  estado.pathname = "/fila";
  estado.papeis = { isCorretor: true, loading: false };
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
  publicarEstadoTreino({ decidido: true, aberto: false });
});

afterEach(() => {
  cleanup();
  estado.rpc.mockReset();
  for (const f of Object.values(estado.toast)) f.mockReset();
  localStorage.clear();
  publicarEstadoTreino({ decidido: false, aberto: false });
});

/** O que o estudo do funil e as metas do dia enxergam (eles esperam o check-in). */
function Espera() {
  const pendente = useCheckinObrigatorioPendente();
  return <span data-testid="espera">{String(pendente)}</span>;
}

function montar() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
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

describe("quando o diálogo obrigatório abre", () => {
  it("corretor sem check-in hoje: abre com o porquê, as três filiais, Em casa e o aviso da localização", async () => {
    montar();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    expect(within(d).getByText("Para usar o CRM hoje, diga onde você está.")).toBeInTheDocument();
    for (const nome of ["Barra Funda", "Liberdade", "Belém", "Em casa"]) {
      expect(within(d).getByRole("button", { name: new RegExp(nome) })).toBeInTheDocument();
    }
    expect(within(d).getByText(/a localização do celular é conferida/)).toBeInTheDocument();
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
    estado.papeis = { isCorretor: false, loading: false };
    montar();
    await new Promise((r) => setTimeout(r, 20));
    expect(dialogo()).toBeNull();
    expect(estado.rpc).not.toHaveBeenCalled();
  });

  it("com check-in hoje — aberto, encerrado ou barrado — não abre", async () => {
    for (const c of [
      checkin(),
      checkin({ encerrado_em: `${HOJE}T18:00:00Z` }),
      checkin({ apto_roleta: false, motivo: "fora_da_filial", localizacao: "fora_do_raio" }),
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

describe("depois do check-in", () => {
  it("na filial, dentro do raio: fecha com o toast verde", async () => {
    montar();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    expect(screen.getByTestId("espera")).toHaveTextContent("true");
    fireEvent.click(within(d).getByRole("button", { name: /Barra Funda/ }));
    await waitFor(() => expect(dialogo()).toBeNull());
    const chamada = estado.rpc.mock.calls.find(([fn]) => fn === "presenca_checkin");
    expect(chamada?.[1]).toMatchObject({
      _modo: "loja",
      _filial: "barra-funda",
      _latitude: -23.52,
    });
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Check-in feito: Barra Funda. Você está na roleta hoje.",
    );
    // Fechou e não volta: o check-in de hoje existe — e o que vem depois segue.
    await new Promise((res) => setTimeout(res, 20));
    expect(dialogo()).toBeNull();
    expect(screen.getByTestId("espera")).toHaveTextContent("false");
  });

  it("fora da filial: mostra a distância, que só vale de dentro da loja, e as três saídas — sem toast verde", async () => {
    banco.resposta = () =>
      minha(
        checkin({
          apto_roleta: false,
          motivo: "fora_da_filial",
          localizacao: "fora_do_raio",
          distancia_m: 5830,
        }),
      );
    montar();
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.click(within(d).getByRole("button", { name: /Barra Funda/ }));
    const motivo = await screen.findByTestId("checkin-barrado-motivo");
    expect(motivo).toHaveTextContent(
      "Você está a 5,8 km da filial Barra Funda. O check-in na filial só vale de dentro da loja. " +
        "Se você está na loja, peça ao gestor para confirmar no plantão.",
    );
    const aberto = screen.getByTestId("checkin-obrigatorio-dialog");
    for (const nome of ["Tentar de novo", "Estou em casa", "Continuar sem receber leads"]) {
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
    // Seguir sem leads fecha e não reabre; aí o estudo e as metas seguem.
    fireEvent.click(within(aberto).getByRole("button", { name: "Continuar sem receber leads" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    await new Promise((res) => setTimeout(res, 20));
    expect(dialogo()).toBeNull();
    expect(screen.getByTestId("espera")).toHaveTextContent("false");
  });

  it("barrado → Escolher outra filial: volta às opções, e a saída sem leads continua lá", async () => {
    banco.resposta = () =>
      minha(
        checkin({
          apto_roleta: false,
          motivo: "fora_da_filial",
          localizacao: "fora_do_raio",
          distancia_m: 2100,
        }),
      );
    montar();
    fireEvent.click(
      within(await screen.findByTestId("checkin-obrigatorio-dialog")).getByRole("button", {
        name: /Barra Funda/,
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Escolher outra filial" }));
    const d = screen.getByTestId("checkin-obrigatorio-dialog");
    expect(within(d).getByRole("button", { name: /Liberdade/ })).toBeInTheDocument();
    fireEvent.click(within(d).getByRole("button", { name: "Continuar sem receber leads" }));
    await waitFor(() => expect(dialogo()).toBeNull());
  });

  it("barrado → Tentar de novo na mesma filial: já dentro do raio, fecha", async () => {
    let tentativas = 0;
    banco.resposta = (args) => {
      tentativas += 1;
      const filial = { filial_slug: args._filial, filial_nome: "Liberdade" };
      return tentativas === 1
        ? minha(
            checkin({
              ...filial,
              apto_roleta: false,
              motivo: "fora_da_filial",
              localizacao: "fora_do_raio",
              distancia_m: 900,
            }),
          )
        : minha(checkin(filial));
    };
    montar();
    fireEvent.click(
      within(await screen.findByTestId("checkin-obrigatorio-dialog")).getByRole("button", {
        name: /Liberdade/,
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    const filiais = estado.rpc.mock.calls
      .filter(([fn]) => fn === "presenca_checkin")
      .map(([, a]) => (a as { _filial?: string })._filial);
    expect(filiais).toEqual(["liberdade", "liberdade"]);
  });

  it("sem localização porque o navegador negou: ensina a liberar; 'Estou em casa' abaixo do mínimo mostra o motivo e libera", async () => {
    geolocalizacao(negada);
    banco.resposta = (args) =>
      args._modo === "casa"
        ? minha(
            checkin({
              modo: "casa",
              filial_slug: null,
              filial_nome: null,
              apto_roleta: false,
              motivo: "casa_abaixo_minimo_vendas",
              localizacao: null,
              distancia_m: null,
            }),
          )
        : minha(
            checkin({
              apto_roleta: false,
              motivo: "sem_localizacao",
              localizacao: "sem_localizacao",
              distancia_m: null,
            }),
          );
    montar();
    fireEvent.click(
      within(await screen.findByTestId("checkin-obrigatorio-dialog")).getByRole("button", {
        name: /Belém/,
      }),
    );
    const motivo = await screen.findByTestId("checkin-barrado-motivo");
    expect(motivo).toHaveTextContent("cadeado");
    expect(motivo).toHaveTextContent("Localização → Permitir");
    // Para o banco nada muda: sem coordenada.
    const loja = estado.rpc.mock.calls.find(([fn]) => fn === "presenca_checkin")?.[1];
    expect(loja).toMatchObject({ _modo: "loja", _filial: "belem", _latitude: undefined });

    fireEvent.click(screen.getByRole("button", { name: "Estou em casa" }));
    const recusa = await screen.findByTestId("checkin-recusado-motivo");
    expect(recusa).toHaveTextContent(
      "Em casa, a roleta só libera com 3 vendas aprovadas em setembro",
    );
    expect(recusa).toHaveTextContent("é preciso estar numa filial");
    // Cumpriu o check-in com sinceridade: o CRM está liberado (ESC fecha).
    fireEvent.keyDown(screen.getByTestId("checkin-obrigatorio-dialog"), { key: "Escape" });
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(estado.toast.success).not.toHaveBeenCalled();
  });

  it("erro técnico no check-in: mostra o erro e deixa seguir sem check-in (não volta a prender hoje)", async () => {
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
