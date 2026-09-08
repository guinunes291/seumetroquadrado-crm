import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureRanking } from "./fixtures/ranking";
import { RankingExperience } from "@/features/ranking/ranking-page";
const HOJE = new Date(2026, 8, 8, 12);
function props() {
  return {
    snapshot: fixtureRanking(),
    hoje: HOJE,
    ano: 2026,
    mes: 9,
    userKey: "teste",
    loading: false,
    fetching: false,
    error: false,
    onRefresh: vi.fn(),
    onMonthChange: vi.fn(),
  };
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: vi.fn().mockRejectedValue(new Error("negado")),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("RankingExperience", () => {
  it("mantém a posição do usuário acessível e não inventa posição global em escopo individual", () => {
    const p = props();
    const { rerender } = render(<RankingExperience {...p} userKey="c4" />);
    fireEvent.click(screen.getByRole("button", { name: "Sua posição 5º" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Camila Oliveira");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    rerender(
      <RankingExperience {...p} userKey="c4" snapshot={{ ...p.snapshot, escopo: "individual" }} />,
    );
    expect(screen.getByRole("button", { name: "Seu resultado Ver análise" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sua posição 5º" })).toBeNull();
  });
  it("pagina também no desktop quando 30 pessoas compartilham o pódio", () => {
    const p = props();
    p.snapshot.rows = p.snapshot.rows.map((r) => ({ ...r, vgv: 1000000, vendas: 2 }));
    render(<RankingExperience {...p} />);
    expect(screen.getAllByRole("button", { name: /Analisar .+empatado/ })).toHaveLength(3);
    expect(screen.getByText("Empates no pódio · 1/10")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Próximos" }));
    expect(screen.getByText("Empates no pódio · 2/10")).toBeInTheDocument();
  });
  it("abre com identidade, fallback de iniciais e análise comercial contextualizada", () => {
    render(<RankingExperience {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: /Analisar Mariana/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("VGV aprovado")).toBeInTheDocument();
    expect(within(dialog).getByText(/16,7% de conversão da coorte/)).toBeInTheDocument();
    expect(within(dialog).getByText("Progresso das metas")).toBeInTheDocument();
    expect(within(dialog).getByText(/5 de 30 leads/)).toBeInTheDocument();
  });
  it("mantém a última leitura na falha e oferece nova tentativa", () => {
    const p = props();
    const { rerender } = render(<RankingExperience {...p} />);
    rerender(<RankingExperience {...p} error />);
    expect(screen.getByRole("button", { name: /Analisar Mariana/ })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Tentar novamente"));
    expect(p.onRefresh).toHaveBeenCalledOnce();
  });
  it("mês novo sem snapshot mostra carregamento, nunca os valores do mês anterior", () => {
    const p = props();
    const { rerender } = render(<RankingExperience {...p} />);
    rerender(<RankingExperience {...p} mes={8} snapshot={undefined} loading />);
    expect(screen.getByText("Preparando o campeonato…")).toBeInTheDocument();
    expect(screen.queryByText("R$ 2,5 mi")).toBeNull();
  });
  it("funciona em TV mesmo sem fullscreen, inicia rotação e sai por Escape", async () => {
    vi.useFakeTimers();
    const p = props();
    render(<RankingExperience {...p} />);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Modo TV", exact: true })),
    );
    expect(screen.getByRole("dialog", { name: "Modo TV do campeonato" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar rotação" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(25000));
    expect(screen.getByRole("table", { name: "Classificação dos corretores" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "Pausar rotação" }));
    act(() => vi.advanceTimersByTime(50000));
    expect(screen.getByRole("table", { name: "Classificação dos corretores" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
  it("avança, volta e altera intervalo; o refresh não reinicia a rotação", async () => {
    vi.useFakeTimers();
    const p = props();
    const { rerender } = render(<RankingExperience {...p} />);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Modo TV", exact: true })),
    );
    act(() => vi.advanceTimersByTime(20000));
    rerender(
      <RankingExperience {...p} snapshot={{ ...p.snapshot, gerado_em: "2026-09-08T15:00:20Z" }} />,
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("table", { name: "Classificação dos corretores" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tela anterior" }));
    expect(screen.getByRole("heading", { name: "Ranking de vendas" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Intervalo de rotação: 25/ }));
    expect(screen.getByRole("button", { name: /Intervalo de rotação: 40/ })).toBeInTheDocument();
  });
  it("mostra todos os 30 corretores, nomes longos e ausência de vendas/metas", () => {
    const p = props();
    p.snapshot.rows = p.snapshot.rows.map((r) => ({ ...r, vendas: 0, vgv: 0 }));
    p.snapshot.metas = [];
    p.snapshot.vendas = [];
    render(<RankingExperience {...p} />);
    expect(screen.getByText("Pódio em aberto")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Corretores" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getAllByRole("row")).toHaveLength(31);
    expect(
      screen.getByRole("button", { name: "Ana Paula de Albuquerque e Vasconcelos", exact: true }),
    ).toBeInTheDocument();
  });
  it("deduplica aprovação e não dispara quando muda apenas a meta", () => {
    const p = props();
    const { rerender } = render(<RankingExperience {...p} />);
    const next = structuredClone(p.snapshot);
    next.gerado_em = "2026-09-08T15:01:00Z";
    next.rows[1].vendas++;
    next.rows[1].vgv += 400000;
    next.vendas.push({
      id: "nova",
      corretor_id: "c1",
      aprovado_em: "2026-09-08T15:00:30Z",
      dia: "2026-09-08",
      valor: 400000,
    });
    rerender(<RankingExperience {...p} snapshot={next} />);
    expect(screen.getByText("Nova venda aprovada!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar celebração" }));
    rerender(<RankingExperience {...p} snapshot={{ ...next }} />);
    expect(screen.queryByText("Nova venda aprovada!")).toBeNull();
    expect(localStorage.getItem("smq-ranking-eventos-v1:teste:2026-9")).toContain("nova");
  });
});
