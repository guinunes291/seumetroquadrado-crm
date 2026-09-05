// Smoke das três visões do hub de Desempenho com dados fictícios: renderizam
// sem quebrar, mostram os números certos (empate, meta sem dupla contagem,
// legenda de pesos) e os estados vazios têm próximo passo.
import { render, screen, within } from "@testing-library/react";
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

import { RankingRealXMeta } from "@/features/ranking/ranking-real-x-meta";
import { RankingVendas } from "@/features/ranking/ranking-vendas";
import { RankingProdutividade } from "@/features/ranking/ranking-produtividade";
import { HeroDesempenho } from "@/features/ranking/ranking-ui";
import {
  agregarMetas,
  escopoDe,
  janelaMesAnteriorComparavel,
  pesosDeConfig,
  somarTotais,
  type RankRow,
} from "@/features/ranking/ranking-derive";

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

const RANKING: RankRow[] = [
  row({
    corretorId: "a",
    nome: "Ana Souza",
    pontos: 2100,
    ligacoes: 20,
    whatsapp: 30,
    agendamentos: 4,
    visitas: 2,
    documentacoes: 1,
    vendas: 1,
    vgv: 320000,
    leads: 12,
  }),
  row({
    corretorId: "b",
    nome: "Bruno Lima",
    pontos: 2100,
    ligacoes: 25,
    whatsapp: 20,
    agendamentos: 4,
    visitas: 2,
    documentacoes: 1,
    vendas: 1,
    vgv: 320000,
    leads: 10,
  }),
  row({
    corretorId: "c",
    nome: "Carla Reis",
    pontos: 1200,
    ligacoes: 10,
    whatsapp: 5,
    agendamentos: 2,
    visitas: 1,
    documentacoes: 0,
    vendas: 2,
    vgv: 610000,
    leads: 8,
  }),
  row({ corretorId: "d", nome: "Dani Melo", leads: 3 }),
];

const HOJE = new Date(2026, 8, 5, 12);

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  // jsdom não implementa ResizeObserver (usado pela TabsList/virtualização).
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

