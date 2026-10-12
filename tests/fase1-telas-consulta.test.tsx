// Fase 1 do plano das demais páginas, três telas de consulta no padrão
// Lançamento: a Aula da Academia (um cabeçalho só, ações no fim do texto e na
// barra fixa do celular), a Planilha de amortização (a leitura para o cliente
// e os três números que ele pergunta antes da tabela, que fica atrás de "Ver
// comparativo completo") e os Materiais (um placar "N de M prontos para a
// prateleira" com o que falta, no lugar de quatro tiles do que há). Os testes
// travam o desenho combinado; a conta, o PDF e as regras de completude seguem
// cobertos pelos testes de cada lib.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => estado.navigate,
}));

const estado = vi.hoisted(() => ({
  navigate: vi.fn(),
  marcar: vi.fn(),
  feitas: new Set<string>(),
}));

// ---------------------------------------------------------------- Aula
vi.mock("@/features/academia/guard", () => ({
  EsqueletoAcademia: () => <div>carregando</div>,
}));
vi.mock("@/features/academia/academia-client", () => ({
  useModulo: () => ({
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: {
      modulo: {
        id: "m1",
        codigo: "A02",
        titulo: "Atendimento consultivo",
        url_gamma: null,
      },
      aulas: [
        { id: "a1", ordem: 1, titulo: "O que o robô já sabe", duracao_min: 8, tipo: "texto" },
        {
          id: "a2",
          ordem: 2,
          titulo: "Perguntar antes de apresentar",
          duracao_min: 12,
          tipo: "texto",
          conteudo_md: "O cliente que chega pelo anúncio já viu a foto.",
          url_material: null,
          url_video: null,
        },
        { id: "a3", ordem: 3, titulo: "A renda antes do preço", duracao_min: 10, tipo: "texto" },
      ],
      aulasFeitas: estado.feitas,
    },
  }),
  useMarcarAula: () => ({
    isPending: false,
    isError: false,
    error: null,
    mutate: estado.marcar,
  }),
}));

// ---------------------------------------------------------------- Materiais
type Projeto = Record<string, unknown>;
const projetos = vi.hoisted(() => ({ lista: [] as Projeto[] }));

vi.mock("@/integrations/supabase/client", () => {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    is: () => consulta,
    order: async () => ({ data: projetos.lista, error: null }),
  };
  return { supabase: { from: () => consulta } };
});
vi.mock("@/features/projetos/use-construtoras-parceiras", () => ({
  useConstrutorasParceiras: () => ({ data: { parceiras: [], origem: "padrao" } }),
}));
vi.mock("@/features/projetos/plantas/plantas-dialog", () => ({ PlantasDialog: () => null }));

import { AulaPage } from "@/features/academia/aula-page";
import { ModuloAtualContext } from "@/features/nav/modulo-atual";
import { SimuladorAmortizacaoPage } from "@/features/simulador-amortizacao/simulador-amortizacao-page";
import { formInicial, paramsDoForm } from "@/features/simulador-amortizacao/estado";
import { simularFinanciamento } from "@/lib/amortizacao";
import { MateriaisPage } from "@/features/projetos/materiais-page";

afterEach(() => cleanup());
beforeEach(() => {
  estado.navigate.mockReset();
  estado.marcar.mockReset();
  estado.feitas = new Set();
});

describe("Aula da Academia", () => {
  function renderizar() {
    return render(
      <ModuloAtualContext.Provider value={{ numero: 10, titulo: "Academia" }}>
        <AulaPage codigo="A02" ordem={2} />
      </ModuloAtualContext.Provider>,
    );
  }

  it("um cabeçalho só: eyebrow com módulo, aula e posição; duração como frase", () => {
    renderizar();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Perguntar antes de apresentar",
    );
    expect(screen.getByText("Módulo 10 · Atendimento consultivo · Aula 2 de 3")).toBeTruthy();
    expect(screen.getByText("12 min")).toBeTruthy();
  });

  it("sem o '← módulo': a trilha do header já leva de volta", () => {
    renderizar();
    expect(screen.queryByRole("link", { name: /Atendimento consultivo/ })).toBeNull();
  });

  it("ações no fim do texto (desktop) e na barra fixa do sistema (celular)", () => {
    renderizar();
    const linha = screen.getByTestId("aula-acoes");
    expect(within(linha).getByRole("button", { name: /Concluí esta aula/ })).toBeTruthy();
    expect(within(linha).getByText("Aula 3 · A renda antes do preço")).toBeTruthy();
    const barra = screen.getByRole("toolbar", { name: "Ações da aula" });
    expect(barra.className).toContain("md:hidden");
    fireEvent.click(within(barra).getByRole("button", { name: /Concluí esta aula/ }));
    expect(estado.marcar).toHaveBeenCalledWith({ aulaId: "a2", concluida: true });
    fireEvent.click(within(barra).getByRole("button", { name: /Próxima/ }));
    expect(estado.navigate).toHaveBeenCalledWith({
      to: "/academia/modulo/$codigo/aula/$ordem",
      params: { codigo: "A02", ordem: "3" },
    });
  });

  it("fora do shell não inventa o número do módulo", () => {
    render(<AulaPage codigo="A02" ordem={2} />);
    expect(screen.getByText("Atendimento consultivo · Aula 2 de 3")).toBeTruthy();
  });
});

