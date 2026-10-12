// A Agenda no padrão Lançamento (Fase 2 do plano das demais páginas): o topo
// é o cartão "Hoje" — cada compromisso com o estado (confirmada / sem
// confirmação / validar) e UMA ação visível (validar, confirmar, ligar ou
// remarcar), com as mesmas escritas do hub /inicio; "Ligar" passa pelo
// useLigarLead (3C Plus com recuo para o tel:, decisão do dono de 12/10);
// "Modo Visita" é link do cartão; a linha do mês leva Calendário/Lista e os
// filtros atrás de "Filtros"; a lateral tem "A validar" e "Amanhã"; o celular
// abre na lista começando hoje; remover pede confirmação num AlertDialog.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const papel = vi.hoisted(() => ({ gestao: false }));
const tela = vi.hoisted(() => ({ celular: false }));
const ligar = vi.hoisted(() => vi.fn());
const escritas = vi.hoisted(() => ({
  confirmar: vi.fn(),
  validar: vi.fn(),
  remarcar: vi.fn(),
  criar: vi.fn(),
}));
const db = vi.hoisted(() => ({
  agendamentos: [] as unknown[],
  updates: [] as { tabela: string; patch: Record<string, unknown> }[],
}));
const dia = vi.hoisted(() => ({ itens: [] as unknown[], agora: new Date() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/integrations/supabase/client", () => {
  function encadeavel(resultado: () => unknown) {
    const builder: object = new Proxy(
      {},
      {
        get(_alvo, chave) {
          if (chave === "then") {
            const p = Promise.resolve(resultado());
            return p.then.bind(p);
          }
          return () => builder;
        },
      },
    );
    return builder;
  }
  const dados = (tabela: string) => {
    if (tabela === "agendamentos") return db.agendamentos;
    if (tabela === "profiles") return [{ id: "u1", nome: "Marina Costa", email: "m@x" }];
    if (tabela === "leads") {
      return [
        { id: "l-carlos", nome: "Carlos Mendes", telefone: "11999990000", corretor_id: "u1" },
      ];
    }
    return [];
  };
  return {
    supabase: {
      from: (tabela: string) => ({
        select: () => encadeavel(() => ({ data: dados(tabela), error: null })),
        update: (patch: Record<string, unknown>) => {
          db.updates.push({ tabela, patch });
          return encadeavel(() => ({ data: null, error: null }));
        },
      }),
    },
  };
});
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
  useUserRoles: () => ({
    isAdmin: papel.gestao,
    isGestor: false,
    isSuperintendente: false,
    loading: false,
  }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => tela.celular }));
vi.mock("@/hooks/use-ligar-lead", () => ({ useLigarLead: () => ({ ligar, discando: false }) }));
vi.mock("@/hooks/use-realtime-invalidate", () => ({ useRealtimeInvalidate: () => {} }));
vi.mock("@/lib/google-calendar.functions", () => ({
  syncAgendamentoGoogle: () => Promise.resolve({ synced: true }),
}));
vi.mock("@/features/agenda/use-agenda-do-dia", async () => {
  const { classificarAgenda } = await import("@/features/agenda/agenda-do-dia");
  const mut = (fn: () => void) => ({ mutate: fn, isPending: false, variables: undefined });
  return {
    useAgendaDoDia: () => ({
      query: { isLoading: false, isError: false, error: null, refetch: vi.fn() },
      agora: dia.agora,
      classificada: classificarAgenda(dia.itens as never[], dia.agora),
      escopo: { tipo: papel.gestao ? "operacao" : "minha", ids: null },
      nomes: new Map([["u1", "Marina Costa"]]),
      escopoPronto: true,
      escopoErro: null,
      refetchEscopo: vi.fn(),
    }),
    useAcoesAgenda: () => ({
      confirmar: mut(escritas.confirmar),
      validar: mut(escritas.validar),
      remarcar: mut(escritas.remarcar),
    }),
    useCriarAgendamento: () => mut(escritas.criar),
    invalidarAgendaDoDia: vi.fn(),
  };
});