describe("Real x Meta", () => {
  it("mostra a meta sem dupla contagem, o gap, a projeção e o top vendedores", () => {
    const metas = [
      {
        corretor_id: "a",
        equipe_id: null,
        meta_vendas: 3,
        meta_visitas: 10,
        meta_leads_atendidos: 0,
        meta_gmv: 900000,
      },
      {
        corretor_id: "b",
        equipe_id: null,
        meta_vendas: 3,
        meta_visitas: 0,
        meta_leads_atendidos: 0,
        meta_gmv: 0,
      },
      {
        corretor_id: null,
        equipe_id: "e1",
        meta_vendas: 50,
        meta_visitas: 0,
        meta_leads_atendidos: 0,
        meta_gmv: 0,
      },
    ];
    const totais = somarTotais(RANKING);
    const metaTotais = agregarMetas(metas, escopoDe(RANKING, true));
    render(
      <Wrap>
        <RankingRealXMeta
          ano={2026}
          mes={9}
          hoje={HOJE}
          rankingMes={RANKING}
          totaisMes={totais}
          totaisMesAnterior={somarTotais([
            row({ corretorId: "a", nome: "Ana", vendas: 2, vgv: 500000 }),
          ])}
          janelaAnterior={janelaMesAnteriorComparavel(2026, 9, HOJE)}
          metas={metas}
          metaTotais={metaTotais}
          podeGerirMetas
        />
      </Wrap>,
    );
    // Meta = 3 + 3 (individuais); a meta de equipe (50) NÃO entra.
    expect(screen.getByText(/de 6 vendas/)).toBeInTheDocument();
    expect(
      screen.getByText("soma das metas individuais · 2 corretores com meta"),
    ).toBeInTheDocument();
    // 4 vendas em 5 dias úteis (seg–sáb) de 26 → projeção 20,8 = 347% da meta de 6.
    expect(screen.getByText("347%")).toBeInTheDocument();
    expect(screen.getByText(/ritmo de 5 de 26 dias úteis → 21 vendas/)).toBeInTheDocument();
    // Comparação com o mesmo período de agosto (parcial).
    expect(screen.getAllByText(/vs\. mesmo período de agosto/).length).toBeGreaterThan(0);
    // Top vendedores: Carla (2) na frente; Ana e Bruno empatados em 2º.
    const lista = screen.getByRole("list", { name: "Classificação" });
    const itens = within(lista).getAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("Carla Reis");
    expect(within(itens[1]).getByTitle("2º lugar")).toBeInTheDocument();
    expect(within(itens[2]).getByTitle("2º lugar")).toBeInTheDocument();
    // Meta de VGV = só a de Ana (900 mil); Bruno sem meta_gmv usa ticket médio.
    expect(
      screen.getByText(/sem meta de VGV cadastrada, usamos meta de vendas × ticket médio/),
    ).toBeInTheDocument();
  });

  it("meta só de VGV: anel, barra e gap falam de VGV — nunca 'Meta 0' ao lado de um anel cheio", () => {
    const metas = [
      {
        corretor_id: "a",
        equipe_id: null,
        meta_vendas: 0,
        meta_visitas: 0,
        meta_leads_atendidos: 0,
        meta_gmv: 900000,
      },
    ];
    const totais = somarTotais(RANKING);
    const metaTotais = agregarMetas(metas, escopoDe(RANKING, true));
    render(
      <Wrap>
        <RankingRealXMeta
          ano={2026}
          mes={9}
          hoje={HOJE}
          rankingMes={RANKING}
          totaisMes={totais}
          totaisMesAnterior={somarTotais([])}
          janelaAnterior={janelaMesAnteriorComparavel(2026, 9, HOJE)}
          metas={metas}
          metaTotais={metaTotais}
          podeGerirMetas
        />
      </Wrap>,
    );
    // A meta principal vira a de VGV: título, anel e barra na mesma régua.
    expect(screen.getByText(/^Meta de VGV — /)).toBeInTheDocument();
    expect(screen.getByText(/sem meta em quantidade de vendas/)).toBeInTheDocument();
    expect(screen.getByText("da meta de VGV")).toBeInTheDocument();
    // VGV realizado 1,25 mi contra 900 mil: 138,9% — e nada de "Meta não definida".
    expect(screen.getByLabelText("da meta de VGV: 138.9%")).toBeInTheDocument();
    expect(screen.queryByText(/Meta não definida/)).toBeNull();
    // A projeção também é em reais, não em "vendas".
    expect(screen.queryByText(/→ \d+ vendas/)).toBeNull();
  });

  it("sem meta cadastrada, diz isso e aponta o próximo passo", () => {
    render(
      <Wrap>
        <RankingRealXMeta
          ano={2026}
          mes={9}
          hoje={HOJE}
          rankingMes={[]}
          totaisMes={somarTotais([])}
          totaisMesAnterior={somarTotais([])}
          janelaAnterior={janelaMesAnteriorComparavel(2026, 9, HOJE)}
          metas={[]}
          metaTotais={agregarMetas([], escopoDe([], true))}
          podeGerirMetas
        />
      </Wrap>,
    );
    expect(screen.getByText(/Nenhuma meta cadastrada para o mês/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "cadastrar metas" })).toHaveAttribute(
      "href",
      "/painel-gestor",
    );
    expect(screen.getByText("Nenhuma venda aprovada no mês.")).toBeInTheDocument();
  });
});

