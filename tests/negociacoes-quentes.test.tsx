// "Perto de fechar" no Painel do Dia (referência de 2026-10, "Hot deals").
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { rankearQuentes, rotuloFollowup, type LeadQuenteRow } from "@/features/quentes/derive";

const AGORA = new Date(2026, 9, 28, 10, 0);
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();

function lead(
  p: Partial<LeadQuenteRow> & Pick<LeadQuenteRow, "id" | "nome" | "status">,
): LeadQuenteRow {
  return {
    temperatura: null,
    ultima_interacao: diasAtras(0),
    created_at: diasAtras(30),
    proximo_followup: null,
    projeto_nome: null,
    corretor_id: null,
    preco_a_partir: null,
    ...p,
  };
}

describe("rankearQuentes", () => {
  it("etapa mais perto da venda vem primeiro, mesmo com score menor", () => {
    const r = rankearQuentes(
      [
        lead({ id: "v", nome: "Visita quente", status: "visita_realizada", temperatura: "quente" }),
        lead({ id: "p", nome: "Proposta fria", status: "proposta_enviada", temperatura: "frio" }),
        lead({ id: "a", nome: "Análise", status: "analise_credito" }),
      ],
      AGORA,
    );
    expect(r.map((l) => l.id)).toEqual(["a", "p", "v"]);
  });

  it("dentro da etapa, o mais urgente (quente e parado) sobe; corta em 6", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      lead({
        id: `l${i}`,
        nome: `Lead ${i}`,
        status: "analise_credito",
        ultima_interacao: diasAtras(i),
      }),
    );
    const r = rankearQuentes(rows, AGORA);
    expect(r).toHaveLength(6);
    // Mais dias sem contato = mais urgente pelo score da ficha.
    expect(r[0].id).toBe("l7");
    expect(r[0].diasParado).toBe(7);
  });
});

describe("rotuloFollowup", () => {
  it("hoje, atrasado ou a data", () => {
    expect(rotuloFollowup(new Date(2026, 9, 28, 18).toISOString(), AGORA)).toBe("Follow-up hoje");
    expect(rotuloFollowup(diasAtras(2), AGORA)).toBe("Follow-up atrasado");
    expect(rotuloFollowup(new Date(2026, 9, 30, 9).toISOString(), AGORA)).toBe("Follow-up 30/10");
    expect(rotuloFollowup(null, AGORA)).toBeNull();
  });
});

// --- Componente --------------------------------------------------------------

const estado = vi.hoisted(() => ({
  quentes: {
    data: [] as unknown[],
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => {},
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...p }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={p.to} className={p.className}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/quentes/queries", () => ({ useLeadsQuentes: () => estado.quentes }));
vi.mock("@/features/pipeline/queries", () => ({
  useCorretoresMin: () => ({ data: [{ id: "c1", nome: "João Lima" }] }),
}));

describe("NegociacoesQuentes", () => {
  it("mostra etapa, cliente, empreendimento, estimativa declarada e o corretor", async () => {
    estado.quentes.data = [
      lead({
        id: "a",
        nome: "Maria Souza",
        status: "analise_credito",
        projeto_nome: "Residencial Apto",
        preco_a_partir: 189_000,
        corretor_id: "c1",
        ultima_interacao: diasAtras(4),
      }),
    ];
    const { NegociacoesQuentes } = await import("@/features/quentes/negociacoes-quentes");
    render(<NegociacoesQuentes />);
    const cartao = screen.getByRole("link", { name: /Maria Souza/ });
    expect(within(cartao).getByText("Análise de crédito")).toBeInTheDocument();
    expect(within(cartao).getByText("Residencial Apto")).toBeInTheDocument();
    expect(within(cartao).getByText(/a partir de/)).toBeInTheDocument();
    expect(within(cartao).getByText(/parado há 4 dias/)).toBeInTheDocument();
    expect(within(cartao).getByText("João Lima")).toBeInTheDocument();
  });

  it("sem preço do projeto, não inventa valor", async () => {
    estado.quentes.data = [lead({ id: "b", nome: "Ana Lima", status: "proposta_enviada" })];
    const { NegociacoesQuentes } = await import("@/features/quentes/negociacoes-quentes");
    render(<NegociacoesQuentes />);
    const cartao = screen.getByRole("link", { name: /Ana Lima/ });
    expect(within(cartao).queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it("vazio explica o critério", async () => {
    estado.quentes.data = [];
    const { NegociacoesQuentes } = await import("@/features/quentes/negociacoes-quentes");
    render(<NegociacoesQuentes />);
    expect(screen.getByText(/Nenhum lead em análise de crédito/)).toBeInTheDocument();
  });
});