import { AgendaPage } from "@/features/agenda/agenda-page";
import {
  acaoPrincipal,
  estadoDoCompromisso,
  nomeCurto,
  passouHa,
  pontoDoCompromisso,
  recortarPorCorretor,
  classificarAgenda,
  type ItemAgendaDia,
} from "@/features/agenda/agenda-do-dia";

// Segunda-feira, 12 de outubro de 2026, 10h (fuso local do teste).
const AGORA = new Date(2026, 9, 12, 10, 0, 0, 0);
const em = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m, 0, 0).toISOString();

function item(over: Partial<ItemAgendaDia> & { id: string; inicio: string; fim?: string }) {
  const { inicio, fim, ...resto } = over;
  return {
    lead_id: `l-${over.id}`,
    corretor_id: "u1",
    tipo: "visita",
    status: "agendado",
    titulo: "Visita",
    descricao: null,
    local: null,
    data_inicio: inicio,
    data_fim: fim ?? new Date(Date.parse(inicio) + 30 * 60_000).toISOString(),
    lembrete_minutos: 30,
    lead: { id: `l-${over.id}`, nome: "Cliente", telefone: "11988887777", projeto_nome: null },
    ...resto,
  } as ItemAgendaDia;
}

const lead = (id: string, nome: string, projeto: string | null = null) => ({
  id: `l-${id}`,
  nome,
  telefone: "11988887777",
  projeto_nome: projeto,
});

function fixtureDia() {
  return [
    item({
      id: "carlos",
      inicio: em(12, 9),
      fim: em(12, 9, 30),
      lead: lead("carlos", "Carlos Mendes", "Conx Vila Prudente"),
    }),
    item({
      id: "lilia",
      status: "confirmado",
      inicio: em(12, 11, 30),
      local: "Estande da Barra Funda",
      lead: lead("lilia", "Lilia Santos", "Vibra Barra Funda"),
    }),
    item({ id: "ana", inicio: em(12, 15), lead: lead("ana", "Ana Beatriz Rocha") }),
    item({
      id: "rogerio",
      tipo: "ligacao",
      titulo: "Retorno da simulação MCMV",
      inicio: em(12, 17, 30),
      lead: lead("rogerio", "Rogério Silva"),
    }),
    item({ id: "fernanda", inicio: em(9, 16), lead: lead("fernanda", "Fernanda Oliveira") }),
    item({ id: "sueli", inicio: em(13, 10), lead: lead("sueli", "Sueli Ramos") }),
  ];
}

function agendamento(over: Record<string, unknown>) {
  return {
    lead_id: null,
    corretor_id: "u1",
    criado_por_id: "u1",
    tipo: "visita",
    status: "agendado",
    titulo: "Compromisso",
    descricao: null,
    local: null,
    timezone: "America/Sao_Paulo",
    lembrete_minutos: 30,
    motivo_cancelamento: null,
    realizado_em: null,
    ...over,
  };
}