describe("Vendas", () => {
  it("VGV, ticket médio, funil e ranking por VGV", () => {
    render(
      <Wrap>
        <RankingVendas
          ranking={RANKING}
          totais={somarTotais(RANKING)}
          periodoLabel="Este mês"
          loading={false}
        />
      </Wrap>,
    );
    expect(screen.getAllByText("Vendas aprovadas").length).toBeGreaterThan(0);
    expect(screen.getByText("VGV ÷ vendas")).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Classificação" });
    expect(within(lista).getAllByRole("listitem")[0]).toHaveTextContent("Carla Reis");
    expect(screen.getByRole("list", { name: "Funil de conversão" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "VGV por corretor no período" })).toBeInTheDocument();
  });

  it("período sem vendas: estados vazios com orientação", () => {
    render(
      <Wrap>
        <RankingVendas
          ranking={[row({ corretorId: "d", nome: "Dani" })]}
          totais={somarTotais([])}
          periodoLabel="Hoje"
          loading={false}
        />
      </Wrap>,
    );
    expect(screen.getByText("Nenhuma venda aprovada no período.")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma venda aprovada no período")).toBeInTheDocument();
  });
});

describe("Produtividade", () => {
  const pesos = pesosDeConfig([
    { chave: "ligacao", pontos: 2, ativo: true },
    { chave: "whatsapp", pontos: 1, ativo: true },
    { chave: "agendamento", pontos: 100, ativo: true },
    { chave: "visita", pontos: 250, ativo: true },
    { chave: "documentacao", pontos: 400, ativo: true },
    { chave: "venda", pontos: 1000, ativo: true },
  ]);

  it("legenda de pesos, empate no pódio/ranking, composição e tabela detalhada", () => {
    render(
      <Wrap>
        <RankingProdutividade
          ranking={RANKING}
          totais={somarTotais(RANKING)}
          pesos={pesos}
          mudancas={new Map([["c", 1]])}
          periodoLabel="Este mês"
          loading={false}
        />
      </Wrap>,
    );
    expect(screen.getByText("Como pontua")).toBeInTheDocument();
    expect(screen.getByText("1.000 pts")).toBeInTheDocument();
    // Ana: 20×2 + 30×1 + 4×100 + 2×250 + 1×400 + 1×1000 = 2370 ≠ 2100 → aviso de pesos.
    expect(screen.getByText(/decomposição por atividade não batem/)).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Classificação" });
    const itens = within(lista).getAllByRole("listitem");
    expect(within(itens[0]).getByTitle("1º lugar")).toBeInTheDocument();
    expect(within(itens[1]).getByTitle("1º lugar")).toBeInTheDocument();
    expect(within(itens[2]).getByTitle("Subiu 1")).toBeInTheDocument();
    expect(screen.getByText("Composição da pontuação")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Classificação completa de produtividade" }),
    ).toBeInTheDocument();
    // Dani (0 pontos) fica fora da classificação.
    expect(within(lista).queryByText("Dani Melo")).not.toBeInTheDocument();
  });

  it("sem pesos carregados a legenda some e o vazio orienta", () => {
    render(
      <Wrap>
        <RankingProdutividade
          ranking={[]}
          totais={somarTotais([])}
          pesos={null}
          mudancas={new Map()}
          periodoLabel="Hoje"
          loading={false}
        />
      </Wrap>,
    );
    expect(screen.queryByText("Como pontua")).not.toBeInTheDocument();
    expect(screen.getAllByText("Sem atividade no período.").length).toBeGreaterThan(0);
  });
});

describe("Hero", () => {
  it("leva a marca, o 'ao vivo' e a hora da última atualização", () => {
    render(
      <HeroDesempenho
        subtitulo="Desempenho do time · Set 2026"
        abas={<div>abas</div>}
        acoes={<button>x</button>}
        ultimaAtualizacao={new Date("2026-09-05T14:07:00-03:00")}
        atualizando={false}
        tv={false}
      />,
    );
    expect(screen.getByRole("heading", { name: "Seu Metro Quadrado" })).toBeInTheDocument();
    expect(screen.getByText("Ao vivo")).toBeInTheDocument();
    expect(screen.getByText("Atualizado às 14:07")).toBeInTheDocument();
  });
});
