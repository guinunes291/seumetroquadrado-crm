// Atender (/atendimento, e /blitz que redireciona para o Volume) no padrão
// Lançamento — Fase 2 do plano das demais páginas (12/10/2026):
//   - um título com frase curta, sem a frase de manual; "Fila Única" vira
//     link discreto; a pílula Volume/Consulta é o controle segmentado;
//   - o topo do Volume tem três números com dono (na carteira · SLA
//     estourado · sem contato há 5+ dias), contados da fila e do
//     leads_com_sla que a tela já carregava — nenhuma consulta nova;
//   - o cartão segue o molde do próximo lead da Prospecção, com Registrar
//     contato como a única ação navy e Ligar pelo useLigarLead (3C Plus);
//   - mudar etapa, Agendar visita e Abrir dossiê ficam no "…"; observações e
//     o Resumo da Sami atrás de "Ver resumo".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const dados = vi.hoisted(() => ({
  leads: [] as unknown[],
  sla: [] as unknown[],
  consulta: [] as unknown[],
}));
const acoes = vi.hoisted(() => ({ ligar: vi.fn(), mudarEtapa: vi.fn(), whatsapp: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "not", "in", "order"]) chain[m] = () => chain;
  chain.limit = () => Promise.resolve({ data: dados.leads, error: null });
  return {
    supabase: {
      from: () => chain,
      rpc: () => Promise.resolve({ data: dados.sla, error: null }),
    },
  };
});
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }),
  useUserRoles: () => ({
    isAdmin: false,
    isGestor: false,
    isSuperintendente: false,
    isCorretor: true,
    loading: false,
  }),
}));
vi.mock("@/hooks/use-realtime-invalidate", () => ({ useRealtimeInvalidate: () => {} }));
vi.mock("@/hooks/use-lead-status", () => ({
  useLeadStatusMutation: () => ({ mutate: acoes.mudarEtapa, isPending: false }),
}));
vi.mock("@/hooks/use-ligar-lead", () => ({
  useLigarLead: () => ({ ligar: acoes.ligar, discando: false }),
}));
vi.mock("@/components/lead-stage/lead-stage-modals", () => ({
  LeadStageModals: ({ modalState }: { modalState: { modal: string } | null }) =>
    modalState ? <div data-testid={`modal-${modalState.modal}`} /> : null,
}));
vi.mock("@/components/registrar-contato-dialog", () => ({
  RegistrarContatoDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="registrar-aberto" /> : null,
}));
vi.mock("@/hooks/use-whatsapp-lead", () => ({ useWhatsAppLead: () => acoes.whatsapp }));
vi.mock("@/features/leads/lead-peek-drawer", () => ({
  LeadPeekDrawer: ({ lead: l }: { lead: { nome: string } | null }) =>
    l ? <div data-testid="peek">{l.nome}</div> : null,
}));
vi.mock("@/features/leads/leads-query", async (original) => ({
  ...(await original<typeof import("@/features/leads/leads-query")>()),
  fetchLeadsFiltered: async () => ({ rows: dados.consulta, source: "v5" }),
}));
vi.mock("@/components/resumo-ia", () => ({
  ResumoIA: () => <div data-testid="resumo-ia" />,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params: _params,
    search: _search,
    ...rest
  }: {
    children: ReactNode;
    to: string;
    params?: unknown;
    search?: unknown;
  } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { VolumeView } from "@/features/atendimento/volume-view";
import { DIAS_SEM_CONTATO, resumoDoVolume } from "@/features/atendimento/volume-resumo";
import { ConsultaView } from "@/features/atendimento/consulta-view";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const AGORA = new Date("2026-10-12T15:00:00Z");
const diasAtras = (d: number, base = Date.now()) => new Date(base - d * 86_400_000).toISOString();
const minAtras = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function lead(over: Record<string, unknown>) {
  return {
    email: null,
    telefone: "11999990000",
    cpf: null,
    origem: "meta_ads",
    corretor_id: "00000000-0000-4000-8000-000000000001",
    projeto_id: null,
    projeto_nome: null,
    observacoes: null,
    temperatura: null,
    proximo_followup: null,
    ultima_interacao: null,
    ultimo_contato: null,
    renda_informada: null,
    entrada_disponivel: null,
    usa_fgts: null,
    campanha: null,
    created_at: diasAtras(1),
    ...over,
  };
}

afterEach(() => {
  cleanup();
  acoes.ligar.mockClear();
  acoes.mudarEtapa.mockClear();
  acoes.whatsapp.mockClear();
});

describe("resumoDoVolume — os três números do topo", () => {
  it("conta SLA estourado e o mais antigo, só entre os leads da fila", () => {
    const fila = [
      { id: "a", ultima_interacao: null, ultimo_contato: null, created_at: diasAtras(0, +AGORA) },
      { id: "b", ultima_interacao: null, ultimo_contato: null, created_at: diasAtras(0, +AGORA) },
    ];
    const sla = new Map([
      ["a", { sla_status: "estourado", minutos_decorridos: 35 }],
      ["b", { sla_status: "estourado", minutos_decorridos: 90 }],
      ["fora-da-fila", { sla_status: "estourado", minutos_decorridos: 999 }],
    ]);
    const r = resumoDoVolume(fila, sla, AGORA);
    expect(r.naCarteira).toBe(2);
    expect(r.slaEstourado).toBe(2);
    expect(r.slaMaisAntigoMin).toBe(90);
  });

  it("sem contato usa o toque mais recente (interação ou contato) e, sem toque, a chegada", () => {
    const base = +AGORA;
    const fila = [
      // Interação antiga, mas contato registrado há 2 dias: está em dia.
      {
        id: "a",
        ultima_interacao: diasAtras(12, base),
        ultimo_contato: diasAtras(2, base),
        created_at: diasAtras(30, base),
      },
      // Nunca tocado, chegou há 9 dias: conta.
      { id: "b", ultima_interacao: null, ultimo_contato: null, created_at: diasAtras(9, base) },
      // Exatamente no limite: conta.
      {
        id: "c",
        ultima_interacao: diasAtras(DIAS_SEM_CONTATO, base),
        ultimo_contato: null,
        created_at: diasAtras(40, base),
      },
      // Um dia antes do limite: não conta.
      {
        id: "d",
        ultima_interacao: diasAtras(DIAS_SEM_CONTATO - 1, base),
        ultimo_contato: null,
        created_at: diasAtras(40, base),
      },
    ];
    const r = resumoDoVolume(fila, new Map(), AGORA);
    expect(r.semContato).toBe(2);
    expect(r.semContatoMaisAntigoDias).toBe(9);
    expect(r.slaEstourado).toBe(0);
    expect(r.slaMaisAntigoMin).toBeNull();
  });
});

function renderVolume() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <VolumeView />
    </QueryClientProvider>,
  );
}

