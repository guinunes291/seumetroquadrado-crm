// Kanban (/pipeline) no padrão Lançamento — Fase 2 do plano das demais
// páginas. Funil: título fixo "Kanban" (a ?fase não troca mais o título, só
// recorta as colunas e aparece como chip), abas e busca numa linha, a
// instrução de arrastar só para leitor de tela, quatro números com dono
// somados do snapshot e os sinais de cada coluna em texto miúdo. Fechamento:
// um cartão "Reta final" (anel dos fortes, alta · média · baixa e "Trabalhar
// os fortes"), linhas com nome, etapa, índice e uma linha de fatores, a taxa
// histórica na dica do selo e a explicação atrás de "Ver como o índice é
// calculado". O cartão do Kanban, o próximo passo de 44 px, o fio por etapa,
// a RPC do Fechamento e o ?tab=fechamento seguem travados nos testes antigos.

import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rota = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
  novoLead: vi.fn(),
}));

const banco = vi.hoisted(() => ({
  snapshot: [] as Record<string, unknown>[],
  paginas: {} as Record<string, unknown[]>,
  fechamento: null as unknown,
  chamadas: [] as { nome: string; args: Record<string, unknown> }[],
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({
    ...opts,
    useSearch: () => rota.search,
    useNavigate: () => rota.navigate,
  }),
  redirect: (x: unknown) => x,
  Link: ({
    children,
    to,
    params,
    className,
  }: {
    children: ReactNode;
    to: string;
    params?: { leadId?: string };
    className?: string;
  }) => (
    <a href={to.replace("$leadId", params?.leadId ?? "")} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (nome: string, args: Record<string, unknown> = {}) => {
      banco.chamadas.push({ nome, args });
      if (nome === "pipeline_stage_page_v2") {
        return {
          data: {
            items: banco.paginas[String(args._status)] ?? [],
            has_more: false,
            next_cursor: null,
          },
          error: null,
        };
      }
      if (nome === "pipeline_snapshot_v3") return { data: banco.snapshot, error: null };
      if (nome === "leads_sla_pendentes") return { data: [], error: null };
      if (nome === "fechamento_sinais_v1") return { data: banco.fechamento, error: null };
      return { data: null, error: { message: `rpc inesperada: ${nome}` } };
    },
    from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
  },
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
  useUserRoles: () => ({
    isAdmin: false,
    isGestor: false,
    isSuperintendente: false,
    isCorretor: true,
    loading: false,
  }),
}));
vi.mock("@/features/em-atendimento/use-em-atendimento", () => ({
  useEmAtendimentoContador: () => ({
    data: { corretor: true, teto: 65, em_atendimento: 37 },
  }),
}));
vi.mock("@/hooks/use-lead-status", () => ({
  useLeadStatusMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-realtime-invalidate", () => ({ useRealtimeInvalidate: () => {} }));
vi.mock("@/hooks/use-whatsapp-lead", () => ({ useWhatsAppLead: () => vi.fn() }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/lead-stage-menu", () => ({ LeadStageMenu: () => null }));
vi.mock("@/components/lead-stage/lead-stage-modals", () => ({ LeadStageModals: () => null }));
vi.mock("@/components/registrar-contato-dialog", () => ({ RegistrarContatoDialog: () => null }));
vi.mock("@/components/sla-badge", () => ({ SlaBadge: () => null }));
vi.mock("@/components/transfer-sla-badge", () => ({
  TransferSlaBadge: () => null,
  useTransferTimeouts: () => ({}),
}));
vi.mock("@/features/leads/lead-peek-drawer", () => ({ LeadPeekDrawer: () => null }));
vi.mock("@/features/leads/novo-lead-dialog", () => ({ abrirNovoLead: rota.novoLead }));

import { Route } from "@/routes/_authenticated/pipeline";
import { KanbanBoard } from "@/components/leads-kanban-board";
import { ModuloAtualContext } from "@/features/nav/modulo-atual";
import { somarSinaisDoFunil } from "@/features/pipeline/stage-metrics";
import { INTENT_BADGE } from "@/lib/status-tones";

const SNAPSHOT = [
  {
    etapa: "aguardando_atendimento",
    quantidade: 4,
    followups_vencidos: 0,
    sem_proxima_acao: 0,
    parados_ha_7_dias: 0,
    vgv: 1_200_000,
  },
  {
    etapa: "em_atendimento",
    quantidade: 37,
    followups_vencidos: 2,
    sem_proxima_acao: 1,
    parados_ha_7_dias: 2,
    vgv: 10_700_000,
  },
  {
    etapa: "agendado",
    quantidade: 7,
    followups_vencidos: 1,
    sem_proxima_acao: 0,
    parados_ha_7_dias: 0,
    vgv: 2_000_000,
  },
  // Fora das colunas: não entra no topo.
  {
    etapa: "perdido",
    quantidade: 10,
    followups_vencidos: 5,
    sem_proxima_acao: 5,
    parados_ha_7_dias: 5,
    vgv: 0,
  },
];

const ROGERIO = {
  id: "00000000-0000-4000-8000-0000000000a1",
  nome: "Rogério Silva",
  email: "rogerio@exemplo.com",
  telefone: "(11) 98310-4471",
  status: "em_atendimento",
  corretor_id: null,
  projeto_id: null,
  projeto_nome: "Longitude Butantã",
  observacoes: null,
  temperatura: "morno",
  origem: "meta",
  data_distribuicao: null,
  tentativas_redistribuicao: 0,
  via_webhook: false,
  created_at: "2026-10-01T10:00:00Z",
  ultima_interacao: "2026-10-08T10:00:00Z",
};

function sinal(over: Record<string, unknown>) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    nome: "Márcio Teixeira",
    telefone: "(11) 99876-1022",
    status: "analise_credito",
    temperatura: "quente",
    ultima_interacao: null,
    proximo_followup: null,
    projeto_nome: "Vibra Barra Funda",
    indice: 73,
    nivel: "alta",
    metodo: "historico_calibrado",
    taxa_historica_pct: 58.1,
    amostra_etapa: 148,
    vendas_aprovadas_etapa: 86,
    documentos_pendentes: 2,
    fatores: ["Em análise de crédito", "Temperatura quente"],
    ...over,
  };
}

function fechamento(items: unknown[], contagens = { alta: 6, media: 18, baixa: 30 }) {
  return {
    items,
    total_count: contagens.alta + contagens.media + contagens.baixa,
    contagens,
    limit: 50,
    amostra_minima: 30,
    janela_coorte_dias: 365,
    horizonte_conversao_dias: 90,
    indice_semantica: "sinal_de_priorizacao_nao_probabilidade",
  };
}

function montar(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ModuloAtualContext.Provider value={{ numero: 3, titulo: "Gestão de Carteira" }}>
        {ui}
      </ModuloAtualContext.Provider>
    </QueryClientProvider>,
  );
}

function renderPipeline(search: Record<string, unknown> = {}) {
  rota.search = search;
  const Pagina = (Route as unknown as { component: () => ReactNode }).component;
  return montar(<Pagina />);
}

beforeAll(() => {
  // Movimento reduzido: os números aparecem direto, sem a contagem animada.
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  rota.navigate.mockReset();
  rota.novoLead.mockReset();
  banco.snapshot = SNAPSHOT;
  banco.paginas = { em_atendimento: [ROGERIO] };
  banco.chamadas = [];
  banco.fechamento = fechamento([
    sinal({}),
    sinal({
      id: "00000000-0000-4000-8000-000000000002",
      nome: "Jéssica Lopes",
      status: "visita_realizada",
      indice: 65,
      metodo: "heuristico",
      taxa_historica_pct: null,
      amostra_etapa: 24,
      vendas_aprovadas_etapa: 3,
      documentos_pendentes: 0,
      fatores: ["Visita realizada", "Interação nos últimos 2 dias"],
      projeto_nome: "Conx Vila Prudente",
    }),
    sinal({
      id: "00000000-0000-4000-8000-000000000003",
      nome: "Carlos Mendes",
      status: "agendado",
      indice: 40,
      nivel: "media",
      metodo: "heuristico",
      taxa_historica_pct: null,
      amostra_etapa: 27,
      vendas_aprovadas_etapa: 2,
      documentos_pendentes: 0,
      fatores: ["Visita agendada"],
    }),
  ]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("somarSinaisDoFunil", () => {
  it("soma os sinais das colunas e aponta a etapa que mais pesa", () => {
    const s = somarSinaisDoFunil(SNAPSHOT.slice(0, 3));
    expect(s.leads).toBe(48);
    expect(s.vencidos).toEqual({ total: 3, maiorEtapa: "em_atendimento", naMaiorEtapa: 2 });
    expect(s.semAcao).toEqual({ total: 1, maiorEtapa: "em_atendimento", naMaiorEtapa: 1 });
    expect(s.parados.total).toBe(2);
  });

  it("aceita contagens como texto (bigint do PostgREST) e zera sem dono", () => {
    const s = somarSinaisDoFunil([
      { etapa: "agendado", quantidade: "3", followups_vencidos: "0", sem_proxima_acao: null },
    ]);
    expect(s.leads).toBe(3);
    expect(s.vencidos).toEqual({ total: 0, maiorEtapa: null, naMaiorEtapa: 0 });
    expect(s.semAcao.total).toBe(0);
  });
});

describe("/pipeline — Funil", () => {
  it("um título só, fixo: Kanban com o eyebrow do módulo e uma frase", () => {
    renderPipeline();
    const titulos = screen.getAllByRole("heading", { level: 1 });
    expect(titulos).toHaveLength(1);
    expect(titulos[0].textContent).toBe("Kanban");
    expect(screen.getByText("Módulo 03 · Gestão de Carteira")).toBeTruthy();
    expect(screen.getByText("Arraste a etapa; o Fechamento ordena o fundo do funil.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Novo lead/ }));
    expect(rota.novoLead).toHaveBeenCalledTimes(1);
  });

  it("a ?fase não troca mais o título — recorta as colunas e vira um chip que limpa", async () => {
    renderPipeline({ fase: "carteira", tab: "fechamento" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Kanban");
    expect(screen.queryByText("Gestão de Carteira", { selector: "h1" })).toBeNull();
    cleanup();

    renderPipeline({ fase: "carteira" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Kanban");
    await screen.findByTestId("kanban-resumo");
    await waitFor(() => expect(document.getElementById("kanban-col-em_atendimento")).toBeTruthy());
    // Carteira = em atendimento em diante: o topo do funil não vira coluna.
    expect(document.getElementById("kanban-col-aguardando_atendimento")).toBeNull();
    const chip = screen.getByRole("button", { name: /Só Carteira/ });
    fireEvent.click(chip);
    const { search } = rota.navigate.mock.calls[0][0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(search({ fase: "carteira", tab: undefined })).toEqual({
      fase: undefined,
      tab: undefined,
    });
    cleanup();

    renderPipeline({ fase: "prospeccao" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Kanban");
    // Em Prospecção não há Fechamento: só o quadro, com a busca.
    expect(screen.queryByRole("tab", { name: "Fechamento" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Buscar leads no funil" })).toBeTruthy();
  });

  it("abas e busca numa linha; a instrução de arrastar só para leitor de tela", async () => {
    renderPipeline();
    const abas = screen.getByRole("tablist", { name: "Visões do pipeline" });
    expect(within(abas).getByRole("tab", { name: "Funil" })).toBeTruthy();
    expect(within(abas).getByRole("tab", { name: "Fechamento" })).toBeTruthy();
    // A busca é irmã da faixa de abas (mesma linha), e o quadro não desenha outra.
    const busca = screen.getByRole("textbox", { name: "Buscar leads no funil" });
    expect(screen.getAllByRole("textbox", { name: "Buscar leads no funil" })).toHaveLength(1);
    expect(busca.closest('[role="tabpanel"]')).toBeNull();

    const instrucao = document.getElementById("kanban-instructions")!;
    expect(instrucao.className).toContain("sr-only");
    const quadro = await screen.findByRole("region", { name: "Funil de leads" });
    expect(quadro.getAttribute("aria-describedby")).toBe("kanban-instructions");
  });

  it("quatro números com dono somados do snapshot; a cor só acende acima de zero", async () => {
    renderPipeline();
    const resumo = await screen.findByTestId("kanban-resumo");
    await waitFor(() => expect(within(resumo).getByText("R$ 13,9 mi")).toBeTruthy());
    expect(within(resumo).getByText("VGV no funil")).toBeTruthy();
    expect(within(resumo).getByText("48 leads no funil")).toBeTruthy();

    const tile = (titulo: string) => within(resumo).getByText(titulo).closest("div.rounded-xl")!;
    expect(tile("Follow-ups vencidos").textContent).toContain("3");
    expect(tile("Follow-ups vencidos").textContent).toContain("2 em Em atendimento");
    expect(tile("Follow-ups vencidos").className).toContain("text-destructive");
    expect(tile("Sem próxima ação").textContent).toContain("1 em Em atendimento");
    expect(tile("Parados 7+ dias").className).toContain("text-warning");
    // O VGV saiu da linha da busca: é o primeiro número do topo.
    expect(screen.queryByText(/VGV no funil:/)).toBeNull();
  });

  it("zerado, o número fica neutro", async () => {
    banco.snapshot = [{ ...SNAPSHOT[0] }];
    renderPipeline();
    const resumo = await screen.findByTestId("kanban-resumo");
    await waitFor(() => expect(within(resumo).getByText("nenhum vencido")).toBeTruthy());
    const tile = within(resumo).getByText("Follow-ups vencidos").closest("div.rounded-xl")!;
    expect(tile.className).not.toContain("text-destructive");
    expect(within(resumo).getByText("ninguém parado")).toBeTruthy();
  });

  it("a coluna: nome, contagem e sinais em texto miúdo — sem os selos de 10 px", async () => {
    renderPipeline();
    await waitFor(() => expect(document.getElementById("kanban-col-em_atendimento")).toBeTruthy());
    const coluna = document.getElementById("kanban-col-em_atendimento")!.closest("section")!;
    const sinais = await within(coluna).findByTestId("kanban-sinais-coluna");
    expect(sinais.textContent).toContain("2 vencidos");
    expect(sinais.textContent).toContain("1 sem ação");
    expect(sinais.textContent).toContain("2 parados");
    // O cabeçalho da coluna (nome + contagem) não tem mais selo de 10 px.
    const cabecalho = document.getElementById("kanban-col-em_atendimento")!.parentElement!;
    expect(cabecalho.querySelector(".text-\\[10px\\]")).toBeNull();
    expect(cabecalho.querySelector(".bg-destructive\\/15, .bg-warning\\/15")).toBeNull();
    // VGV e conversão da etapa ficam na dica da contagem.
    expect(within(coluna).getByTitle(/VGV R\$ 10,7 mi · conv\. /)).toBeTruthy();
    expect(within(coluna).queryByText(/^conv\./)).toBeNull();
    // A etapa sem sinal não ganha linha vazia.
    const aguardando = document
      .getElementById("kanban-col-aguardando_atendimento")!
      .closest("section")!;
    expect(within(aguardando).queryByTestId("kanban-sinais-coluna")).toBeNull();
    // O cartão não mudou: contato à vista e o próximo passo de 44 px.
    expect(within(coluna).getByText("(11) 98310-4471")).toBeTruthy();
    expect(within(coluna).getByText("rogerio@exemplo.com")).toBeTruthy();
    expect(
      within(coluna)
        .getByText(/próximo passo:/)
        .closest("button")!.className,
    ).toContain("min-h-11");
  });

  it("a busca da linha das abas chega ao quadro (mesmas RPCs, com _query)", async () => {
    renderPipeline();
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar leads no funil" }), {
      target: { value: "rogério" },
    });
    await waitFor(
      () =>
        expect(
          banco.chamadas.some(
            (c) => c.nome === "pipeline_snapshot_v3" && c.args._query === "rogério",
          ),
        ).toBe(true),
      { timeout: 2000 },
    );
    expect(
      banco.chamadas.some(
        (c) => c.nome === "pipeline_stage_page_v2" && c.args._query === "rogério",
      ),
    ).toBe(true);
  });
});

describe("pílula Kanban de /leads (o mesmo quadro, sem o topo novo)", () => {
  it("sem busca controlada e sem resumo: o campo e o 'VGV no funil' seguem no quadro", async () => {
    montar(<KanbanBoard />);
    expect(screen.getByRole("textbox", { name: "Buscar leads no funil" })).toBeTruthy();
    expect(await screen.findByText("VGV no funil: R$ 13,9 mi")).toBeTruthy();
    expect(screen.queryByTestId("kanban-resumo")).toBeNull();
    expect(document.getElementById("kanban-instructions")!.className).toContain("sr-only");
  });
});

describe("/pipeline?tab=fechamento — Reta final", () => {
  it("um cartão principal: N dias para fechar o mês, o anel dos fortes e alta · média · baixa", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0, 0));
    renderPipeline({ tab: "fechamento" });
    const cartao = await screen.findByRole("region", { name: "Reta final — placar do fechamento" });
    expect(within(cartao).getByRole("heading", { name: "Reta final" })).toBeTruthy();
    expect(within(cartao).getByText("19 dias para fechar o mês")).toBeTruthy();
    expect(
      within(cartao).getByRole("img", { name: "6 de 54 leads em negociação com sinal forte" }),
    ).toBeTruthy();
    const niveis = within(cartao).getByRole("group", { name: "Resumo dos sinais de fechamento" });
    expect(niveis.textContent).toContain("alta · sinal forte");
    expect(niveis.textContent).toContain("média · sinal moderado");
    expect(niveis.textContent).toContain("baixa · sinal inicial");
    expect(within(cartao).getByText("1 pasta com documento pendente entre os fortes")).toBeTruthy();
    // Nenhum título extra dentro da aba (o antigo "Reta final do mês"/"Modo
    // Fechamento") e nenhuma busca na linha das abas.
    expect(screen.queryByText("Reta final do mês")).toBeNull();
    expect(screen.queryByText("Modo Fechamento")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Buscar leads no funil" })).toBeNull();
  });

  it("cada linha: nome (abre o dossiê), etapa, índice e uma linha de fatores; taxa na dica", async () => {
    renderPipeline({ tab: "fechamento" });
    const lista = await screen.findByRole("list", {
      name: "Leads ordenados por sinal de fechamento",
    });
    const linhas = within(lista).getAllByRole("listitem");
    expect(linhas).toHaveLength(3);

    const marcio = linhas[0];
    expect(within(marcio).getByRole("link", { name: "Márcio Teixeira" }).getAttribute("href")).toBe(
      "/leads/00000000-0000-4000-8000-000000000001",
    );
    expect(within(marcio).getByText("Análise de crédito")).toBeTruthy();
    expect(
      within(marcio).getByRole("img", { name: /Índice de sinal de fechamento 73/ }),
    ).toBeTruthy();
    expect(within(marcio).getByText("Calibrado").getAttribute("title")).toBe(
      "Taxa histórica observada da etapa: 58,1% (86 vendas aprovadas em 148 entradas; horizonte de 90 dias).",
    );
    expect(
      within(marcio).getByText(/Em análise de crédito · Temperatura quente · Vibra/),
    ).toBeTruthy();
    // A frase da taxa saiu da linha.
    expect(within(marcio).queryByText(/Taxa histórica observada/)).toBeNull();
    // Selo de documento no tom de intenção (INTENT_BADGE), não cor crua.
    const doc = within(marcio).getByText(/2 doc/);
    for (const cls of INTENT_BADGE.warning.split(" ")) expect(doc.className).toContain(cls);

    expect(within(linhas[1]).getByText("Heurístico").getAttribute("title")).toBe(
      "Amostra histórica: 24 de 30 entradas maduras; o índice ainda é heurístico e nenhuma taxa é exibida.",
    );
    // Sem a pílula do nível e sem o botão "Abrir": o nome é o clique.
    expect(within(marcio).queryByText("Sinal forte")).toBeNull();
    expect(within(marcio).queryByRole("link", { name: /Abrir/ })).toBeNull();
    const dossies = within(lista)
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.startsWith("/leads/"));
    expect(dossies).toHaveLength(3);
  });

  it("WhatsApp e Ligar em ícone por linha; Ligar continua sendo o tel: do aparelho", async () => {
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    renderPipeline({ tab: "fechamento" });
    const lista = await screen.findByRole("list", {
      name: "Leads ordenados por sinal de fechamento",
    });
    const marcio = within(lista).getAllByRole("listitem")[0];
    const ligar = within(marcio).getByRole("link", { name: "Ligar para Márcio Teixeira" });
    expect(ligar.getAttribute("href")).toBe("tel:11998761022");
    const wa = within(marcio).getByRole("button", { name: "Abrir WhatsApp de Márcio Teixeira" });
    expect(wa.className).not.toContain("text-success");
    fireEvent.click(wa);
    expect(abrir).toHaveBeenCalledWith(
      expect.stringContaining("wa.me"),
      "_blank",
      "noopener,noreferrer",
    );
    abrir.mockRestore();
  });

  it("'Trabalhar os fortes' desce até a lista e leva o foco", async () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    renderPipeline({ tab: "fechamento" });
    fireEvent.click(await screen.findByRole("button", { name: "Trabalhar os fortes" }));
    const secao = document.getElementById("fechamento-lista")!;
    expect(rolar).toHaveBeenCalledTimes(1);
    expect(rolar.mock.contexts[0]).toBe(secao);
    expect(document.activeElement).toBe(secao);
    expect(within(secao).getByText("3 de 54")).toBeTruthy();
  });

  it("a explicação do índice fica atrás de 'Ver como o índice é calculado'", async () => {
    renderPipeline({ tab: "fechamento" });
    const ver = await screen.findByRole("button", { name: /Ver como o índice é calculado/ });
    expect(screen.queryByText(/não é uma probabilidade individual/)).toBeNull();
    fireEvent.click(ver);
    expect(screen.getByText(/não é uma probabilidade individual/)).toBeTruthy();
  });

  it("sem lead em negociação: o vazio padrão e nenhuma ação no cartão", async () => {
    banco.fechamento = fechamento([], { alta: 0, media: 0, baixa: 0 });
    renderPipeline({ tab: "fechamento" });
    expect(await screen.findByText("Nenhum lead em negociação no momento.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Trabalhar os fortes" })).toBeNull();
  });
});
