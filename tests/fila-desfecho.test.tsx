// O painel do desfecho dentro do card (desktop, jsdom): "Registrar" abre,
// escolher mostra o próximo passo, Confirmar devolve a resposta à página, e
// o card registrado vira a confirmação.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
vi.mock("@/components/resumo-ia", () => ({
  ResumoIA: ({ leadId }: { leadId: string }) => <div>resumo de {leadId}</div>,
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
const abrirSamiQ = vi.hoisted(() => vi.fn());
vi.mock("@/components/samiq/abrir-samiq", () => ({
  abrirSamiQ,
  textoRegistrarComSami: (nome: string) => `Falei com ${nome}: `,
}));

import { FilaCard } from "@/features/fila-unica/fila-card";
import { desfechoPara } from "@/features/fila-unica/desfecho";
import type { FilaUnicaItem } from "@/features/fila-unica/derive";

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const item: FilaUnicaItem = {
  lead: {
    id: "11111111-1111-4111-8111-111111111111",
    nome: "Josivana B.",
    telefone: "11999990000",
    email: null,
    status: "analise_credito",
    temperatura: "quente",
    ultima_interacao: "2026-06-25T12:00:00Z",
    proximo_followup: null,
    projeto_nome: "Liber Jaçanã",
    created_at: "2026-06-01T12:00:00Z",
    corretor_id: "c1",
    origem: "facebook",
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
  },
  bucket: "fundo",
  fonte: "inbox",
  filaInbox: "esfriando",
  motivo: "quente sem contato há 79 dia(s)",
  score: 80,
  tier: "alta",
  diasParado: 79,
  proximoPasso: null,
  prazo: null,
  vencidoMin: 0,
  venceHoje: false,
  docsPendentes: 0,
  agendamentoId: null,
  visitaEm: null,
  valorEmJogo: null,
};

const cb = () => ({
  onWhatsApp: vi.fn(),
  onLigar: vi.fn(),
  onRegistrarContato: vi.fn(),
  onHistorico: vi.fn(),
  onEtapaDirect: vi.fn(),
  onEtapaModal: vi.fn(),
  onEtapaPerdido: vi.fn(),
  onConfirmarVisita: vi.fn(),
  onDesfecho: vi.fn(),
});

afterEach(() => {
  cleanup();
  abrirSamiQ.mockReset();
});

describe("FilaCard + FilaDesfecho", () => {
  it("Registrar abre 'o que aconteceu?'; escolher mostra o próximo passo; Confirmar devolve a resposta", () => {
    const c = cb();
    const agora = new Date("2026-09-12T10:00:00-03:00");
    render(wrap(<FilaCard item={item} desfecho={desfechoPara(item)} agora={agora} {...c} />));
    expect(screen.queryByTestId("desfecho-painel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Registrar/ }));
    const painel = screen.getByTestId("desfecho-painel");
    expect(within(painel).getByText("O que aconteceu com Josivana?")).toBeInTheDocument();
    expect(within(painel).getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByTestId("desfecho-proximo")).toHaveTextContent("escolha um resultado");
    const confirmar = within(painel).getByRole("button", { name: /Confirmar/ });
    expect(confirmar).toBeDisabled();

    fireEvent.click(within(painel).getByRole("radio", { name: "Falei · aguardando Caixa" }));
    expect(screen.getByTestId("desfecho-proximo")).toHaveTextContent(/cobrar o correspondente · /);
    fireEvent.click(confirmar);
    expect(c.onDesfecho).toHaveBeenCalledTimes(1);
    expect(c.onDesfecho.mock.calls[0][1].id).toBe("aguardando_caixa");
    // O diálogo detalhado não é chamado pelo botão de polegar — ele mora no "⋯".
    expect(c.onRegistrarContato).not.toHaveBeenCalled();
    // Confirmar fecha o painel.
    expect(screen.queryByTestId("desfecho-painel")).toBeNull();
  });

  it("a resposta com objeção pede o texto; 'ditar' abre a Sami com o lead", () => {
    const c = cb();
    const visita = { ...item, lead: { ...item.lead, status: "visita_realizada" } };
    render(wrap(<FilaCard item={visita} desfecho={desfechoPara(visita)} {...c} />));
    fireEvent.click(screen.getByRole("button", { name: /Registrar/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Falei · objeção" }));
    const campo = screen.getByLabelText("Objeção");
    fireEvent.change(campo, { target: { value: "parcela alta" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar/ }));
    expect(c.onDesfecho.mock.calls[0][1].id).toBe("objecao");
    expect(c.onDesfecho.mock.calls[0][2]).toBe("parcela alta");
  });

  it("o botão de ditar abre a Sami com o lead e o texto de registro", () => {
    const c = cb();
    render(wrap(<FilaCard item={item} desfecho={desfechoPara(item)} {...c} />));
    fireEvent.click(screen.getByRole("button", { name: /Registrar/ }));
    fireEvent.click(screen.getByRole("button", { name: /ditar por voz/ }));
    expect(abrirSamiQ).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: item.lead.id, origem: "fila-unica" }),
    );
  });

  it("registrado: o card vira a confirmação com o próximo passo", () => {
    const c = cb();
    render(
      wrap(
        <FilaCard
          item={item}
          desfecho={desfechoPara(item)}
          registrado="cobrar o correspondente · qua, 17 set"
          {...c}
        />,
      ),
    );
    const card = screen.getByTestId("fila-card");
    expect(card).toHaveAttribute("data-registrado");
    expect(card).toHaveTextContent(/Registrado\./);
    expect(card).toHaveTextContent("cobrar o correspondente · qua, 17 set");
    expect(screen.queryByRole("button", { name: /Registrar/ })).toBeNull();
  });

  it("sem o desfecho (quem ainda não o passou), Registrar continua abrindo o diálogo detalhado", () => {
    const c = cb();
    render(wrap(<FilaCard item={item} {...c} />));
    fireEvent.click(screen.getByRole("button", { name: /Registrar/ }));
    expect(c.onRegistrarContato).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("desfecho-painel")).toBeNull();
  });
});