function renderAgenda() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onNovo = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <AgendaPage onNovo={onNovo} />
    </QueryClientProvider>,
  );
  return { onNovo };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  papel.gestao = false;
  tela.celular = false;
  dia.agora = AGORA;
  dia.itens = fixtureDia();
  db.agendamentos = [
    agendamento({
      id: "a-passado",
      titulo: "Plantão Lapa",
      tipo: "outro",
      status: "realizado",
      data_inicio: em(5, 14),
      data_fim: em(5, 15),
    }),
    agendamento({
      id: "a-hoje",
      titulo: "Visita · Carlos Mendes",
      lead_id: "l-carlos",
      data_inicio: em(12, 9),
      data_fim: em(12, 9, 30),
    }),
    agendamento({
      id: "a-depois",
      titulo: "Reunião de proposta",
      tipo: "reuniao",
      data_inicio: em(14, 16),
      data_fim: em(14, 17),
    }),
  ];
  db.updates = [];
  ligar.mockClear();
  for (const f of Object.values(escritas)) f.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("agenda-do-dia: estado e ação principal (regras puras)", () => {
  const cls = () => classificarAgenda(fixtureDia(), AGORA);
  const doDia = (id: string) => cls().hoje.find((i) => i.id === id)!;

  it("estado: validar · confirmada · sem confirmação; encerrado em cinza", () => {
    expect(estadoDoCompromisso(doDia("carlos"), AGORA)).toEqual({
      rotulo: "validar",
      intent: "warning",
    });
    expect(estadoDoCompromisso(doDia("lilia"), AGORA)).toEqual({
      rotulo: "confirmada",
      intent: "success",
    });
    expect(estadoDoCompromisso(doDia("ana"), AGORA)).toEqual({
      rotulo: "sem confirmação",
      intent: "warning",
    });
    expect(estadoDoCompromisso(doDia("rogerio"), AGORA)).toBeNull();
    expect(estadoDoCompromisso({ ...doDia("ana"), status: "realizado" }, AGORA)).toEqual({
      rotulo: "realizado",
      intent: "neutral",
    });
  });

  it("uma ação por linha: validar > confirmar > ligar (se é ligação) > remarcar", () => {
    expect(acaoPrincipal(doDia("carlos"), AGORA)).toBe("validar");
    expect(acaoPrincipal(doDia("lilia"), AGORA)).toBe("remarcar");
    expect(acaoPrincipal(doDia("ana"), AGORA)).toBe("confirmar");
    expect(acaoPrincipal(doDia("rogerio"), AGORA)).toBe("ligar");
    expect(acaoPrincipal({ ...doDia("ana"), status: "realizado" }, AGORA)).toBeNull();
  });

  it("ponto na grade: a validar acende, visita em navy, encerrado em cinza", () => {
    expect(pontoDoCompromisso(doDia("carlos"), AGORA)).toBe("validar");
    expect(pontoDoCompromisso(doDia("ana"), AGORA)).toBe("visita");
    expect(pontoDoCompromisso(doDia("rogerio"), AGORA)).toBe("outro");
    expect(pontoDoCompromisso({ ...doDia("ana"), status: "cancelado" }, AGORA)).toBe("encerrado");
  });

  it("o filtro de corretor da gestão recorta o dia; nomes e tempos curtos", () => {
    const outro = { ...doDia("ana"), id: "x", corretor_id: "u2" };
    const c = { ...cls(), hoje: [...cls().hoje, outro] };
    expect(recortarPorCorretor(c, "u2").hoje.map((i) => i.id)).toEqual(["x"]);
    expect(recortarPorCorretor(c, null)).toBe(c);
    expect(nomeCurto("Carlos Mendes da Silva")).toBe("Carlos S.");
    expect(passouHa(em(12, 8, 20), AGORA)).toBe("há 1 h 40");
    expect(passouHa(em(12, 9, 30), AGORA)).toBe("há 30 min");
  });
});

