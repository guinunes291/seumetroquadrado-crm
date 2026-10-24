// Bloco de check-in na barra lateral e o diálogo voluntário (pedido do dono,
// 13/10/2026). Aqui, as regras puras do pedido de check-in e do diálogo
// voluntário: para onde vai um pedido (abrir, o card atende, esperar,
// descartar), quando o diálogo prende, o que a descrição diz e por quanto
// tempo um pedido vale. E a TELA do bloco: só para o papel corretor, o estado
// sempre em texto (a cor da bolinha nunca é a única pista), a barra recolhida
// que sempre abre o diálogo, nenhuma leitura nova da presença (sem polling),
// ids que não se repetem com o Sheet do celular aberto, o foco que não volta
// ao ☰ por cima do diálogo, e o "Refazer check-in" que abre o diálogo no
// barrado. O bloco nunca chama a RPC do check-in: só pede.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  descricaoDoDialogo,
  destinoDoPedido,
  dialogoBloqueante,
} from "@/features/presenca/checkin-obrigatorio";
import { parseMinhaPresenca } from "@/features/presenca/presenca-derive";
import {
  _reiniciarPedidoCheckin,
  houvePedidoCheckinRecente,
  pedidoVigente,
  pedirCheckin,
  pedirCheckinNoToque,
  usePedidoCheckin,
  VALIDADE_PEDIDO_MS,
} from "@/features/presenca/use-checkin-obrigatorio";
import { CheckinLateral } from "@/features/presenca/checkin-lateral";
import { CheckinPendenteBanner } from "@/features/presenca/checkin-pendente-banner";
import { CheckinObrigatorioGlobal } from "@/features/presenca/checkin-obrigatorio-global";
import { AppSidebar, MobileSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { publicarEstadoTreino } from "@/features/onboarding/treino-estado";
import { INTENT_DOT, INTENT_DOT_NAVY } from "@/lib/status-tones";
import { CheckinCard } from "@/features/presenca/checkin-card";

const tela = vi.hoisted(() => ({
  rpc: vi.fn(),
  pathname: "/fila",
  papeis: {
    isCorretor: true,
    isGestor: false,
    isAdmin: false,
    isSuperintendente: false,
    roles: ["corretor"],
    loading: false,
  },
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  capture: vi.fn(),
}));

/** Uma consulta encadeável (select/order/eq) que resolve vazia. */
function consultaVazia() {
  const q = {
    select: () => q,
    order: () => q,
    eq: () => q,
    then: (ok: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(ok),
  };
  return q;
}

vi.mock("sonner", () => ({ toast: tela.toast }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (s: { location: { pathname: string; search: Record<string, unknown> } }) => unknown;
  }) => select({ location: { pathname: tela.pathname, search: {} } }),
  useLocation: () => ({ pathname: tela.pathname }),
  // search/params do Link de verdade não vão para o <a>.
  Link: ({
    to,
    children,
    search,
    params,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    search?: unknown;
    params?: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "c1", email: "corretor@teste", user_metadata: { full_name: "Corretor Teste" } },
    session: null,
    loading: false,
  }),
  useUserRoles: () => tela.papeis,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: tela.rpc, from: () => consultaVazia(), auth: { signOut: vi.fn() } },
}));
vi.mock("@/integrations/supabase/pendentes", () => ({
  supabasePendente: { rpc: tela.rpc, from: () => consultaVazia() },
}));
vi.mock("@/lib/error-tracking-browser", () => ({ captureClientError: tela.capture }));
// O resto da barra lateral (badges, flags da Academia, preferência do
// trilho) não é assunto aqui: sem rede, sem RPC.
vi.mock("@/features/nav/use-nav-badges", () => ({ useNavBadges: () => null }));
vi.mock("@/features/academia/use-flags-nav", () => ({ useFlagsNav: () => new Set<string>() }));
vi.mock("@/hooks/use-preference", async () => {
  const { useState } = await import("react");
  return { usePreference: <T,>(_chave: string, padrao: T) => useState<T>(padrao) };
});

afterEach(() => {
  _reiniciarPedidoCheckin();
});

const presenca = (checkin: Record<string, unknown> | null, over: Record<string, unknown> = {}) =>
  parseMinhaPresenca({
    dia: "2026-10-13",
    presente: !!checkin && checkin.apto_roleta === true && !checkin.encerrado_em,
    mes_referencia: "2026-09-01",
    vendas_mes_anterior: 2,
    vendas_minimas: 3,
    casa_liberada: false,
    exige_localizacao: true,
    checkin,
    filiais: [],
    ...over,
  });
const checkin = (over: Record<string, unknown> = {}) => ({
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
  criado_em: "2026-10-13T12:00:00Z",
  encerrado_em: null,
  ...over,
});

