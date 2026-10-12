// Tarefas no padrão Lançamento (Fase 2 do plano das demais páginas): o topo
// vira três números com dono (Vencidas · Para hoje · Esta semana, vermelho só
// acima de zero); a ação principal é a linha navy de criar — que continua
// gravando SEM data de vencimento — com "+ detalhes" abrindo o diálogo
// completo; a lista é agrupada como a Fila Única (Vencidas → Hoje → Depois →
// Sem data) com uma linha de meta; Adiar e Editar moram no "…"; as concluídas
// ficam atrás de "Ver concluídas (N)"; busca à vista e o resto em "Filtros".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const papel = vi.hoisted(() => ({ gestao: false }));
const db = vi.hoisted(() => ({
  tarefas: [] as unknown[],
  inserts: [] as { tabela: string; payload: Record<string, unknown> }[],
  updates: [] as { tabela: string; patch: Record<string, unknown> }[],
}));
const concluir = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => {
  // Builder encadeável do PostgREST: qualquer método devolve o próprio
  // builder e o `await` entrega o resultado.
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
    if (tabela === "tarefas") return db.tarefas;
    if (tabela === "profiles") {
      return [
        { id: "u1", nome: "Marina Costa" },
        { id: "u2", nome: "Renata Vieira" },
      ];
    }
    return [];
  };
  return {
    supabase: {
      from: (tabela: string) => ({
        select: () => encadeavel(() => ({ data: dados(tabela), error: null })),
        insert: (payload: Record<string, unknown>) => {
          db.inserts.push({ tabela, payload });
          return encadeavel(() => ({ data: null, error: null }));
        },
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
vi.mock("@/hooks/use-realtime-invalidate", () => ({ useRealtimeInvalidate: () => {} }));
vi.mock("@/hooks/use-undoable-mutation", () => ({
  useUndoableMutation: () => ({ mutate: concluir }),
}));
vi.mock("@/features/agenda/use-agenda-do-dia", () => ({ useRelogio: () => new Date() }));
vi.mock("@/features/fila-unica/fila-lateral", () => ({
  AgendaDeHoje: () => <section aria-label="Agenda de hoje">Agenda de hoje</section>,
}));

import { TarefasPage } from "@/features/agenda/tarefas-page";
import {
  agruparTarefas,
  metaDaTarefa,
  numerosDasTarefas,
  type TarefaBase,
} from "@/features/agenda/tarefas-derive";

// Segunda-feira, 12 de outubro de 2026, 10h (fuso local do teste).
const AGORA = new Date(2026, 9, 12, 10, 0, 0, 0);
const local = (dia: number, hora: number, minuto = 0) =>
  new Date(2026, 9, dia, hora, minuto, 0, 0).toISOString();

function tarefa(over: Record<string, unknown>) {
  return {
    id: "t",
    titulo: "Tarefa",
    descricao: null,
    tipo: "follow_up",
    status: "pendente",
    prioridade: "media",
    data_vencimento: null,
    data_conclusao: null,
    lead_id: null,
    corretor_id: "u1",
    leads: null,
    profiles: { id: "u1", nome: "Marina Costa" },
    ...over,
  };
}

const lead = (nome: string) => ({ id: `l-${nome}`, nome });

function fixture() {
  return [
    tarefa({
      id: "v1",
      titulo: "Enviar simulação MCMV atualizada",
      tipo: "whatsapp",
      prioridade: "urgente",
      data_vencimento: local(9, 18),
      leads: lead("Rogério Silva"),
    }),
    tarefa({
      id: "v2",
      titulo: "Cobrar holerite e extrato do FGTS",
      tipo: "documentacao",
      prioridade: "alta",
      data_vencimento: local(11, 17),
      leads: lead("Rosana Batista"),
    }),
    tarefa({
      id: "h1",
      titulo: "Confirmar a visita de amanhã",
      tipo: "whatsapp",
      prioridade: "alta",
      data_vencimento: local(12, 12),
      leads: lead("Sueli Ramos"),
    }),
    tarefa({
      id: "h2",
      titulo: "Conferir a pasta da Caixa",
      tipo: "documentacao",
      data_vencimento: local(12, 16),
    }),
    tarefa({
      id: "d1",
      titulo: "Preparar a reunião de proposta",
      tipo: "outro",
      data_vencimento: local(13, 16),
    }),
    tarefa({
      id: "d2",
      titulo: "Revisar a pasta antes de enviar à Caixa",
      tipo: "documentacao",
      data_vencimento: local(20, 9),
    }),
    tarefa({
      id: "s1",
      titulo: "Pedir indicação depois da visita",
      leads: lead("Lilia Santos"),
    }),
    tarefa({
      id: "c1",
      titulo: "Mandar o book da Longitude",
      status: "concluida",
      data_vencimento: local(12, 8),
      data_conclusao: local(12, 9),
    }),
    tarefa({ id: "c2", titulo: "Tarefa cancelada", status: "cancelada" }),
  ];
}

function renderPagina() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TarefasPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  papel.gestao = false;
  db.tarefas = fixture();
  db.inserts = [];
  db.updates = [];
  concluir.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("tarefas-derive (regras puras)", () => {
  const lista = fixture() as unknown as (TarefaBase & { tipo: string })[];

  it("agrupa as abertas em Vencidas → Hoje → Depois → Sem data e separa as encerradas", () => {
    const { grupos, encerradas } = agruparTarefas(lista, AGORA);
    expect(grupos.vencidas.map((t) => t.id)).toEqual(["v1", "v2"]);
    expect(grupos.hoje.map((t) => t.id)).toEqual(["h1", "h2"]);
    expect(grupos.depois.map((t) => t.id)).toEqual(["d1", "d2"]);
    expect(grupos.sem_data.map((t) => t.id)).toEqual(["s1"]);
    expect(encerradas.map((t) => t.id).sort()).toEqual(["c1", "c2"]);
  });

  it("uma tarefa de hoje cujo horário passou já é Vencida (a mesma conta de isAtrasada)", () => {
    const { grupos } = agruparTarefas(lista, new Date(2026, 9, 12, 13, 0));
    expect(grupos.vencidas.map((t) => t.id)).toEqual(["v1", "v2", "h1"]);
    expect(grupos.hoje.map((t) => t.id)).toEqual(["h2"]);
  });

  it("Esta semana conta as de hoje e as que vencem até domingo", () => {
    const n = numerosDasTarefas(agruparTarefas(lista, AGORA).grupos, AGORA);
    expect(n).toMatchObject({ vencidas: 2, paraHoje: 2, estaSemana: 3 });
    expect(n.hintVencidas).toBe("a mais antiga venceu sexta");
    expect(n.hintHoje).toBe("a próxima às 12:00");
    expect(n.hintSemana).toBe("contando as 2 de hoje · até dom., 18/10");
  });

  it("a linha de meta é uma só: prazo · lead · corretor · tipo", () => {
    const [v1] = lista;
    expect(metaDaTarefa(v1, { lead: "Rogério Silva", agora: AGORA })).toBe(
      "venceu sex, 09/10 · 18:00 · Rogério Silva · WhatsApp",
    );
    const s1 = lista.find((t) => t.id === "s1")!;
    expect(metaDaTarefa(s1, { lead: "Lilia Santos", corretor: "Marina Costa", agora: AGORA })).toBe(
      "sem prazo · Lilia Santos · Marina Costa · Follow-up",
    );
    const h1 = lista.find((t) => t.id === "h1")!;
    expect(metaDaTarefa(h1, { agora: AGORA })).toBe("hoje · 12:00 · WhatsApp");
  });
});

describe("Tarefas no padrão Lançamento", () => {
  it("o topo são três números com dono; Vencidas só fica vermelho acima de zero", async () => {
    renderPagina();
    const topo = await screen.findByRole("region", { name: "Como estão as tarefas" });
    await waitFor(() =>
      expect(within(topo).getByTestId("tarefas-vencidas")).toHaveTextContent("2"),
    );
    expect(within(topo).getByText("Vencidas")).toBeTruthy();
    expect(within(topo).getByText("Para hoje")).toBeTruthy();
    expect(within(topo).getByText("Esta semana")).toBeTruthy();
    expect(within(topo).getByTestId("tarefas-vencidas").className).toContain("text-destructive");
    expect(within(topo).getByTestId("tarefas-hoje")).toHaveTextContent("2");
    expect(within(topo).getByTestId("tarefas-semana")).toHaveTextContent("3");
    // Os números antigos (vaidade) saíram.
    expect(screen.queryByText("Em andamento")).toBeNull();
    expect(screen.queryByText("Concluídas hoje")).toBeNull();
    cleanup();

    db.tarefas = fixture().filter((t) => t.id.startsWith("h"));
    renderPagina();
    const zerado = await screen.findByTestId("tarefas-vencidas");
    await waitFor(() => expect(screen.getByTestId("tarefas-hoje")).toHaveTextContent("2"));
    expect(zerado).toHaveTextContent("0");
    expect(zerado.className).not.toContain("text-destructive");
  });

  it("a lista vem agrupada como a Fila: Vencidas → Hoje → Depois → Sem data, uma linha de meta", async () => {
    renderPagina();
    const vencidas = await screen.findByTestId("tarefas-grupo-vencidas");
    const hoje = screen.getByTestId("tarefas-grupo-hoje");
    const depois = screen.getByTestId("tarefas-grupo-depois");
    const semData = screen.getByTestId("tarefas-grupo-sem_data");
    const segue = (a: Element, b: Element) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(segue(vencidas, hoje) && segue(hoje, depois) && segue(depois, semData)).toBe(true);

    expect(within(vencidas).getByRole("heading")).toHaveTextContent("Vencidas· 2");
    expect(within(semData).getByText("Pedir indicação depois da visita")).toBeTruthy();
    const linha = within(vencidas).getAllByTestId("tarefa-linha")[0];
    expect(linha).toHaveTextContent("venceu sex, 09/10 · 18:00 · Rogério Silva · WhatsApp");
    // Status implícito pelo grupo; prioridade é o ponto, não um selo.
    expect(within(linha).queryByText("Pendente")).toBeNull();
    expect(within(linha).queryByText("Atrasada")).toBeNull();
    expect(within(linha).getByText("Prioridade urgente:")).toBeTruthy();
  });

  it("a linha rápida grava SEM data de vencimento; '+ detalhes' abre o diálogo com o título", async () => {
    renderPagina();
    await screen.findByTestId("tarefas-grupo-vencidas");
    const campo = screen.getByLabelText("Título da nova tarefa");
    fireEvent.change(campo, { target: { value: "Ligar para o Paulo" } });
    fireEvent.submit(campo.closest("form")!);
    await waitFor(() => expect(db.inserts).toHaveLength(1));
    expect(db.inserts[0].payload).toEqual({
      titulo: "Ligar para o Paulo",
      tipo: "follow_up",
      status: "pendente",
      prioridade: "media",
      criado_por: "u1",
    });
    expect("data_vencimento" in db.inserts[0].payload).toBe(false);

    // Não existe mais o "Nova tarefa" no cabeçalho: o diálogo é o "+ detalhes".
    expect(screen.queryByRole("button", { name: /Nova tarefa/ })).toBeNull();
    fireEvent.change(campo, { target: { value: "Mandar a planta" } });
    fireEvent.click(screen.getByRole("button", { name: "+ detalhes" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Nova tarefa")).toBeTruthy();
    expect(within(dialogo).getByLabelText("Título")).toHaveValue("Mandar a planta");
  });

  it("Adiar e Editar moram no '…' da linha; concluir é o círculo", async () => {
    renderPagina();
    await screen.findByTestId("tarefas-grupo-vencidas");
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Adiar" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Concluir: Enviar simulação MCMV atualizada" }),
    );
    expect(concluir).toHaveBeenCalledWith({ id: "v1" });

    const mais = screen.getByRole("button", {
      name: "Mais ações · Enviar simulação MCMV atualizada",
    });
    fireEvent.pointerDown(mais, { button: 0, pointerType: "mouse" });
    const menu = await screen.findByRole("menu");
    for (const r of ["Adiar 1 hora", "Adiar 1 dia", "Adiar 1 semana", "Editar"]) {
      expect(within(menu).getByRole("menuitem", { name: r })).toBeTruthy();
    }
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Adiar 1 dia" }));
    await waitFor(() => expect(db.updates).toHaveLength(1));
    expect(db.updates[0].patch).toEqual({
      data_vencimento: new Date(AGORA.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });
  });

  it("as concluídas ficam atrás de 'Ver concluídas (N)'", async () => {
    renderPagina();
    await screen.findByTestId("tarefas-grupo-vencidas");
    expect(screen.queryByText("Mandar o book da Longitude")).toBeNull();
    const ver = screen.getByRole("button", { name: /Ver concluídas \(2\)/ });
    expect(ver).toHaveTextContent("1 hoje");
    fireEvent.click(ver);
    expect(await screen.findByText("Mandar o book da Longitude")).toBeTruthy();
    expect(screen.getByText("Tarefa cancelada")).toBeTruthy();
  });

  it("busca à vista; status e tipo atrás de 'Filtros' (corretor só para a gestão)", async () => {
    renderPagina();
    await screen.findByTestId("tarefas-grupo-vencidas");
    expect(screen.getByRole("searchbox", { name: "Buscar tarefa ou lead" })).toBeTruthy();
    expect(screen.getByText("abertas · todos os tipos")).toBeTruthy();
    expect(screen.queryByLabelText("Status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    expect(await screen.findByLabelText("Status")).toBeTruthy();
    expect(screen.getByLabelText("Tipo")).toBeTruthy();
    expect(screen.queryByLabelText("Corretor")).toBeNull();

    // A busca também acha pelo nome do lead.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "rosana" } });
    await waitFor(() => expect(screen.getAllByTestId("tarefa-linha")).toHaveLength(1));
    expect(screen.getByText("Cobrar holerite e extrato do FGTS")).toBeTruthy();
  });

  it("a gestão filtra por corretor e vê o corretor na linha de meta", async () => {
    papel.gestao = true;
    db.tarefas = [
      tarefa({ id: "a", titulo: "Da Marina", data_vencimento: local(13, 9) }),
      tarefa({
        id: "b",
        titulo: "Da Renata",
        data_vencimento: local(13, 10),
        corretor_id: "u2",
        profiles: { id: "u2", nome: "Renata Vieira" },
      }),
    ];
    renderPagina();
    await screen.findByText("Da Renata");
    expect(screen.getByText("abertas · todos os tipos · todos os corretores")).toBeTruthy();
    expect(screen.getAllByTestId("tarefa-linha")[1]).toHaveTextContent("Renata Vieira");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    expect(await screen.findByLabelText("Corretor")).toBeTruthy();
  });

  it("a lateral do desktop é a Agenda de hoje", async () => {
    renderPagina();
    expect(await screen.findByRole("region", { name: "Agenda de hoje" })).toBeTruthy();
  });
});