describe("Agenda no padrão Lançamento", () => {
  it("o cartão Hoje mostra o estado e UMA ação visível por compromisso", async () => {
    renderAgenda();
    const hoje = screen.getByRole("region", { name: "Hoje" });
    expect(within(hoje).getByRole("heading")).toHaveTextContent(
      "4 compromissos hoje · 1 sem confirmação · 2 visitas para validar.",
    );
    const linhas = within(hoje).getAllByTestId("agenda-hoje-linha");
    expect(linhas).toHaveLength(4);
    const acoes = ["Validar", "Confirmar", "Remarcar", "Ligar"];
    const visiveis = linhas.map((l) =>
      acoes.filter((a) => within(l).queryByRole("button", { name: new RegExp(`^${a}$`) })),
    );
    expect(visiveis).toEqual([["Validar"], ["Remarcar"], ["Confirmar"], ["Ligar"]]);
    expect(linhas[0]).toHaveTextContent("validar");
    expect(linhas[0]).toHaveTextContent("passou há 30 min sem desfecho");
    expect(linhas[1]).toHaveTextContent("confirmada");
    expect(linhas[2]).toHaveTextContent("sem confirmação");
    // Modo Visita virou link do cartão do dia.
    expect(within(hoje).getByRole("link", { name: /Abrir no Modo Visita/ })).toHaveAttribute(
      "href",
      "/modo-visita",
    );
  });

  it("Ligar passa pelo useLigarLead (3C Plus com recuo para o tel:), sem link tel:", async () => {
    renderAgenda();
    const hoje = screen.getByRole("region", { name: "Hoje" });
    const linhas = within(hoje).getAllByTestId("agenda-hoje-linha");
    fireEvent.click(within(linhas[3]).getByRole("button", { name: /^Ligar$/ }));
    expect(ligar).toHaveBeenCalledWith({
      id: "l-rogerio",
      nome: "Rogério Silva",
      telefone: "11988887777",
    });
    fireEvent.click(within(linhas[0]).getByRole("button", { name: "Ligar para Carlos Mendes" }));
    expect(ligar).toHaveBeenLastCalledWith(expect.objectContaining({ id: "l-carlos" }));
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
  });

  it("Confirmar e Validar usam as mesmas escritas do hub /inicio", async () => {
    renderAgenda();
    const linhas = screen.getAllByTestId("agenda-hoje-linha");
    fireEvent.click(within(linhas[2]).getByRole("button", { name: /^Confirmar$/ }));
    expect(escritas.confirmar).toHaveBeenCalledWith(expect.objectContaining({ id: "ana" }));
    fireEvent.click(within(linhas[0]).getByRole("button", { name: /^Validar$/ }));
    const folha = await screen.findByRole("dialog");
    expect(within(folha).getByText("Visita · Carlos Mendes")).toBeTruthy();
  });

  it("a lateral traz 'A validar' (dias anteriores) e 'Amanhã' com o estado", async () => {
    renderAgenda();
    const amanha = screen.getByRole("region", { name: "Amanhã" });
    expect(within(amanha).getByTestId("amanha-item")).toHaveTextContent("Sueli Ramos");
    expect(within(amanha).getByTestId("amanha-item")).toHaveTextContent("sem confirmação");

    const aValidar = screen.getByRole("region", { name: "A validar" });
    expect(within(aValidar).getByText("1 de dias anteriores")).toBeTruthy();
    expect(within(aValidar).getByText("Fernanda Oliveira")).toBeTruthy();
    fireEvent.click(
      within(aValidar).getByRole("button", { name: "Validar a visita de Fernanda Oliveira" }),
    );
    expect(await screen.findByText("Visita · Fernanda Oliveira")).toBeTruthy();
  });

  it("desktop abre na grade; os filtros moram atrás de 'Filtros', com o estado em texto", async () => {
    renderAgenda();
    expect(await screen.findByRole("button", { name: /Plantão Lapa/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Calendário" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("todos os status")).toBeTruthy();
    expect(screen.queryByLabelText("Status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    expect(await screen.findByLabelText("Status")).toBeTruthy();
    expect(screen.queryByLabelText("Corretor")).toBeNull();
  });

  it("a gestão vê o corretor no resumo dos filtros", async () => {
    papel.gestao = true;
    renderAgenda();
    expect(await screen.findByText("todos os status · todos os corretores")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    expect(await screen.findByLabelText("Corretor")).toBeTruthy();
  });

  it("no celular a agenda abre na lista começando hoje; o mês anterior fica a um toque", async () => {
    tela.celular = true;
    renderAgenda();
    const itens = await screen.findAllByTestId("agenda-lista-item");
    expect(itens).toHaveLength(2);
    expect(itens[0]).toHaveTextContent("Carlos Mendes");
    expect(screen.queryByText(/Plantão Lapa/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver o compromisso anterior deste mês" }));
    expect(await screen.findByText(/Plantão Lapa/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
  });

  it("remover pede confirmação num AlertDialog, nunca o confirm() do navegador", async () => {
    const confirmar = vi.spyOn(window, "confirm");
    renderAgenda();
    fireEvent.click(await screen.findByRole("button", { name: /Reunião de proposta/ }));
    const edicao = await screen.findByRole("dialog");
    fireEvent.click(within(edicao).getByRole("button", { name: "Remover" }));
    const alerta = await screen.findByRole("alertdialog");
    expect(within(alerta).getByText("Remover este agendamento?")).toBeTruthy();
    expect(db.updates).toHaveLength(0);
    fireEvent.click(within(alerta).getByRole("button", { name: "Remover" }));
    await waitFor(() => expect(db.updates).toHaveLength(1));
    expect(db.updates[0].patch).toHaveProperty("deleted_at");
    expect(confirmar).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });
});