describe("regras puras do pedido e do diálogo voluntário", () => {
  it("destinoDoPedido: as 6 saídas, nesta ordem", () => {
    const base = {
      vigente: true,
      pathname: "/fila",
      treinoDecidido: true,
      treinoAberto: false,
      presencaPronta: true,
      dialogoAberto: false,
    };
    expect(destinoDoPedido(base)).toBe("abrir");
    // Vencido: descarta, mesmo em /presenca.
    expect(destinoDoPedido({ ...base, vigente: false, pathname: "/presenca" })).toBe("descartar");
    // /presenca e /meu-perfil: o card atende (mesmo com o treino na tela).
    expect(destinoDoPedido({ ...base, pathname: "/presenca" })).toBe("card");
    expect(destinoDoPedido({ ...base, pathname: "/meu-perfil/x", treinoAberto: true })).toBe(
      "card",
    );
    // O treino do onboarding na tela: nada abre por cima dele.
    expect(destinoDoPedido({ ...base, treinoAberto: true })).toBe("descartar");
    // O diálogo já está aberto.
    expect(destinoDoPedido({ ...base, dialogoAberto: true })).toBe("descartar");
    // O treino ainda não decidiu, ou a presença não chegou: espera.
    expect(destinoDoPedido({ ...base, treinoDecidido: false })).toBe("esperar");
    expect(destinoDoPedido({ ...base, presencaPronta: false })).toBe("esperar");
    // /modo-visita (tela cheia de campo): o pedido abre, fechável.
    expect(destinoDoPedido({ ...base, pathname: "/modo-visita" })).toBe("abrir");
  });

  it("dialogoBloqueante: o obrigatório prende (menos o recusado); o voluntário nunca, até o dia virar", () => {
    expect(dialogoBloqueante({ modo: "obrigatorio", deveAbrir: true, tela: "opcoes" })).toBe(true);
    expect(dialogoBloqueante({ modo: "obrigatorio", deveAbrir: false, tela: "barrado" })).toBe(
      true,
    );
    expect(dialogoBloqueante({ modo: "obrigatorio", deveAbrir: true, tela: "recusado" })).toBe(
      false,
    );
    for (const tela of ["opcoes", "confirmar", "aviso", "barrado", "recusado"]) {
      expect(dialogoBloqueante({ modo: "voluntario", deveAbrir: false, tela })).toBe(false);
    }
    expect(dialogoBloqueante({ modo: "voluntario", deveAbrir: true, tela: "opcoes" })).toBe(true);
  });

  it("descricaoDoDialogo: obrigatório como antes; voluntário diz onde o corretor está agora", () => {
    expect(descricaoDoDialogo(presenca(null), "obrigatorio")).toBe(
      "Para usar o CRM hoje, diga onde você está.",
    );
    expect(descricaoDoDialogo(presenca(checkin()), "obrigatorio")).toBe(
      "Para usar o CRM hoje, diga onde você está.",
    );
    expect(descricaoDoDialogo(presenca(null), "voluntario")).toBe(
      "Diga onde você está para entrar nas roletas.",
    );
    expect(
      descricaoDoDialogo(presenca(checkin({ encerrado_em: "2026-10-13T21:02:00Z" })), "voluntario"),
    ).toBe(
      "Agora: Barra Funda · saiu às 18:02 — presença encerrada. Escolha onde você está para voltar às roletas.",
    );
    expect(
      descricaoDoDialogo(presenca(checkin({ criado_em: "2026-10-13T12:31:00Z" })), "voluntario"),
    ).toBe("Agora: Barra Funda · 09:31 — nas roletas. Para trocar, escolha onde você está.");
    expect(
      descricaoDoDialogo(
        presenca(
          checkin({
            apto_roleta: false,
            motivo: "sem_localizacao",
            localizacao: "sem_localizacao",
          }),
        ),
        "voluntario",
      ),
    ).toBe(
      "Agora: Barra Funda · 09:00 — barrado: sem localização. Para trocar, escolha onde você está.",
    );
  });

  it("houvePedidoCheckinRecente: janela de 2 s, atendido ou não", () => {
    expect(houvePedidoCheckinRecente()).toBe(false);
    // Relógio parado: o pedido e o "agora" do teste caem no mesmo milissegundo.
    // Com o relógio real, um tique entre os dois empurrava a borda de 2 s para
    // 2001 ms e o teste falhava de vez em quando (máquina carregada).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
    pedirCheckin({ acao: "abrir", origem: "lateral" });
    const agora = Date.now();
    vi.useRealTimers();
    expect(houvePedidoCheckinRecente(agora)).toBe(true);
    expect(houvePedidoCheckinRecente(agora + 2_000)).toBe(true);
    expect(houvePedidoCheckinRecente(agora + 2_001)).toBe(false);
    // Relógio que volta.
    expect(houvePedidoCheckinRecente(agora - 5_000)).toBe(false);
    _reiniciarPedidoCheckin();
    expect(houvePedidoCheckinRecente(agora)).toBe(false);
  });

  it("pedidoVigente: até 15 s; relógio que volta = vencido", () => {
    const p = { id: 1, acao: "abrir" as const, origem: "faixa" as const, em: 100_000 };
    expect(VALIDADE_PEDIDO_MS).toBe(15_000);
    expect(pedidoVigente(p, 100_000)).toBe(true);
    expect(pedidoVigente(p, 115_000)).toBe(true);
    expect(pedidoVigente(p, 115_001)).toBe(false);
    expect(pedidoVigente(p, 99_999)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A tela do bloco
// ---------------------------------------------------------------------------

const HOJE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const FILIAIS = [
  { slug: "barra-funda", nome: "Barra Funda", endereco: null, tem_coordenadas: true },
  { slug: "liberdade", nome: "Liberdade", endereco: null, tem_coordenadas: true },
  { slug: "belem", nome: "Belém", endereco: null, tem_coordenadas: true },
].map((f) => ({ ...f, raio_metros: 300 }));

type CheckinBruto = Record<string, unknown> | null;

/** O que presenca_minha_v1 devolve hoje. */
function minha(c: CheckinBruto = null, over: Record<string, unknown> = {}) {
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
function ck(over: Record<string, unknown> = {}) {
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
const semGps = () =>
  ck({
    id: "ks",
    apto_roleta: false,
    motivo: "sem_localizacao",
    localizacao: "sem_localizacao",
    distancia_m: null,
    precisao_m: null,
  });
const fora = () =>
  ck({
    id: "kb",
    apto_roleta: false,
    motivo: "fora_da_filial",
    localizacao: "fora_do_raio",
    distancia_m: 6096,
  });

/** O banco de mentira: `leitura` é o que presenca_minha_v1 devolve (ou faz). */
const banco = {
  leitura: (): Promise<{ data: unknown; error: unknown }> =>
    Promise.resolve({ data: minha(ck()), error: null }),
};
const devolve = (m: ReturnType<typeof minha>) => {
  banco.leitura = () => Promise.resolve({ data: m, error: null });
};

const leituras = () => tela.rpc.mock.calls.filter(([fn]) => fn === "presenca_minha_v1").length;
const chamadasCheckin = () => tela.rpc.mock.calls.filter(([fn]) => fn === "presenca_checkin");

/** O pedido em aberto ("acao:origem"), para ver o que o bloco pediu. */
function Pedido() {
  const p = usePedidoCheckin();
  return <span data-testid="pedido">{p ? `${p.acao}:${p.origem}` : "nenhum"}</span>;
}

function montarTela(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        {ui}
        <Pedido />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const bloco = () => screen.getByTestId("checkin-lateral");
const bolinha = (el: HTMLElement) => el.querySelector<HTMLElement>("[data-intent]");

describe("o bloco de check-in na barra lateral", () => {
  beforeEach(() => {
    tela.pathname = "/fila";
    tela.papeis = {
      isCorretor: true,
      isGestor: false,
      isAdmin: false,
      isSuperintendente: false,
      roles: ["corretor"],
      loading: false,
    };
    devolve(minha(ck()));
    tela.rpc.mockImplementation((fn: string) =>
      fn === "presenca_minha_v1" ? banco.leitura() : Promise.resolve({ data: null, error: null }),
    );
    publicarEstadoTreino({ decidido: true, aberto: false });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    tela.rpc.mockReset();
    tela.capture.mockReset();
    for (const f of Object.values(tela.toast)) f.mockReset();
    localStorage.clear();
    publicarEstadoTreino({ decidido: false, aberto: false });
  });

  it("corretor e gestor que também é corretor veem o bloco na barra; gestão sem papel corretor: nada, e nenhuma leitura", async () => {
    let r = montarTela(<AppSidebar />);
    expect(await screen.findByTestId("checkin-lateral")).toBeInTheDocument();
    expect(await within(bloco()).findByText("Nas roletas")).toBeInTheDocument();
    r.unmount();

    tela.papeis = { ...tela.papeis, isGestor: true, roles: ["gestor", "corretor"] };
    r = montarTela(<AppSidebar />);
    expect(await screen.findByTestId("checkin-lateral")).toBeInTheDocument();
    r.unmount();

    tela.rpc.mockClear();
    tela.papeis = { ...tela.papeis, isCorretor: false, roles: ["gestor"] };
    r = montarTela(<AppSidebar />);
    await new Promise((res) => setTimeout(res, 30));
    expect(screen.queryByTestId("checkin-lateral")).toBeNull();
    expect(screen.queryByTestId("checkin-lateral-trilho")).toBeNull();
    r.unmount();
    // O bloco sozinho (expandido ou recolhido) também não desenha nada nem lê a presença.
    montarTela(
      <div data-testid="so-o-bloco">
        <CheckinLateral collapsed={false} />
        <CheckinLateral collapsed />
      </div>,
    );
    await new Promise((res) => setTimeout(res, 30));
    expect(screen.getByTestId("so-o-bloco")).toBeEmptyDOMElement();
    expect(tela.rpc).not.toHaveBeenCalled();
  });

  it("cada estado: a linha, o estado em texto, a cor da bolinha e a ação (o erro leva a /presenca)", async () => {
    type Caso = {
      nome: string;
      leitura: () => Promise<{ data: unknown; error: unknown }>;
      linha: string | null;
      estado: string;
      intent: keyof typeof INTENT_DOT_NAVY;
      botao: string | null;
      link?: string;
    };
    const ok = (m: ReturnType<typeof minha>) => () => Promise.resolve({ data: m, error: null });
    const casos: Caso[] = [
      {
        nome: "sem check-in",
        leitura: ok(minha()),
        linha: "Sem check-in hoje",
        estado: "Fora das roletas",
        intent: "warning",
        botao: "Fazer check-in",
      },
      {
        nome: "na roleta",
        leitura: ok(minha(ck({ criado_em: `${HOJE}T12:31:00Z` }))),
        linha: "Barra Funda · 09:31",
        estado: "Nas roletas",
        intent: "success",
        botao: "Trocar",
      },
      {
        nome: "confirmado pela gestão",
        leitura: ok(minha(ck({ origem: "gestao", localizacao: "confirmada_gestao" }))),
        linha: "Barra Funda · 09:00",
        estado: "Nas roletas · confirmado pela gestão",
        intent: "success",
        botao: "Trocar",
      },
      {
        nome: "liberado pela gestão",
        leitura: ok(
          minha(
            ck({
              modo: "liberado_gestao",
              filial_slug: null,
              filial_nome: null,
              origem: "gestao",
              localizacao: null,
            }),
          ),
        ),
        linha: "Liberado pela gestão · 09:00",
        estado: "Nas roletas",
        intent: "success",
        botao: "Trocar",
      },
      {
        nome: "encerrado",
        leitura: ok(minha(ck({ encerrado_em: `${HOJE}T21:02:00Z` }))),
        linha: "Barra Funda · saiu às 18:02",
        estado: "Presença encerrada",
        intent: "neutral",
        botao: "Fazer check-in",
      },
      {
        nome: "barrado sem localização",
        leitura: ok(minha(semGps())),
        linha: "Barra Funda · 09:00",
        estado: "Barrado: sem localização",
        intent: "danger",
        botao: "Incluir localização",
      },
      {
        nome: "barrado fora",
        leitura: ok(minha(fora())),
        linha: "Barra Funda · 09:00",
        estado: "Barrado: a 6,1 km da loja",
        intent: "danger",
        botao: "Refazer check-in",
      },
      {
        nome: "em casa abaixo do mínimo",
        leitura: ok(
          minha(
            ck({
              modo: "casa",
              filial_slug: null,
              filial_nome: null,
              apto_roleta: false,
              motivo: "casa_abaixo_minimo_vendas",
              localizacao: null,
            }),
          ),
        ),
        linha: "Em casa · 09:00",
        estado: "Fora das roletas: 2 de 3 vendas",
        intent: "warning",
        botao: "Trocar",
      },
      {
        nome: "apto sem presente (raro)",
        leitura: ok(minha(ck(), { presente: false })),
        linha: "Barra Funda · 09:00",
        estado: "Fora das roletas",
        intent: "warning",
        botao: "Trocar",
      },
      {
        nome: "erro de leitura",
        leitura: () => Promise.resolve({ data: null, error: { message: "Failed to fetch" } }),
        linha: null,
        estado: "Não deu para ler o check-in",
        intent: "neutral",
        botao: null,
        link: "Abrir check-in",
      },
    ];
    for (const c of casos) {
      banco.leitura = c.leitura;
      const r = montarTela(<CheckinLateral collapsed={false} />);
      const b = await screen.findByTestId("checkin-lateral");
      await waitFor(() => expect(within(b).getByText(c.estado)).toBeInTheDocument(), {
        timeout: 2000,
      });
      expect(b, c.nome).toHaveAttribute("aria-labelledby");
      expect(within(b).getByRole("heading", { name: "Check-in" })).toBeInTheDocument();
      if (c.linha) {
        const linha = within(b).getByText(c.linha);
        expect(linha, c.nome).toHaveAttribute("title", c.linha);
      }
      const dot = bolinha(b);
      expect(dot, c.nome).toHaveAttribute("data-intent", c.intent);
      expect(dot, c.nome).toHaveAttribute("aria-hidden", "true");
      // Sobre o navy: os tons claros (os do tema claro ficavam em ~2,5:1).
      expect(dot?.className, c.nome).toContain(INTENT_DOT_NAVY[c.intent]);
      if (c.intent !== "neutral") {
        expect(dot?.className, c.nome).not.toContain(INTENT_DOT[c.intent]);
      }
      if (c.botao) {
        const botao = within(b).getByRole("button", { name: c.botao });
        // O estado descreve a ação para o leitor de tela.
        expect(
          document.getElementById(botao.getAttribute("aria-describedby") ?? ""),
        ).toHaveTextContent(c.estado);
        expect(within(b).queryByRole("link")).toBeNull();
      } else {
        expect(within(b).queryByRole("button")).toBeNull();
      }
      if (c.link) {
        expect(within(b).getByRole("link", { name: c.link })).toHaveAttribute("href", "/presenca");
      }
      r.unmount();
    }

    // Lendo: o mesmo bloco, sem ação, com o lugar da linha e do botão
    // reservado (invisível, as mesmas classes do pronto): o rodapé não pula
    // quando a presença chega.
    banco.leitura = () => new Promise(() => {});
    montarTela(<CheckinLateral collapsed={false} />);
    const b = await screen.findByTestId("checkin-lateral");
    expect(within(b).getByText("Lendo o check-in…")).toBeInTheDocument();
    const [linha, botao] = within(b).getAllByTestId("checkin-lateral-reserva");
    for (const r of [linha, botao]) {
      expect(r).toHaveAttribute("aria-hidden", "true");
      expect(r.className).toContain("invisible");
    }
    expect(linha.className).toContain("mt-1.5");
    expect(linha.className).toContain("text-[13px]");
    // O botão reservado tem a altura do de verdade (44 px no celular, 32+ no computador).
    expect(botao.className).toContain("min-h-11");
    expect(botao.className).toContain("md:h-8");
    expect(botao.className).toContain("mt-2");
    expect(within(b).queryByRole("button")).toBeNull();
    expect(bolinha(b)).toHaveAttribute("data-intent", "neutral");
  });

  it("recolhida: o ícone diz tudo no aria-label, a bolinha tem a cor do estado e o clique SEMPRE abre o diálogo (mesmo no barrado sem localização)", async () => {
    devolve(minha(ck({ criado_em: `${HOJE}T12:31:00Z` })));
    let r = montarTela(<CheckinLateral collapsed />);
    const icone = await screen.findByRole("button", {
      name: "Check-in: Barra Funda · 09:31, Nas roletas. Abrir o check-in.",
    });
    const dot = bolinha(icone);
    expect(dot).toHaveAttribute("data-intent", "success");
    expect(dot?.className).toContain(INTENT_DOT_NAVY.success);
    expect(dot?.className).toContain("rounded-full");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    // Nada de bloco expandido na barra de 72 px.
    expect(screen.queryByTestId("checkin-lateral")).toBeNull();
    r.unmount();

    devolve(minha(semGps()));
    r = montarTela(<CheckinLateral collapsed />);
    const barrado = await screen.findByRole("button", {
      name: "Check-in: Barra Funda · 09:00, Barrado: sem localização. Abrir o check-in.",
    });
    expect(bolinha(barrado)).toHaveAttribute("data-intent", "danger");
    // Sozinha no trilho, a bolinha também muda de forma: losango no barrado.
    expect(bolinha(barrado)?.className).toContain("rotate-45");
    expect(bolinha(barrado)?.className).not.toContain("rounded-full");
    expect(bolinha(barrado)?.className).toContain(INTENT_DOT_NAVY.danger);
    fireEvent.click(barrado);
    expect(screen.getByTestId("pedido")).toHaveTextContent("abrir:lateral");
    expect(chamadasCheckin()).toEqual([]);
    r.unmount();
    _reiniciarPedidoCheckin();

    // Lendo: sem linha, só o estado.
    banco.leitura = () => new Promise(() => {});
    r = montarTela(<CheckinLateral collapsed />);
    expect(
      await screen.findByRole("button", { name: "Check-in: Lendo o check-in…. Abrir o check-in." }),
    ).toBeInTheDocument();
    r.unmount();

    // Erro: o ícone vira link para /presenca, com o mesmo tipo de rótulo.
    banco.leitura = () => Promise.resolve({ data: null, error: { message: "Failed to fetch" } });
    montarTela(<CheckinLateral collapsed />);
    const link = await screen.findByRole("link", {
      name: "Check-in: Não deu para ler o check-in. Abrir o check-in.",
    });
    expect(link).toHaveAttribute("href", "/presenca");
  });

  it("o clique fecha o Sheet ANTES de pedir, e pede a ação certa; com o treino do onboarding na tela, desabilitado", async () => {
    devolve(minha(semGps()));
    const ordem: string[] = [];
    const onNavigate = vi.fn(() => {
      ordem.push(houvePedidoCheckinRecente() ? "navegou-depois-do-pedido" : "navegou");
    });
    const r = montarTela(<CheckinLateral collapsed={false} onNavigate={onNavigate} />);
    const b = await screen.findByTestId("checkin-lateral");
    fireEvent.click(await within(b).findByRole("button", { name: "Incluir localização" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(ordem).toEqual(["navegou"]);
    expect(houvePedidoCheckinRecente()).toBe(true);
    expect(screen.getByTestId("pedido")).toHaveTextContent("incluir-localizacao:lateral");
    expect(chamadasCheckin()).toEqual([]);
    r.unmount();
    _reiniciarPedidoCheckin();

    // Treino na tela (AGENTS.md: nada abre por cima dele): desabilitado.
    devolve(minha(ck()));
    publicarEstadoTreino({ decidido: true, aberto: true });
    montarTela(
      <>
        <CheckinLateral collapsed={false} />
        <CheckinLateral collapsed />
      </>,
    );
    const trocar = await within(await screen.findByTestId("checkin-lateral")).findByRole("button", {
      name: "Trocar",
    });
    expect(trocar).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Check-in: Barra Funda/ })).toBeDisabled();
    fireEvent.click(trocar);
    expect(screen.getByTestId("pedido")).toHaveTextContent("nenhum");
    act(() => publicarEstadoTreino({ decidido: true, aberto: false }));
    expect(trocar).toBeEnabled();
  });

  it("sem polling: o bloco lê a presença uma vez só (31 s, foco); com a faixa junto, ainda uma", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    devolve(minha());
    let r = montarTela(<CheckinLateral collapsed={false} />);
    await within(await screen.findByTestId("checkin-lateral")).findByText("Sem check-in hoje");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(leituras()).toBe(1);
    r.unmount();

    tela.rpc.mockClear();
    r = montarTela(
      <>
        <CheckinPendenteBanner />
        <CheckinLateral collapsed={false} />
      </>,
    );
    await screen.findByTestId("faixa-checkin");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(leituras()).toBe(1);
    expect(chamadasCheckin()).toEqual([]);
  });

  it("duas instâncias (o aside e o Sheet do celular): ids distintos; o pedido feito no Sheet não devolve o foco ao ☰", async () => {
    montarTela(
      <>
        <AppSidebar />
        <MobileSidebar />
      </>,
    );
    await screen.findByTestId("checkin-lateral");
    const menu = screen.getByRole("button", { name: "Abrir menu" });
    fireEvent.click(menu);
    await waitFor(() => expect(screen.getAllByTestId("checkin-lateral")).toHaveLength(2));
    const [aside, sheet] = screen.getAllByTestId("checkin-lateral");
    const titulos = [aside, sheet].map((s) => s.getAttribute("aria-labelledby"));
    expect(new Set(titulos).size).toBe(2);
    for (const s of [aside, sheet]) {
      const id = s.getAttribute("aria-labelledby") ?? "";
      expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
      // O título e o estado que descreve o botão são os DESTE bloco. (Com o
      // Sheet aberto, o aside fica aria-hidden: daí o `hidden: true`.)
      expect(s.contains(document.getElementById(id))).toBe(true);
      const botao = await within(s).findByRole("button", { name: "Trocar", hidden: true });
      const descr = botao.getAttribute("aria-describedby") ?? "";
      expect(document.querySelectorAll(`[id="${descr}"]`)).toHaveLength(1);
      expect(s.contains(document.getElementById(descr))).toBe(true);
    }

    // "Trocar" no Sheet: fecha o Sheet e pede; o foco não volta ao ☰.
    fireEvent.click(within(sheet).getByRole("button", { name: "Trocar" }));
    await waitFor(() => expect(screen.getAllByTestId("checkin-lateral")).toHaveLength(1));
    expect(screen.getByTestId("pedido")).toHaveTextContent("abrir:lateral");
    expect(document.activeElement).not.toBe(menu);

    // Sem pedido (fechar pelo ESC), o Sheet devolve o foco ao ☰ como sempre.
    _reiniciarPedidoCheckin();
    fireEvent.click(menu);
    await waitFor(() => expect(screen.getAllByTestId("checkin-lateral")).toHaveLength(2));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.getAllByTestId("checkin-lateral")).toHaveLength(1));
    await waitFor(() => expect(document.activeElement).toBe(menu));
  });

  it("Trocar abre o diálogo voluntário; no barrado fora, 'Refazer check-in' abre o diálogo NA tela do barrado, fechável", async () => {
    let r = montarTela(
      <>
        <CheckinLateral collapsed={false} />
        <CheckinObrigatorioGlobal />
      </>,
    );
    fireEvent.click(await within(bloco()).findByRole("button", { name: "Trocar" }));
    let d = await screen.findByTestId("checkin-obrigatorio-dialog");
    expect(d).toHaveAttribute("data-modo", "voluntario");
    expect(
      within(d).getByText(
        "Agora: Barra Funda · 09:00 — nas roletas. Para trocar, escolha onde você está.",
      ),
    ).toBeInTheDocument();
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("checkin-obrigatorio-dialog")).toBeNull());
    r.unmount();

    devolve(minha(fora()));
    r = montarTela(
      <>
        <CheckinLateral collapsed={false} />
        <CheckinObrigatorioGlobal />
      </>,
    );
    fireEvent.click(await within(bloco()).findByRole("button", { name: "Refazer check-in" }));
    d = await screen.findByTestId("checkin-obrigatorio-dialog");
    expect(d).toHaveAttribute("data-modo", "voluntario");
    expect(within(d).getByTestId("checkin-barrado-motivo")).toHaveTextContent(
      "A localização deste aparelho ficou a 6,1 km da filial Barra Funda.",
    );
    expect(within(d).getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    // Fechável: o X aparece e fecha.
    fireEvent.click(within(d).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("checkin-obrigatorio-dialog")).toBeNull());
    expect(chamadasCheckin()).toEqual([]);
    r.unmount();
  });
  // -------------------------------------------------------------------------
  // O GPS no toque (o merge com a main, 13/10: "Pedir localização no
  // check-in"): só "Incluir localização" lê, e lê DENTRO do clique — o
  // navegador só mostra o pedido de permissão de dentro do gesto. Nas telas
  // do card (/presenca, /meu-perfil), o bloco não lê: o card só rola.
  // -------------------------------------------------------------------------

  /** O GPS do "Corretor Teste" (dentro da Barra Funda), respondendo na hora. */
  function comGps() {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({
        coords: { latitude: -23.518983, longitude: -46.676975, accuracy: 90 },
      } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    return getCurrentPosition;
  }
  const semGpsNoNavegador = () => Reflect.deleteProperty(navigator, "geolocation");

  /**
   * O banco com check-in: presenca_minha_v1 lê `atual`; presenca_checkin grava
   * a resposta (Barra Funda, valendo) e devolve sem as filiais, como a RPC.
   */
  function bancoComCheckin(inicial: ReturnType<typeof minha>) {
    const b = { atual: inicial };
    tela.rpc.mockImplementation((fn: string) => {
      if (fn === "presenca_minha_v1") return Promise.resolve({ data: b.atual, error: null });
      if (fn === "presenca_checkin") {
        b.atual = minha(ck({ id: "k2" }));
        return Promise.resolve({ data: { ...b.atual, filiais: [] }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    return b;
  }

  it("'Incluir localização' lê o GPS DENTRO do clique (maximumAge 0); Trocar, Fazer check-in, Refazer e o trilho não leem", async () => {
    const gps = comGps();
    try {
      devolve(minha(semGps()));
      let r = montarTela(<CheckinLateral collapsed={false} />);
      const incluir = await within(await screen.findByTestId("checkin-lateral")).findByRole(
        "button",
        { name: "Incluir localização" },
      );
      expect(gps).not.toHaveBeenCalled();
      fireEvent.click(incluir);
      // Síncrono, ainda no clique (sem await): o pedido de permissão sai do gesto.
      expect(gps).toHaveBeenCalledTimes(1);
      expect((gps.mock.calls[0][2] as PositionOptions).maximumAge).toBe(0);
      expect(screen.getByTestId("pedido")).toHaveTextContent("incluir-localizacao:lateral");
      expect(chamadasCheckin()).toEqual([]);
      r.unmount();
      _reiniciarPedidoCheckin();

      // As outras ações só pedem: nenhuma leitura do GPS.
      const casos: [ReturnType<typeof minha>, string][] = [
        [minha(ck()), "Trocar"],
        [minha(), "Fazer check-in"],
        [minha(fora()), "Refazer check-in"],
      ];
      for (const [m, nome] of casos) {
        gps.mockClear();
        devolve(m);
        r = montarTela(<CheckinLateral collapsed={false} />);
        const botao = await within(await screen.findByTestId("checkin-lateral")).findByRole(
          "button",
          { name: nome },
        );
        fireEvent.click(botao);
        expect(screen.getByTestId("pedido"), nome).toHaveTextContent("abrir:lateral");
        expect(gps, nome).not.toHaveBeenCalled();
        r.unmount();
        _reiniciarPedidoCheckin();
      }

      // O trilho (sempre "abrir"), mesmo no barrado sem localização.
      gps.mockClear();
      devolve(minha(semGps()));
      montarTela(<CheckinLateral collapsed />);
      fireEvent.click(await screen.findByRole("button", { name: /^Check-in: Barra Funda/ }));
      expect(screen.getByTestId("pedido")).toHaveTextContent("abrir:lateral");
      expect(gps).not.toHaveBeenCalled();
    } finally {
      semGpsNoNavegador();
    }
  });

  it("trilho: a forma da bolinha também diz o estado (quadrado no 'fora das roletas', círculo nas roletas)", async () => {
    devolve(minha());
    montarTela(<CheckinLateral collapsed />);
    const icone = await screen.findByRole("button", {
      name: "Check-in: Sem check-in hoje, Fora das roletas. Abrir o check-in.",
    });
    const dot = bolinha(icone);
    expect(dot).toHaveAttribute("data-intent", "warning");
    expect(dot?.className).toContain("rounded-[2px]");
    expect(dot?.className).not.toContain("rotate-45");
    expect(dot?.className).toContain(INTENT_DOT_NAVY.warning);
  });

  it("bloco + diálogo: 'Incluir localização' refaz no barrado com a leitura do TOQUE (o GPS lido uma vez só no total)", async () => {
    const gps = comGps();
    try {
      bancoComCheckin(minha(semGps()));
      montarTela(
        <>
          <CheckinLateral collapsed={false} />
          <CheckinObrigatorioGlobal />
        </>,
      );
      fireEvent.click(await within(bloco()).findByRole("button", { name: "Incluir localização" }));
      expect(gps).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(chamadasCheckin()).toHaveLength(1));
      expect(chamadasCheckin()[0][1]).toMatchObject({
        _modo: "loja",
        _filial: "barra-funda",
        _latitude: -23.518983,
        _longitude: -46.676975,
        _precisao_m: 90,
      });
      await waitFor(() => expect(screen.queryByTestId("checkin-obrigatorio-dialog")).toBeNull());
      // O diálogo usou a leitura do toque: nenhuma segunda leitura.
      expect(gps).toHaveBeenCalledTimes(1);
    } finally {
      semGpsNoNavegador();
    }
  });

  it("em /presenca: 'Incluir localização' do bloco NÃO lê o GPS (o card atende e só rola); o botão do card lê uma vez e refaz", async () => {
    const gps = comGps();
    const rolar = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: rolar,
    });
    try {
      tela.pathname = "/presenca";
      bancoComCheckin(minha(semGps()));
      montarTela(
        <>
          <CheckinLateral collapsed={false} />
          <CheckinCard />
          <CheckinObrigatorioGlobal />
        </>,
      );
      const doCard = await screen.findByTestId("card-incluir-localizacao-barrado");
      fireEvent.click(await within(bloco()).findByRole("button", { name: "Incluir localização" }));
      // Nenhuma leitura (nem pedido de permissão) que seria jogada fora.
      expect(gps).not.toHaveBeenCalled();
      // O card atende: consome o pedido, rola até ele e põe o foco no título.
      await waitFor(() => expect(screen.getByTestId("pedido")).toHaveTextContent("nenhum"));
      expect(rolar).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
      expect(document.activeElement).toHaveTextContent("Check-in de hoje");
      expect(screen.queryByTestId("checkin-obrigatorio-dialog")).toBeNull();
      expect(chamadasCheckin()).toEqual([]);

      // O botão do card: lê no toque dele, uma vez, e refaz.
      fireEvent.click(within(doCard).getByRole("button", { name: "Incluir localização" }));
      expect(gps).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(chamadasCheckin()).toHaveLength(1));
      expect(chamadasCheckin()[0][1]).toMatchObject({
        _filial: "barra-funda",
        _latitude: -23.518983,
      });
      expect(gps).toHaveBeenCalledTimes(1);
    } finally {
      semGpsNoNavegador();
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("o foco volta ao fechar o diálogo aberto pelo bloco: ao botão tocado (computador); no celular, ao ☰ (o botão do Sheet já saiu da tela) — nunca ao body", async () => {
    let r = montarTela(
      <>
        <CheckinLateral collapsed={false} />
        <CheckinObrigatorioGlobal />
      </>,
    );
    const trocar = await within(bloco()).findByRole("button", { name: "Trocar" });
    // O clique de verdade foca o botão (o fireEvent não).
    trocar.focus();
    fireEvent.click(trocar);
    const d = await screen.findByTestId("checkin-obrigatorio-dialog");
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("checkin-obrigatorio-dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trocar));
    r.unmount();
    _reiniciarPedidoCheckin();

    // Celular: o bloco dentro do Sheet.
    r = montarTela(
      <>
        <MobileSidebar />
        <CheckinObrigatorioGlobal />
      </>,
    );
    const menu = await screen.findByRole("button", { name: "Abrir menu" });
    fireEvent.click(menu);
    const noSheet = await screen.findByTestId("checkin-lateral");
    const trocarSheet = await within(noSheet).findByRole("button", { name: "Trocar" });
    trocarSheet.focus();
    fireEvent.click(trocarSheet);
    const d2 = await screen.findByTestId("checkin-obrigatorio-dialog");
    expect(d2).toHaveAttribute("data-modo", "voluntario");
    await waitFor(() => expect(trocarSheet.isConnected).toBe(false));
    fireEvent.keyDown(d2, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("checkin-obrigatorio-dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(menu));
    r.unmount();
  });

  it("pedirCheckinNoToque: só 'incluir-localizacao' fora das telas do card lê o GPS", () => {
    const gps = comGps();
    try {
      pedirCheckinNoToque("abrir", "lateral", "/fila");
      expect(gps).not.toHaveBeenCalled();
      pedirCheckinNoToque("incluir-localizacao", "lateral", "/presenca");
      pedirCheckinNoToque("incluir-localizacao", "lateral", "/meu-perfil/dados");
      expect(gps).not.toHaveBeenCalled();
      pedirCheckinNoToque("incluir-localizacao", "faixa", "/modo-visita");
      expect(gps).toHaveBeenCalledTimes(1);
    } finally {
      semGpsNoNavegador();
    }
  });
});
