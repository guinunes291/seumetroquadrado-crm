// Comportamento do RankingPanel (hub de Desempenho) com o hook de dados
// mockado: a celebração só na VIRADA da meta vista ao vivo, nunca ao recuperar
// de um erro; erro transitório mantém a última leitura; o letreiro do Modo TV
// fala do mesmo recorte que a visão aberta.
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
  useUserRoles: () => ({
    roles: ["admin"],
    isAdmin: true,
    isGestor: false,
    isSuperintendente: false,
    isSdr: false,
    isCorretor: false,
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/components/ui/celebration", () => ({ celebrate: vi.fn() }));

const estado: { atual: Dados | null } = { atual: null };
vi.mock("@/features/ranking/use-ranking-data", () => ({
  RANKING_LIMITE: 50,
  useRankingData: () => estado.atual,
}));

import { celebrate } from "@/components/ui/celebration";
import { RankingPanel } from "@/features/ranking/ranking-page";
import type { useRankingData } from "@/features/ranking/use-ranking-data";
import {
  CALENDARIO_PADRAO,
  MESES_CURTOS,
  janelaMesAnteriorComparavel,
  type RankRow,
} from "@/features/ranking/ranking-derive";
import { PERIODO_LABELS } from "@/lib/periodo";

type Dados = ReturnType<typeof useRankingData>;

const HOJE = new Date(2026, 8, 5, 12);

const row = (over: Partial<RankRow> & { corretorId: string; nome: string }): RankRow => ({
  foto: null,
  equipeId: "e1",
  pontos: 0,
  ligacoes: 0,
  whatsapp: 0,
  agendamentos: 0,
  visitas: 0,
  documentacoes: 0,
  vendas: 0,
  vgv: 0,
  leads: 0,
  alteracoes: 0,
  ...over,
});

/** Ana e Bruno com `vendasAna` + `vendasBruno` vendas (meta individual 2 + 2). */
function ranking(vendasAna: number, vendasBruno: number): RankRow[] {
  return [
    row({
      corretorId: "a",
      nome: "Ana Souza",
      pontos: 2100,
      vendas: vendasAna,
      vgv: vendasAna * 300000,
    }),
    row({
      corretorId: "b",
      nome: "Bruno Lima",
      pontos: 1500,
      vendas: vendasBruno,
      vgv: vendasBruno * 300000,
    }),
  ];
}

const METAS = [
  {
    corretor_id: "a",
    equipe_id: null,
    meta_vendas: 2,
    meta_visitas: 0,
    meta_leads_atendidos: 0,
    meta_gmv: 0,
  },
  {
    corretor_id: "b",
    equipe_id: null,
    meta_vendas: 2,
    meta_visitas: 0,
    meta_leads_atendidos: 0,
    meta_gmv: 0,
  },
];

function dados(over: Partial<Dados> = {}): Dados {
  const rows = ranking(1, 1);
  return {
    hoje: HOJE,
    rangePeriodo: { from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) },
    rangeMes: { from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) },
    janelaAnterior: janelaMesAnteriorComparavel(2026, 9, HOJE),
    rankingPeriodo: rows,
    rankingMes: rows,
    rankingMesAnterior: [],
    metas: METAS,
    pesosRows: undefined,
    calendario: CALENDARIO_PADRAO,
    truncado: false,
    temDados: true,
    atualizadoEm: new Date("2026-09-05T14:07:00-03:00"),
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetchAll: vi.fn(),
    chavePeriodo: "this_month:2026-09-01:2026-09-30",
    ...over,
  } as Dados;
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Wrap({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
const painel = () => (
  <Wrap>
    <RankingPanel />
  </Wrap>
);

beforeEach(() => {
  vi.mocked(celebrate).mockClear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const MES_ROTULO = `${MESES_CURTOS[8]} 2026`;

describe("RankingPanel — celebração da meta", () => {
  it("celebra uma única vez na virada <100% → ≥100% do mês corrente", () => {
    estado.atual = dados({ rankingMes: ranking(1, 1) }); // 2 de 4 = 50%
    const { rerender } = render(painel());
    expect(screen.queryByText("Meta do mês batida")).toBeNull();

    estado.atual = dados({ rankingMes: ranking(2, 2) }); // 4 de 4 = 100%
    rerender(painel());
    expect(screen.getByText("Meta do mês batida")).toBeInTheDocument();
    expect(celebrate).toHaveBeenCalledTimes(1);
    expect(celebrate).toHaveBeenCalledWith("meta");

    // Refetch com o mesmo resultado (re-render do painel) não celebra de novo.
    estado.atual = dados({ rankingMes: ranking(2, 2), isFetching: true });
    rerender(painel());
    expect(celebrate).toHaveBeenCalledTimes(1);
  });

  it("abrir a tela com a meta já batida não é conquista nova", () => {
    estado.atual = dados({ rankingMes: ranking(3, 2) }); // 125% na primeira leitura
    render(painel());
    expect(screen.queryByText("Meta do mês batida")).toBeNull();
    expect(celebrate).not.toHaveBeenCalled();
  });

  it("recuperar de um erro de carga não dispara celebração espúria", () => {
    estado.atual = dados({
      isError: true,
      temDados: false,
      error: new Error("rede"),
      rankingMes: [],
      rankingPeriodo: [],
    });
    const { rerender } = render(painel());
    expect(screen.getByText("Não foi possível carregar o desempenho.")).toBeInTheDocument();

    // O retry chega com 100% da meta: o "antes" era um erro, não "estava abaixo".
    estado.atual = dados({ rankingMes: ranking(2, 2) });
    rerender(painel());
    expect(screen.queryByText("Meta do mês batida")).toBeNull();
    expect(celebrate).not.toHaveBeenCalled();
  });
});

describe("RankingPanel — erro transitório e letreiro", () => {
  it("erro num refetch com dados em cache mantém a leitura e só avisa", () => {
    estado.atual = dados({ isError: true, temDados: true, error: new Error("rede") });
    render(painel());
    expect(screen.queryByText("Não foi possível carregar o desempenho.")).toBeNull();
    expect(screen.getByText(/Não foi possível atualizar agora/)).toBeInTheDocument();
    // A última leitura continua na tela (o número da meta, por exemplo).
    expect(screen.getByText(/de 4 vendas/)).toBeInTheDocument();
  });

  it("no Modo TV o letreiro fala do recorte da visão aberta: mês no Real x Meta, período nas outras", () => {
    estado.atual = dados();
    render(painel());
    fireEvent.click(screen.getByTitle("Modo TV (tela cheia)"));
    expect(screen.getAllByText(`Vendas · ${MES_ROTULO}`).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Vendas" }), { button: 0 });
    expect(screen.queryAllByText(`Vendas · ${MES_ROTULO}`)).toHaveLength(0);
    expect(screen.getAllByText(`Vendas · ${PERIODO_LABELS.this_month}`).length).toBeGreaterThan(0);
  });
});
