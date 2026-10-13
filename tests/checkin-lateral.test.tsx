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
  usePedidoCheckin,
  VALIDADE_PEDIDO_MS,
} from "@/features/presenca/use-checkin-obrigatorio";
import { CheckinLateral } from "@/features/presenca/checkin-lateral";
import { CheckinPendenteBanner } from "@/features/presenca/checkin-pendente-banner";
import { CheckinObrigatorioGlobal } from "@/features/presenca/checkin-obrigatorio-global";
import { AppSidebar, MobileSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { publicarEstadoTreino } from "@/features/onboarding/treino-estado";
import { INTENT_DOT } from "@/lib/status-tones";

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
    pedirCheckin({ acao: "abrir", origem: "lateral" });
    const agora = Date.now();
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
      intent: keyof typeof INTENT_DOT;
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
      expect(dot?.className, c.nome).toContain(INTENT_DOT[c.intent]);
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

    // Lendo: o mesmo bloco, sem ação, na altura do pronto (o rodapé não pula).
    banco.leitura = () => new Promise(() => {});
    montarTela(<CheckinLateral collapsed={false} />);
    const b = await screen.findByTestId("checkin-lateral");
    expect(within(b).getByText("Lendo o check-in…")).toBeInTheDocument();
    expect(b.className).toContain("min-h-[92px]");
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
    expect(dot?.className).toContain(INTENT_DOT.success);
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
});