describe("<VolumeView /> no padrão Lançamento", () => {
  function carregar() {
    dados.leads = [
      lead({
        id: "l-roberta",
        nome: "Roberta Campos",
        status: "aguardando_atendimento",
        temperatura: "quente",
        projeto_nome: "Vibra Barra Funda",
        renda_informada: "R$ 5.200",
        entrada_disponivel: "R$ 15.000",
        usa_fgts: true,
        observacoes: "Prefere contato depois das 18h.",
        created_at: minAtras(35),
      }),
      lead({
        id: "l-carlos",
        nome: "Carlos Mendes",
        status: "em_atendimento",
        temperatura: "morno",
        ultima_interacao: diasAtras(12),
        ultimo_contato: diasAtras(2),
      }),
      lead({
        id: "l-sueli",
        nome: "Sueli Ramos",
        status: "qualificado",
        created_at: diasAtras(9),
      }),
    ];
    dados.sla = [
      { lead_id: "l-roberta", sla_status: "estourado", minutos_decorridos: 35, sla_minutos: 15 },
    ];
  }

  it("topo com três números com dono e o 'N de M' dentro; a cor só acende acima de zero", async () => {
    carregar();
    renderVolume();
    const topo = await screen.findByRole("region", { name: "Como está a carteira" });
    expect(within(topo).getByText("Na carteira")).toBeInTheDocument();
    expect(within(topo).getByText("3")).toBeInTheDocument();
    expect(within(topo).getByText("1 de 3")).toBeInTheDocument();
    expect(
      within(topo).getByRole("progressbar", { name: "Você está no lead 1 de 3" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(topo).getByText("Com SLA estourado").parentElement?.parentElement,
      ).toHaveTextContent(/1o mais antigo há 35 min/),
    );
    const sla = within(topo)
      .getAllByText("1")
      .find((el) => el.className.includes("text-destructive"));
    expect(sla).toBeTruthy();
    const semContato = within(topo).getByText(`Sem contato há ${DIAS_SEM_CONTATO}+ dias`);
    expect(semContato.parentElement?.parentElement).toHaveTextContent("o mais antigo há 9 dias");
  });

  it("o cartão segue o molde da Prospecção: etapa, nome, seis campos e Registrar contato navy", async () => {
    carregar();
    renderVolume();
    const cartao = await screen.findByRole("region", { name: "Lead da vez: Roberta Campos" });
    expect(within(cartao).getByRole("heading", { name: "Roberta Campos" })).toBeInTheDocument();
    expect(within(cartao).getByText("Aguardando atendimento")).toBeInTheDocument();
    expect(within(cartao).getByText("SLA estourado")).toBeInTheDocument();
    for (const rotulo of ["Empreendimento", "Origem", "Renda", "FGTS", "Entrada", "Último contato"])
      expect(within(cartao).getByText(rotulo)).toBeInTheDocument();
    for (const valor of ["Vibra Barra Funda", "R$ 5.200", "Sim", "R$ 15.000"])
      expect(within(cartao).getByText(valor)).toBeInTheDocument();
    expect(within(cartao).getByText(/^lead novo · /)).toBeInTheDocument();

    // Uma ação navy só (variant default = bg-primary); Ligar e WhatsApp contornados.
    const registrar = within(cartao).getByRole("button", { name: /Registrar contato/ });
    expect(registrar.className).toContain("bg-primary");
    for (const nome of [/^Ligar/, /^WhatsApp/]) {
      const b = within(cartao).getByRole("button", { name: nome });
      expect(b.className).not.toContain("bg-primary");
      expect(b.className).not.toContain("text-success");
    }
    // Observações e Resumo da Sami não estão no cartão.
    expect(screen.queryByText("Prefere contato depois das 18h.")).toBeNull();
    expect(screen.queryByTestId("resumo-ia")).toBeNull();
  });

  it("Ligar (botão e tecla L) disca pelo useLigarLead, com id, nome e telefone", async () => {
    carregar();
    renderVolume();
    const cartao = await screen.findByRole("region", { name: "Lead da vez: Roberta Campos" });
    fireEvent.click(within(cartao).getByRole("button", { name: /^Ligar/ }));
    expect(acoes.ligar).toHaveBeenCalledWith({
      id: "l-roberta",
      nome: "Roberta Campos",
      telefone: "11999990000",
    });
    fireEvent.keyDown(window, { key: "l" });
    expect(acoes.ligar).toHaveBeenCalledTimes(2);
    // Com modificador (Ctrl+L é do navegador) o Volume não liga.
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    expect(acoes.ligar).toHaveBeenCalledTimes(2);
  });

  it("atalhos que não mudaram: ← → andam na fila e A abre o agendamento", async () => {
    carregar();
    renderVolume();
    await screen.findByRole("region", { name: "Lead da vez: Roberta Campos" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("2 de 3", { selector: "span" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(await screen.findByRole("region", { name: "Lead da vez: Roberta Campos" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "a" });
    expect(screen.getByTestId("modal-agendado")).toBeInTheDocument();
  });

  it("os botões do cartão andam na fila e R abre Registrar contato", async () => {
    carregar();
    renderVolume();
    const cartao = await screen.findByRole("region", { name: "Lead da vez: Roberta Campos" });
    expect(within(cartao).getByRole("button", { name: "Lead anterior" })).toBeDisabled();
    fireEvent.click(within(cartao).getByRole("button", { name: "Próximo lead" }));
    expect(await screen.findByText("2 de 3", { selector: "span" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "r" });
    expect(screen.getByTestId("registrar-aberto")).toBeInTheDocument();
  });

  it("mudar etapa, Agendar visita e Abrir dossiê moram no '…'", async () => {
    carregar();
    renderVolume();
    const cartao = await screen.findByRole("region", { name: "Lead da vez: Roberta Campos" });
    expect(within(cartao).queryByRole("button", { name: /Agendar/ })).toBeNull();
    const mais = within(cartao).getByRole("button", { name: /^Mais ações/ });
    fireEvent.pointerDown(mais, { button: 0, pointerType: "mouse" });
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Agendar visita/ })).toBeInTheDocument();
    const dossie = within(menu).getByRole("menuitem", { name: /Abrir dossiê/ });
    expect(dossie.getAttribute("href")).toBe("/leads/$leadId");
    expect(within(menu).getByText("Mover para")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Marcar como perdido/ })).toBeInTheDocument();
    // Com o menu aberto, as setas são do menu — a fila não anda.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(within(cartao).getByText("1 de 3")).toBeInTheDocument();
  });

  it("observações e o Resumo da Sami ficam atrás de 'Ver resumo'", async () => {
    carregar();
    renderVolume();
    const ver = await screen.findByRole("button", { name: /Ver resumo/ });
    expect(ver).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(ver);
    expect(ver).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Prefere contato depois das 18h.")).toBeInTheDocument();
    expect(screen.getByTestId("resumo-ia")).toBeInTheDocument();
  });

  it("os atalhos são uma linha discreta, escondida no celular", async () => {
    carregar();
    renderVolume();
    await screen.findByRole("region", { name: "Lead da vez: Roberta Campos" });
    const linha = screen.getByText(/Atalhos: ← → navegar/).parentElement!;
    expect(linha.className).toContain("hidden");
    expect(linha.className).toContain("md:flex");
    expect(linha.querySelectorAll("kbd").length).toBeGreaterThanOrEqual(3);
  });
});

describe("<ConsultaView /> no padrão Lançamento", () => {
  function renderConsulta() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ConsultaView />
      </QueryClientProvider>,
    );
  }

  it("a contagem é o título da lista; as linhas são EntityRow no cartão padrão", async () => {
    dados.consulta = [
      lead({ id: "c1", nome: "Ana Paula", status: "em_atendimento", total_count: 2 }),
      lead({ id: "c2", nome: "Bruno Lima", status: "qualificado", total_count: 2 }),
    ];
    renderConsulta();
    const titulo = await screen.findByRole("heading", { name: "2 leads" });
    const cartao = titulo.closest("section")!;
    expect(cartao.className).toContain("rounded-2xl");
    expect(cartao.className).toContain("border-border-subtle");
    const tabela = within(cartao).getByRole("table", { name: "2 leads" });
    const linhas = within(tabela).getAllByRole("row");
    expect(linhas).toHaveLength(2);
    // A linha inteira abre o resumo (peek), por clique ou Enter.
    fireEvent.keyDown(linhas[1], { key: "Enter" });
    expect(screen.getByTestId("peek")).toHaveTextContent("Bruno Lima");
    // A busca, os Filtros e o caminho para Meus Leads continuam.
    expect(screen.getByRole("textbox", { name: "Buscar lead" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filtros/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir em Meus Leads" })).toBeInTheDocument();
  });

  it("Ligar da linha disca pelo useLigarLead e não abre o resumo", async () => {
    dados.consulta = [
      lead({ id: "c1", nome: "Ana Paula", status: "em_atendimento", total_count: 1 }),
    ];
    renderConsulta();
    fireEvent.click(await screen.findByRole("button", { name: "Ligar para Ana Paula" }));
    expect(acoes.ligar).toHaveBeenCalledWith({
      id: "c1",
      nome: "Ana Paula",
      telefone: "11999990000",
    });
    expect(screen.queryByTestId("peek")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir WhatsApp de Ana Paula" }));
    expect(acoes.whatsapp).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
  });
});

describe("/atendimento — cabeçalho e pílula (fonte)", () => {
  const rota = read("src/routes/_authenticated/atendimento.tsx");
  const volume = read("src/features/atendimento/volume-view.tsx");

  it("frase curta, sem a frase de manual, e a Fila Única como link discreto", () => {
    expect(rota).toContain('description="Um lead por vez, a carteira inteira — ou busque alguém."');
    expect(rota).not.toContain("As filas por prioridade agora são a Fila Única");
    expect(rota).toContain("Ir para a Fila Única");
    expect(rota).not.toMatch(/<Button[^>]*>\s*<Link to="\/fila"/);
  });

  it("a pílula Volume/Consulta é o controle segmentado (Tabs), não o bloco custom", () => {
    expect(rota).toContain('<TabsList aria-label="Modo de atendimento"');
    expect(rota).not.toContain("rounded-lg border bg-muted/40 p-1");
  });

  it("o Volume não abre mais tel: direto nem usa o Card max-w-4xl", () => {
    expect(volume).toContain("useLigarLead()");
    expect(volume).not.toContain("window.location.href = `tel:");
    expect(volume).not.toContain("max-w-4xl");
    // Nenhuma consulta nova: as duas chaves de sempre.
    expect(volume.match(/queryKey: \[/g)?.length).toBe(2);
  });
});
