// Central de Mensagens (/mensagens) no padrão Lançamento — Fase 2 do plano das
// demais páginas (12/10/2026):
//   - frase curta no cabeçalho; a nota do modo simulado foi para o tooltip do
//     Enviar;
//   - a lista tem a contagem como dona do título ("N aguardando resposta · M
//     conversas", do mesmo agruparConversas que acende o ponto vermelho);
//   - conversa aberta em bg-accent; thread em cartão que ocupa a altura, sem
//     h-[60vh]; "Abrir lead" ghost e "Marcar tratada" no "…";
//   - no celular, mestre-detalhe: a lista primeiro e a conversa em tela cheia
//     com voltar.
// O derive (agruparConversas) continua travado por tests/mensagens-central.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Mensagem } from "@/features/mensagens/derive";

const estado = vi.hoisted(() => ({
  mobile: false,
  rows: [] as unknown[],
  aguardando: true,
  marcar: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.in = () =>
    Promise.resolve({
      data: [
        { id: "A", nome: "Lilia Santos", telefone: "(11) 98123-4455", projeto_nome: "Vibra" },
        { id: "B", nome: "Carlos Mendes", telefone: "(11) 97777-0000", projeto_nome: null },
        { id: "C", nome: "Rogério Silva", telefone: "(11) 96666-0000", projeto_nome: null },
      ],
      error: null,
    });
  return { supabase: { from: () => chain, rpc: vi.fn() } };
});
vi.mock("@/features/mensagens/mensagens-client", () => ({
  listarMensagensRecentes: async () => ({ rows: estado.rows, tabelaAusente: false }),
  listarConversasTratadas: async () => new Map(),
  conversaEstado: async () => ({
    aguardando: estado.aguardando,
    ultima_entrada: null,
    tratada_em: null,
  }),
  marcarConversaTratada: async (leadId: string) => {
    estado.marcar(leadId);
    return { aguardando: false, ultima_entrada: null, tratada_em: null };
  },
  registrarEnvioSimulado: vi.fn(),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => estado.mobile }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-realtime-invalidate", () => ({ useRealtimeInvalidate: () => {} }));
vi.mock("@/hooks/use-whatsapp-lead", () => ({ useWhatsAppLead: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params: _params,
    ...rest
  }: {
    children: ReactNode;
    to: string;
    params?: unknown;
  } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { CentralMensagens } from "@/features/mensagens/central-mensagens";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function msg(p: Partial<Mensagem> & { id: string; lead_id: string; criado_em: string }): Mensagem {
  return {
    corretor_id: "u1",
    direcao: "entrada",
    canal: "whatsapp",
    provider: "zapi",
    provider_message_id: null,
    status: "recebida",
    conteudo: "oi",
    midia_url: null,
    ...p,
  };
}

const ROWS: Mensagem[] = [
  // Lilia: duas entradas depois da última saída → 2 aguardando.
  msg({ id: "a1", lead_id: "A", direcao: "saida", criado_em: "2026-10-12T10:00:00Z" }),
  msg({
    id: "a2",
    lead_id: "A",
    criado_em: "2026-10-12T11:00:00Z",
    conteudo: "Consigo usar o FGTS?",
  }),
  msg({ id: "a3", lead_id: "A", criado_em: "2026-10-12T11:01:00Z", conteudo: "E a parcela?" }),
  // Carlos: uma entrada → 1 aguardando.
  msg({ id: "b1", lead_id: "B", criado_em: "2026-10-12T09:00:00Z", conteudo: "Cheguei" }),
  // Rogério: a conversa termina com a saída do corretor → em dia.
  msg({ id: "c1", lead_id: "C", criado_em: "2026-10-11T09:00:00Z" }),
  msg({ id: "c2", lead_id: "C", direcao: "saida", criado_em: "2026-10-11T10:00:00Z" }),
];

afterEach(() => {
  cleanup();
  estado.mobile = false;
  estado.aguardando = true;
  estado.marcar.mockClear();
});

function renderCentral() {
  estado.rows = ROWS;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CentralMensagens />
    </QueryClientProvider>,
  );
}

describe("<CentralMensagens /> no desktop", () => {
  it("o título da lista é a contagem; a aberta fica em bg-accent; o ponto vermelho conta", async () => {
    renderCentral();
    const titulo = await screen.findByRole("heading", {
      name: "2 aguardando resposta · 3 conversas",
    });
    expect(within(titulo).getByText("2 aguardando resposta").className).toContain(
      "text-destructive",
    );
    const lista = titulo.closest("section")!;
    expect(lista.className).toContain("rounded-2xl");
    expect(lista.className).toContain("border-border-subtle");

    // A mais recente (Lilia) abre por padrão no desktop.
    const lilia = await within(lista).findByRole("button", { name: /Lilia Santos/ });
    expect(lilia).toHaveAttribute("aria-current", "true");
    expect(lilia.className).toContain("bg-accent");
    expect(within(lilia).getByLabelText("2 aguardando resposta")).toHaveTextContent("2");
    const rogerio = within(lista).getByRole("button", { name: /Rogério Silva/ });
    expect(within(rogerio).queryByLabelText(/aguardando resposta/)).toBeNull();
  });

  it("a thread é um cartão com 'Abrir lead' ghost e 'Marcar tratada' no '…'", async () => {
    renderCentral();
    const thread = await screen.findByRole("region", { name: "Conversa com Lilia Santos" });
    expect(thread.className).toContain("rounded-2xl");
    expect(thread.className).not.toContain("h-[60vh]");
    expect(within(thread).getByRole("link", { name: /Abrir lead/ })).toBeInTheDocument();
    expect(within(thread).queryByRole("button", { name: /Marcar tratada/ })).toBeNull();
    // O composer continua embaixo, com a nota do modo simulado no Enviar.
    expect(within(thread).getByRole("textbox", { name: "Mensagem" })).toBeInTheDocument();
    expect(within(thread).getByRole("button", { name: /Enviar/ })).toHaveAttribute(
      "title",
      expect.stringMatching(/^Modo simulado/),
    );

    const mais = await within(thread).findByRole("button", { name: "Mais ações da conversa" });
    fireEvent.pointerDown(mais, { button: 0, pointerType: "mouse" });
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Marcar tratada/ }));
    await waitFor(() => expect(estado.marcar).toHaveBeenCalledWith("A"));
  });

  it("sem pendência na fonte única, o '…' não aparece (degrada sem quebrar)", async () => {
    estado.aguardando = false;
    renderCentral();
    const thread = await screen.findByRole("region", { name: "Conversa com Lilia Santos" });
    await waitFor(() =>
      expect(within(thread).getByRole("link", { name: /Abrir lead/ })).toBeInTheDocument(),
    );
    expect(within(thread).queryByRole("button", { name: "Mais ações da conversa" })).toBeNull();
  });
});

describe("<CentralMensagens /> no celular — mestre-detalhe", () => {
  it("lista primeiro; a conversa abre em tela cheia e 'Voltar' devolve à lista", async () => {
    estado.mobile = true;
    renderCentral();
    const lista = (
      await screen.findByRole("heading", { name: "2 aguardando resposta · 3 conversas" })
    ).closest("section")!;
    // Nenhuma thread na página e nada marcado antes do toque.
    expect(screen.queryByRole("textbox", { name: "Mensagem" })).toBeNull();
    const carlos = await within(lista).findByRole("button", { name: /Carlos Mendes/ });
    expect(carlos).not.toHaveAttribute("aria-current");

    fireEvent.click(carlos);
    const tela = await screen.findByRole("dialog", { name: "Carlos Mendes" });
    expect(within(tela).getByRole("textbox", { name: "Mensagem" })).toBeInTheDocument();
    expect(within(tela).getByRole("link", { name: /Abrir lead/ })).toBeInTheDocument();

    fireEvent.click(within(tela).getByRole("button", { name: "Voltar às conversas" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("/mensagens — cabeçalho (fonte)", () => {
  it("frase curta, sem o manual do modo simulado", () => {
    const rota = read("src/routes/_authenticated/mensagens.tsx");
    expect(rota).toContain('description="A conversa de WhatsApp de cada lead, num lugar só."');
    expect(rota).not.toContain("em modo simulado:");
    expect(read("src/features/mensagens/central-mensagens.tsx")).not.toContain("h-[60vh]");
  });
});
