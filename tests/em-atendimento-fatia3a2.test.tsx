// Regra dos 65, Fatia 3a.2 — "Em atendimento por consequência". A regra mora
// no banco (tests/db/em-atendimento-fatia3a2.test.ts: registrar_contato_lead e
// a matriz que recusa o corretor); aqui se trava o espelho do front: nenhuma
// tela deixa o corretor ESCOLHER Em atendimento, a ação oferecida é o contato,
// e o diálogo manda para a RPC o que ela precisa (resultado + passo com data).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  FUNNEL_STAGES,
  MOTIVO_EM_ATENDIMENTO_CONSEQUENCIA,
  PROXIMA_ACAO,
  motivoTransicaoBloqueada,
  transicaoLeadPermitida,
  type LeadStatus,
} from "@/lib/leads";
import {
  ANTES_DE_EM_ATENDIMENTO,
  antesDeEmAtendimento,
  clienteRespondeu,
  parseContatoRegistrado,
} from "@/lib/em-atendimento";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ---------------------------------------------------------------------------
// Parte pura — o espelho da matriz do banco
// ---------------------------------------------------------------------------

describe("Em atendimento não se escolhe (espelho de transicao_lead_permitida)", () => {
  it("o corretor não tem Em atendimento como destino de NENHUM status", () => {
    for (const de of FUNNEL_STAGES) {
      if (de === "em_atendimento") continue; // ficar onde está não é transição.
      expect(transicaoLeadPermitida(de, "em_atendimento", false), de).toBe(false);
    }
    expect(transicaoLeadPermitida("perdido", "em_atendimento", false)).toBe(false);
    expect(transicaoLeadPermitida("aguardando_corretor", "em_atendimento", false)).toBe(false);
  });

  it("a gestão ainda move para Em atendimento à mão (correção de dado) — menos de venda/perdido", () => {
    for (const de of [
      "aguardando_corretor",
      "novo",
      "aguardando_atendimento",
      "aguardando_retorno",
      "qualificacao_corretor",
      "qualificado",
      "agendado",
      "visita_realizada",
      "proposta_enviada",
      "analise_credito",
    ] as LeadStatus[]) {
      expect(transicaoLeadPermitida(de, "em_atendimento", true), de).toBe(true);
    }
    // Venda fechada não volta; perdido/pós-venda voltam só pela gestão (reativação).
    expect(transicaoLeadPermitida("contrato_fechado", "em_atendimento", true)).toBe(false);
    expect(transicaoLeadPermitida("perdido", "em_atendimento", true)).toBe(true);
    expect(transicaoLeadPermitida("perdido", "em_atendimento", false)).toBe(false);
  });

  it("as saídas de Em atendimento continuam as da Fatia 3a (desfechos)", () => {
    const candidatos: LeadStatus[] = [
      "novo",
      "aguardando_corretor",
      "aguardando_atendimento",
      "aguardando_retorno",
      "qualificacao_corretor",
      "qualificado",
      "agendado",
      "visita_realizada",
      "proposta_enviada",
      "analise_credito",
      "contrato_fechado",
      "pos_venda",
      "perdido",
    ];
    const saidas = (gestao: boolean) =>
      candidatos.filter((s) => transicaoLeadPermitida("em_atendimento", s, gestao));
    expect(saidas(false).sort()).toEqual(
      ["aguardando_retorno", "agendado", "analise_credito", "perdido"].sort(),
    );
    expect(saidas(true).sort()).toEqual(
      [
        "aguardando_retorno",
        "agendado",
        "analise_credito",
        "perdido",
        "qualificacao_corretor",
        "qualificado",
        "visita_realizada",
      ].sort(),
    );
  });

  it("o motivo do bloqueio explica a consequência, não um 'não pode'", () => {
    expect(motivoTransicaoBloqueada("novo", "em_atendimento")).toBe(
      MOTIVO_EM_ATENDIMENTO_CONSEQUENCIA,
    );
    expect(MOTIVO_EM_ATENDIMENTO_CONSEQUENCIA).toMatch(/registre o contato/i);
    expect(MOTIVO_EM_ATENDIMENTO_CONSEQUENCIA).toMatch(/entra sozinho/i);
  });

  it("antes de Em atendimento a próxima ação é o contato; depois, a etapa", () => {
    for (const s of ANTES_DE_EM_ATENDIMENTO) {
      const acao = PROXIMA_ACAO[s as LeadStatus];
      if (!acao) continue; // aguardando_corretor/qualificado não têm botão.
      expect(acao, s).toEqual({ label: "Registrar contato", kind: "contato" });
    }
    expect(PROXIMA_ACAO.em_atendimento).toMatchObject({ target: "agendado" });
    // Nenhum botão "inteligente" leva a Em atendimento por si.
    for (const acao of Object.values(PROXIMA_ACAO)) {
      if (acao && "target" in acao) expect(acao.target).not.toBe("em_atendimento");
    }
  });

  it("helpers: o que conta como 'antes' e o que conta como 'o cliente respondeu'", () => {
    expect(antesDeEmAtendimento("novo")).toBe(true);
    expect(antesDeEmAtendimento("aguardando_retorno")).toBe(true);
    expect(antesDeEmAtendimento("em_atendimento")).toBe(false);
    expect(antesDeEmAtendimento("agendado")).toBe(false);
    expect(antesDeEmAtendimento(null)).toBe(false);
    expect(clienteRespondeu("atendeu")).toBe(true);
    expect(clienteRespondeu("interessado")).toBe(true);
    expect(clienteRespondeu("pediu_retorno")).toBe(true);
    expect(clienteRespondeu("nao_atendeu")).toBe(false);
    expect(clienteRespondeu("sem_interesse")).toBe(false);
  });

  it("parseContatoRegistrado é fail-closed: fora do contrato derruba", () => {
    const ok = parseContatoRegistrado({
      ok: true,
      interacao_id: "i",
      tarefa_id: null,
      respondeu: true,
      entrou: false,
      via: null,
      status: "novo",
      lotado: { em_atendimento: 65, teto: 65, lead_id: "x" },
    });
    expect(ok.lotado?.teto).toBe(65);
    expect(() => parseContatoRegistrado({ ok: false })).toThrow();
    expect(() => parseContatoRegistrado(null)).toThrow();
    expect(() =>
      parseContatoRegistrado({ ok: true, interacao_id: "i", entrou: "sim", status: "novo" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Fiação — o que cada tela faz com "Em atendimento"
// ---------------------------------------------------------------------------

describe("fiação: nenhuma tela do corretor escolhe Em atendimento", () => {
  it("o menu de etapas troca 'Em atendimento' por 'Cliente respondeu…' para o corretor", () => {
    const m = read("src/components/lead-stage-menu.tsx");
    expect(m).toContain('s === "em_atendimento" && !gestao');
    expect(m).toContain("Cliente respondeu…");
    expect(m).toContain("onPickContato");
  });

  it("Kanban, peek, foco, volume e ficha abrem Registrar contato no lugar da etapa", () => {
    const kanban = read("src/components/leads-kanban-board.tsx");
    expect(kanban).toContain('target === "em_atendimento" && !gestao');
    expect(kanban).toContain("<RegistrarContatoDialog");
    expect(kanban).toContain("onPickContato={() => setContatoLead(lead)}");
    expect(read("src/features/leads/lead-peek-drawer.tsx")).toContain(
      "onPickContato={() => setContatoOpen(true)}",
    );
    expect(read("src/features/leads/focus-mode.tsx")).toContain(
      "onPickContato={() => setContatoOpen(true)}",
    );
    expect(read("src/features/atendimento/volume-view.tsx")).toContain('"target" in proxima');
    const ficha = read("src/routes/_authenticated/leads.$leadId.tsx");
    expect(ficha).toContain('target === "em_atendimento" && !gestao');
    expect(ficha).toContain("executarAcaoSugerida");
  });

  it("a lista: o split registra o CONTATO (WhatsApp em 1 clique; ligação abre o diálogo)", () => {
    const lista = read("src/routes/_authenticated/leads.index.tsx");
    expect(lista).not.toContain("iniciar_atendimento_lead");
    expect(lista).not.toContain("iniciarAtendimento");
    expect(lista).toContain("contatoWhatsApp.mutate({ lead })");
    expect(lista).toContain("<RegistrarContatoDialog");
    expect(lista).toContain('if (!("target" in acao))');
    const acoes = read("src/features/leads/row-actions.tsx");
    expect(acoes).toContain("Contato por WhatsApp");
    expect(acoes).toContain("Contato por ligação");
    expect(acoes).not.toContain("Iniciar por");
    const m = read("src/features/leads/use-lead-mutations.ts");
    expect(m).toContain('_tipo: "whatsapp"');
    expect(m).toContain('_resultado: "nao_atendeu"');
    expect(m).not.toContain(
      'transicionarLead({\n              id: lead.id,\n              status: "em_atendimento"',
    );
  });

  it("a Fila do Dia manda 'Falei' pela RPC, sem tarefa dupla, e trata `lotado`", () => {
    const d = read("src/features/fila-unica/use-desfecho.ts");
    expect(d).toContain('rpc("registrar_contato_lead", {');
    expect(d).toContain("_criar_tarefa: false");
    expect(d).toContain("registro.lotado = !r.entrou && r.lotado != null;");
    expect(d).toContain("if (r.lotado && janela) {");
    expect(d).toContain("entraPorConsequencia");
    // A opção não carrega mais a etapa: quem decide é o banco.
    const opcoes = read("src/features/fila-unica/desfecho.ts");
    expect(opcoes).not.toContain('{ kind: "direct", status: "em_atendimento" }');
  });

  it("a migration derruba iniciar_atendimento_lead e cria registrar_contato_lead", () => {
    const sql = read("supabase/migrations/20261010120800_em_atendimento_fatia3a2_consequencia.sql");
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.iniciar_atendimento_lead(uuid, text, text, timestamptz)",
    );
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.registrar_contato_lead(");
    expect(sql).toContain("OR (p_gestao AND p_para::text = 'em_atendimento')");
  });
});

// ---------------------------------------------------------------------------
// O diálogo Registrar contato
// ---------------------------------------------------------------------------

const estado = vi.hoisted(() => ({
  rpc: vi.fn(),
  abrir: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: estado.toast }));
vi.mock("@/features/dashboard/queries", () => ({
  rpc: (...args: unknown[]) => estado.rpc(...args),
}));
vi.mock("@/features/em-atendimento/use-em-atendimento", () => ({
  invalidarEmAtendimento: vi.fn(),
}));
vi.mock("@/features/em-atendimento/janela-troca-context", () => ({
  useJanelaTroca: () => ({ abrir: estado.abrir }),
}));

import { RegistrarContatoDialog } from "@/components/registrar-contato-dialog";

function montar(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const retorno = (extra: Record<string, unknown> = {}) => ({
  data: {
    ok: true,
    interacao_id: "int-1",
    tarefa_id: "tar-1",
    respondeu: true,
    entrou: true,
    via: "resposta",
    status: "em_atendimento",
    lotado: null,
    ...extra,
  },
  error: null,
});

afterEach(() => {
  cleanup();
  estado.rpc.mockReset();
  estado.abrir.mockReset();
  estado.toast.success.mockReset();
  estado.toast.error.mockReset();
});

const lead = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Carla Cliente",
  corretor_id: "c1",
};

describe("RegistrarContatoDialog", () => {
  it("antes de Em atendimento explica a consequência e exige passo com data quando o cliente respondeu", () => {
    montar(
      <RegistrarContatoDialog
        open
        onOpenChange={() => {}}
        lead={{ ...lead, status: "novo" }}
        defaultResultado="atendeu"
      />,
    );
    expect(screen.getByTestId("contato-consequencia").textContent).toMatch(/não se escolhe/);
    expect(screen.getByText("Próximo passo com data *")).toBeTruthy();
    // "Sem follow-up" com o cliente respondendo: nada de registrar sem passo.
    fireEvent.click(screen.getByRole("radio", { name: "Sem follow-up" }));
    expect(screen.getByTestId("contato-sem-passo")).toBeTruthy();
    expect((screen.getByText("Registrar") as HTMLButtonElement).disabled).toBe(true);
    // "Não atendeu" não entra: o passo volta a ser opcional.
    fireEvent.click(screen.getByRole("radio", { name: "Não atendeu" }));
    expect(screen.queryByTestId("contato-sem-passo")).toBeNull();
    expect((screen.getByText("Registrar") as HTMLButtonElement).disabled).toBe(false);
  });

  it("já em atendimento não há aviso: é só um contato com follow-up", () => {
    montar(
      <RegistrarContatoDialog
        open
        onOpenChange={() => {}}
        lead={{ ...lead, status: "em_atendimento" }}
      />,
    );
    expect(screen.queryByTestId("contato-consequencia")).toBeNull();
    expect(screen.getByText("Próximo follow-up")).toBeTruthy();
  });

  it("manda resultado + passo para a RPC e avisa que o lead entrou", async () => {
    estado.rpc.mockResolvedValue(retorno());
    const onOpenChange = vi.fn();
    montar(
      <RegistrarContatoDialog
        open
        onOpenChange={onOpenChange}
        lead={{ ...lead, status: "aguardando_atendimento" }}
        defaultResultado="atendeu"
      />,
    );
    fireEvent.click(screen.getByText("Registrar"));
    await waitFor(() => expect(estado.rpc).toHaveBeenCalled());
    const [nome, args] = estado.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(nome).toBe("registrar_contato_lead");
    expect(args).toMatchObject({
      _lead_id: lead.id,
      _tipo: "ligacao",
      _resultado: "atendeu",
      _conteudo: null,
      _proxima_acao: "Follow-up com Carla Cliente",
    });
    expect(typeof args._proximo_followup).toBe("string");
    await waitFor(() =>
      expect(estado.toast.success).toHaveBeenCalledWith(
        "Contato registrado · Carla Cliente entrou em atendimento",
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(estado.abrir).not.toHaveBeenCalled();
  });

  it("teto cheio: o contato fica, o toast explica e a janela de troca abre", async () => {
    estado.rpc.mockResolvedValue(
      retorno({
        entrou: false,
        via: null,
        status: "novo",
        lotado: { em_atendimento: 65, teto: 65 },
      }),
    );
    montar(
      <RegistrarContatoDialog
        open
        onOpenChange={() => {}}
        lead={{ ...lead, status: "novo" }}
        defaultResultado="interessado"
      />,
    );
    fireEvent.click(screen.getByText("Registrar"));
    await waitFor(() => expect(estado.abrir).toHaveBeenCalled());
    expect(estado.abrir.mock.calls[0][0]).toMatchObject({ id: lead.id, nome: "Carla Cliente" });
    expect(estado.toast.success).toHaveBeenCalledWith(
      "Contato registrado. O lead entra em atendimento quando você liberar uma vaga.",
    );
  });

  it("retorno fora do contrato vira erro (fail-closed), sem toast de sucesso", async () => {
    estado.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    montar(
      <RegistrarContatoDialog open onOpenChange={() => {}} lead={{ ...lead, status: "novo" }} />,
    );
    fireEvent.click(screen.getByText("Registrar"));
    await waitFor(() => expect(estado.toast.error).toHaveBeenCalled());
    expect(estado.toast.success).not.toHaveBeenCalled();
  });
});
