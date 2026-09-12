import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "c1" }, session: null, loading: false }),
  useUserRoles: () => ({
    isAdmin: false,
    isGestor: false,
    isSuperintendente: false,
    isCorretor: true,
    isSdr: false,
    roles: ["corretor"],
    loading: false,
    error: null,
    has: () => false,
  }),
}));
// O Resumo da Sami chama uma server function; aqui só interessa que o card o
// monte sob demanda, não o que ele gera.
vi.mock("@/components/resumo-ia", () => ({
  ResumoIA: ({ leadId }: { leadId: string }) => (
    <div data-testid="resumo-ia">resumo de {leadId}</div>
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/features/leads/use-lead-detail", () => ({
  fetchInteracoes: async () => [
    {
      id: "i1",
      tipo: "ligacao",
      direcao: "saida",
      titulo: "Contato — não atendeu",
      conteudo: "caixa postal",
      ocorreu_em: "2026-07-11T12:00:00Z",
    },
  ],
}));

import { FilaCard } from "@/features/fila-unica/fila-card";
import type { FilaUnicaItem } from "@/features/fila-unica/derive";

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

function itemBase(partial: Partial<FilaUnicaItem> = {}): FilaUnicaItem {
  return {
    lead: {
      id: "11111111-1111-4111-8111-111111111111",
      nome: "Josivana B.",
      telefone: "11999990000",
      email: null,
      status: "analise_credito",
      temperatura: "quente",
      ultima_interacao: "2026-06-25T12:00:00Z",
      proximo_followup: "2026-07-11T12:00:00Z",
      projeto_nome: "Liber Jaçanã",
      created_at: "2026-06-01T12:00:00Z",
      corretor_id: "c1",
      origem: "facebook",
      renda_informada: "R$ 4.200",
      entrada_disponivel: null,
      usa_fgts: true,
    },
    bucket: "fundo",
    fonte: "inbox",
    filaInbox: "esfriando",
    motivo: "quente sem contato há 79 dia(s)",
    score: 80,
    tier: "alta",
    diasParado: 79,
    proximoPasso: "Registrar venda",
    prazo: "2026-07-11T12:00:00Z",
    vencidoMin: 90_000,
    venceHoje: false,
    docsPendentes: 0,
    agendamentoId: null,
    visitaEm: null,
    valorEmJogo: null,
    ...partial,
  };
}

const callbacks = () => ({
  onWhatsApp: vi.fn(),
  onLigar: vi.fn(),
  onRegistrarContato: vi.fn(),
  onHistorico: vi.fn(),
  onEtapaDirect: vi.fn(),
  onEtapaModal: vi.fn(),
  onEtapaPerdido: vi.fn(),
  onConfirmarVisita: vi.fn(),
});

afterEach(() => cleanup());

describe("FilaCard", () => {
  it("mostra o projeto, a etapa, os dias parado em destaque, o motivo e o prazo vencido", () => {
    render(wrap(<FilaCard item={itemBase()} {...callbacks()} />));
    expect(screen.getByText("Josivana B.")).toBeInTheDocument();
    expect(screen.getByText("Liber Jaçanã")).toBeInTheDocument();
    expect(screen.getByText("Análise de crédito")).toBeInTheDocument();
    // O número grande à direita é a chave de ordem do fundo do funil.
    expect(screen.getByText("79 d")).toBeInTheDocument();
    expect(screen.getByText("parado")).toBeInTheDocument();
    expect(screen.getByText(/quente sem contato há 79 dia/)).toBeInTheDocument();
    expect(screen.getByText(/venceu há/)).toBeInTheDocument();
  });

  it("no SLA, o destaque é há quanto tempo o lead chegou; sem data, diz que não sabe", () => {
    const agora = new Date("2026-09-12T12:00:00Z");
    const { unmount } = render(
      wrap(
        <FilaCard
          item={itemBase({
            bucket: "sla",
            lead: {
              ...itemBase().lead,
              status: "aguardando_atendimento",
              created_at: "2026-09-12T11:54:00Z",
            },
          })}
          {...callbacks()}
          agora={agora}
        />,
      ),
    );
    expect(screen.getByText("6 min")).toBeInTheDocument();
    expect(screen.getByText("na mesa")).toBeInTheDocument();
    unmount();
    render(wrap(<FilaCard item={itemBase({ diasParado: null })} {...callbacks()} />));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("sem data")).toBeInTheDocument();
  });

  it("as quatro ações de polegar estão no card; Sami e etapa ficam no ⋯", () => {
    render(wrap(<FilaCard item={itemBase()} {...callbacks()} />));
    for (const nome of [/Ligar/, /WhatsApp/, /Resumo/, /Registrar/]) {
      expect(screen.getByRole("button", { name: nome })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /Mais ações/ })).toBeInTheDocument();
    expect(screen.queryByText("Registrar com a Sami")).toBeNull();
  });

  it("sem projeto, o chip não aparece; sem próximo passo, cobra a definição", () => {
    render(
      wrap(
        <FilaCard
          item={itemBase({
            lead: { ...itemBase().lead, projeto_nome: null },
            proximoPasso: null,
            prazo: null,
            vencidoMin: 0,
          })}
          {...callbacks()}
        />,
      ),
    );
    expect(screen.queryByTitle("Projeto de interesse")).toBeNull();
    expect(screen.getByText(/nenhum próximo passo definido/)).toBeInTheDocument();
  });

  it("o Resumo monta a leitura da Sami sob demanda e abre o histórico", () => {
    const cb = callbacks();
    render(wrap(<FilaCard item={itemBase()} {...cb} />));
    expect(screen.queryByTestId("resumo-ia")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Resumo/ }));
    expect(screen.getByTestId("resumo-ia")).toBeInTheDocument();
    expect(screen.getByText(/Renda: R\$ 4.200/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Abrir dossiê completo/ }));
    expect(cb.onHistorico).toHaveBeenCalledTimes(1);
  });

  it("clicar no corpo do card abre o histórico; clicar numa ação, não", () => {
    const cb = callbacks();
    render(wrap(<FilaCard item={itemBase()} {...cb} />));
    fireEvent.click(screen.getByText("Josivana B."));
    expect(cb.onHistorico).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle(/WhatsApp/));
    expect(cb.onHistorico).toHaveBeenCalledTimes(1);
    expect(cb.onWhatsApp).toHaveBeenCalledTimes(1);
    // O painel do Resumo é onde o corretor seleciona texto: não abre o peek.
    fireEvent.click(screen.getByRole("button", { name: /Resumo/ }));
    fireEvent.click(screen.getByText(/Renda: R\$ 4.200/));
    expect(cb.onHistorico).toHaveBeenCalledTimes(1);
  });

  it("com o discador em chamada e a confirmação em voo, os botões travam", () => {
    const cb = callbacks();
    render(
      wrap(<FilaCard item={itemBase({ agendamentoId: "ag-1" })} {...cb} ligando confirmando />),
    );
    const ligar = screen.getByTitle("Discando…");
    expect(ligar).toBeDisabled();
    fireEvent.click(ligar);
    expect(cb.onLigar).not.toHaveBeenCalled();
    const confirmar = screen.getByRole("button", { name: /Confirmar/ });
    expect(confirmar).toBeDisabled();
    expect(confirmar).toHaveAttribute("aria-busy", "true");
  });

  it("as ações chamam os callbacks certos (WhatsApp, ligar, registrar, confirmar visita)", () => {
    const cb = callbacks();
    render(wrap(<FilaCard item={itemBase({ agendamentoId: "ag-1" })} {...cb} />));
    fireEvent.click(screen.getByTitle(/WhatsApp/));
    fireEvent.click(screen.getByTitle("Ligar"));
    fireEvent.click(screen.getByTitle(/Registrar contato/));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar/ }));
    expect(cb.onWhatsApp).toHaveBeenCalledTimes(1);
    expect(cb.onLigar).toHaveBeenCalledTimes(1);
    expect(cb.onRegistrarContato).toHaveBeenCalledTimes(1);
    expect(cb.onConfirmarVisita).toHaveBeenCalledTimes(1);
  });
});