describe("Planilha de amortização", () => {
  const prefill = { financiamento: 208_000, taxa: 8.16, prazo: 420, renda: 6_200 };
  // A tela formata com espaço não separável; o Testing Library normaliza o
  // texto do DOM para espaço comum, então o esperado também.
  const brl = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
  const base = paramsDoForm(formInicial(prefill));
  const sac = simularFinanciamento({ ...base, sistema: "SAC" }).resumo;
  const price = simularFinanciamento({ ...base, sistema: "PRICE" }).resumo;

  it("a leitura para o cliente abre o resultado, antes dos três números", () => {
    render(<SimuladorAmortizacaoPage prefill={prefill} />);
    const leitura = screen.getByRole("region", { name: "Leitura para o cliente" });
    const primeira = screen.getByText("1ª parcela");
    expect(
      leitura.compareDocumentPosition(primeira) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("os três números respondem ao cliente, SAC e PRICE lado a lado", () => {
    render(<SimuladorAmortizacaoPage prefill={prefill} />);
    const tile = (titulo: string) => screen.getByText(titulo).closest("div.rounded-xl")!;
    expect(
      within(tile("1ª parcela") as HTMLElement).getByText(brl(sac.primeiraParcela)),
    ).toBeTruthy();
    expect(
      within(tile("1ª parcela") as HTMLElement).getByText(brl(price.primeiraParcela)),
    ).toBeTruthy();
    expect(
      within(tile("Renda mínima (30%)") as HTMLElement).getByText(brl(sac.rendaMinima)),
    ).toBeTruthy();
    expect(within(tile("Total pago") as HTMLElement).getByText(brl(price.totalPago))).toBeTruthy();
    // O eco do formulário saiu do Resumo.
    expect(screen.queryByText("Valor do financiamento")).toBeNull();
    expect(screen.queryByText("Juros ao mês")).toBeNull();
  });

  it("a tabela comparativa fica atrás de 'Ver comparativo completo'", () => {
    render(<SimuladorAmortizacaoPage prefill={prefill} />);
    expect(screen.queryByText("CET estimado")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ver comparativo completo/ }));
    expect(screen.getByText("CET estimado")).toBeTruthy();
  });

  it("Exportar PDF é a única ação navy; o fluxo das construtoras é um link discreto", () => {
    render(<SimuladorAmortizacaoPage prefill={prefill} />);
    expect(screen.getByRole("button", { name: /Copiar resumo/ }).className).toContain("border");
    expect(screen.getByRole("link", { name: /Fluxo das construtoras/ }).className).not.toContain(
      "bg-primary",
    );
    expect(screen.getByRole("button", { name: /Exportar PDF/ }).className).toContain("bg-primary");
  });
});

describe("Materiais dos empreendimentos", () => {
  const projeto = (p: Projeto): Projeto => ({
    construtora: "Vibra",
    bairro: "Lapa",
    cidade: "São Paulo",
    regiao: null,
    zona_smq: null,
    book_url: null,
    tabela_precos_url: null,
    capa_url: null,
    preco_a_partir: null,
    sob_consulta: false,
    metragem_min: null,
    metragem_max: null,
    dorms_min: null,
    dorms_max: null,
    status_entrega: null,
    ano_entrega: null,
    renda_minima: null,
    diferenciais: null,
    ...p,
  });

  function renderizar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MateriaisPage />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    projetos.lista = [
      projeto({
        id: "p1",
        nome: "Vibra Lapa",
        zona_smq: "Oeste",
        book_url: "https://drive.google.com/book",
        tabela_precos_url: "https://drive.google.com/tabela",
        capa_url: "https://exemplo.com/capa.jpg",
        preco_a_partir: 289_900,
      }),
      projeto({
        id: "p2",
        nome: "Vibra Barra Funda",
        zona_smq: "Oeste",
        book_url: "https://drive.google.com/book2",
        sob_consulta: true,
      }),
      projeto({ id: "p3", nome: "Conx Vila Prudente", construtora: "Conx" }),
    ];
  });

  it("um placar 'N de M prontos para a prateleira' com o que falta, no lugar dos quatro tiles", async () => {
    renderizar();
    const placar = await screen.findByTestId("materiais-placar");
    expect(
      within(placar).getByRole("img", { name: "2 de 3 prontos para a prateleira" }),
    ).toBeTruthy();
    expect(
      within(placar).getByText("Zona conhecida e book ou tabela. O outro fica só no catálogo."),
    ).toBeTruthy();
    const numero = (rotulo: string) =>
      within(placar).getByText(rotulo).previousElementSibling as HTMLElement;
    expect(numero("Sem book").textContent).toBe("1");
    expect(numero("Sem tabela").textContent).toBe("2");
    expect(numero("Sem capa").textContent).toBe("2");
    // Sob consulta conta como preço resolvido (mesma regra de antes).
    expect(numero("Sem preço").textContent).toBe("1");
    expect(numero("Sem book").className).toContain("text-warning");
    expect(screen.queryByText("Com book")).toBeNull();
  });

  it("zerado, o número fica neutro", async () => {
    projetos.lista = projetos.lista.map((p) => ({ ...p, book_url: "https://drive.google.com/b" }));
    renderizar();
    const placar = await screen.findByTestId("materiais-placar");
    const semBook = within(placar).getByText("Sem book").previousElementSibling as HTMLElement;
    expect(semBook.textContent).toBe("0");
    expect(semBook.className).not.toContain("text-warning");
  });

  it("'Colar lista' é a ação navy do cabeçalho; 'Ver a prateleira' em contorno", async () => {
    renderizar();
    await waitFor(() => expect(screen.getByTestId("materiais-placar")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Colar lista/ }).className).toContain("bg-primary");
    expect(screen.getByRole("link", { name: /Ver a prateleira/ }).className).toContain("border");
  });
});
