// Regra dos 65, Fatia 6 — "a tentativa sem resposta". A regra mora no banco
// (tests/db/em-atendimento-fatia6.test.ts: registrar_contato_lead leva o lead
// a Aguardando retorno); aqui se trava o espelho do front: o helper que
// decide quando avisar, o contrato do retorno da RPC (`moveu`), o diálogo
// (aviso e toast) e a fiação dos outros caminhos (WhatsApp em um clique,
// Fila Única sem "Desfazer" quando a etapa muda).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AGUARDAM_PRIMEIRA_TENTATIVA,
  parseContatoRegistrado,
  tentativaMoveParaRetorno,
} from "@/lib/em-atendimento";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ---------------------------------------------------------------------------
// Parte pura
// ---------------------------------------------------------------------------

describe("tentativaMoveParaRetorno (espelho da consequência no banco)", () => {
  it("não atendeu em Novo/Aguardando atendimento move; nas outras etapas e resultados, não", () => {
    expect([...AGUARDAM_PRIMEIRA_TENTATIVA].sort()).toEqual(["aguardando_atendimento", "novo"]);
    expect(tentativaMoveParaRetorno("aguardando_atendimento", "nao_atendeu")).toBe(true);
    expect(tentativaMoveParaRetorno("novo", "nao_atendeu")).toBe(true);
    // Qualificação Corretor fica no relógio de 1 dia; Aguardando retorno já é o destino.
    expect(tentativaMoveParaRetorno("qualificacao_corretor", "nao_atendeu")).toBe(false);
    expect(tentativaMoveParaRetorno("aguardando_retorno", "nao_atendeu")).toBe(false);
    expect(tentativaMoveParaRetorno("em_atendimento", "nao_atendeu")).toBe(false);
    // "Sem interesse" é resposta (negativa), não tentativa; "atendeu" entra em atendimento.
    expect(tentativaMoveParaRetorno("aguardando_atendimento", "sem_interesse")).toBe(false);
    expect(tentativaMoveParaRetorno("aguardando_atendimento", "atendeu")).toBe(false);
    expect(tentativaMoveParaRetorno(null, "nao_atendeu")).toBe(false);
    expect(tentativaMoveParaRetorno(undefined, "nao_atendeu")).toBe(false);
  });

  it("o retorno da RPC aceita `moveu` (e continua fail-closed sem ele)", () => {
    const base = {
      ok: true,
      interacao_id: "i",
      tarefa_id: null,
      respondeu: false,
      entrou: false,
      via: null,
      status: "aguardando_retorno",
      lotado: null,
    };
    expect(parseContatoRegistrado({ ...base, moveu: true }).moveu).toBe(true);
    // Banco antigo (sem a Fatia 6): o campo pode faltar.
    expect(parseContatoRegistrado(base).moveu).toBeUndefined();
    expect(() => parseContatoRegistrado({ ...base, moveu: "sim" })).toThrow();
    expect(() => parseContatoRegistrado({ ...base, ok: false })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Fiação: cada caminho que registra tentativa diz o que aconteceu
// ---------------------------------------------------------------------------

describe("fiação da tentativa nas telas", () => {
  it("WhatsApp em um clique (lista): o toast diz que o lead aguarda retorno", () => {
    const m = read("src/features/leads/use-lead-mutations.ts");
    expect(m).toContain("contato.moveu");
    expect(m).toContain("aguarda retorno");
  });

  it("Fila Única: a tentativa que muda a etapa não tem Desfazer e o toast explica", () => {
    const d = read("src/features/fila-unica/use-desfecho.ts");
    expect(d).toContain("tentativaMoveParaRetorno(");
    expect(d).toContain("registro.aguardaRetorno = r.moveu === true");
    expect(d).toContain("aguarda retorno");
    expect(d).toMatch(/entraPorConsequencia \|\| moveParaRetorno/);
  });

  it("o manual descreve as duas etapas pelo novo sentido", () => {
    const man = read("src/features/manual/conteudo-operacao.tsx");
    expect(man).toContain("ninguém tentou contato ainda");
    expect(man).toMatch(/Você já tentou/);
  });

  it("a migration: origem 'tentativa', cadência continua, classificador com o relógio da tentativa", () => {
    const sql = read("supabase/migrations/20261011120500_em_atendimento_fatia6_tentativa.sql");
    expect(sql).toContain("'aguardando_corretor', 'aguardando_retorno');");
    expect(sql).toContain("set_config('app.em_atendimento_origem', 'tentativa', true)");
    expect(sql).toContain("'origem', NULLIF(_origem, 'transicao')");
    expect(sql).toContain("tentativa AS (");
    expect(sql).toContain("'moveu', _moveu");
    // Espelho byte a byte no Drizzle.
    expect(read("drizzle/migrations/0070_em_atendimento_fatia6_tentativa.sql")).toBe(sql);
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

describe("RegistrarContatoDialog: não atendeu", () => {
  it("em lead que ninguém tentou avisa que vai para Aguardando retorno; com resposta, o aviso some", () => {
    montar(
      <RegistrarContatoDialog
        open
        onOpenChange={() => {}}
        lead={{ ...lead, status: "aguardando_atendimento" }}
        defaultResultado="nao_atendeu"
      />,
    );
    expect(screen.getByTestId("contato-aguarda-retorno").textContent).toMatch(
      /Carla Cliente para Aguardando retorno/,
    );
    // O passo continua opcional: é lembrete, não exigência.
    expect(screen.getByText("Próximo follow-up")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Atendeu" }));
    expect(screen.queryByTestId("contato-aguarda-retorno")).toBeNull();
    expect(screen.getByTestId("contato-consequencia")).toBeTruthy();
  });

  it("em Qualificação Corretor e em Aguardando retorno não há aviso", () => {
    for (const status of ["qualificacao_corretor", "aguardando_retorno"]) {
      montar(
        <RegistrarContatoDialog
          open
          onOpenChange={() => {}}
          lead={{ ...lead, status }}
          defaultResultado="nao_atendeu"
        />,
      );
      expect(screen.queryByTestId("contato-aguarda-retorno")).toBeNull();
      cleanup();
    }
  });

  it("o banco moveu: o toast diz que o lead aguarda retorno", async () => {
    estado.rpc.mockResolvedValue({
      data: {
        ok: true,
        interacao_id: "int-1",
        tarefa_id: "tar-1",
        respondeu: false,
        entrou: false,
        moveu: true,
        via: null,
        status: "aguardando_retorno",
        lotado: null,
      },
      error: null,
    });
    const onOpenChange = vi.fn();
    montar(
      <RegistrarContatoDialog
        open
        onOpenChange={onOpenChange}
        lead={{ ...lead, status: "aguardando_atendimento" }}
        defaultResultado="nao_atendeu"
      />,
    );
    fireEvent.click(screen.getByText("Registrar"));
    await waitFor(() => expect(estado.rpc).toHaveBeenCalled());
    const [nome, args] = estado.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(nome).toBe("registrar_contato_lead");
    expect(args).toMatchObject({ _lead_id: lead.id, _resultado: "nao_atendeu" });
    await waitFor(() =>
      expect(estado.toast.success).toHaveBeenCalledWith(
        "Contato registrado · Carla Cliente aguarda retorno",
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(estado.abrir).not.toHaveBeenCalled();
  });

  it("o banco não moveu (gestão, Qualificação): o toast é o de sempre", async () => {
    estado.rpc.mockResolvedValue({
      data: {
        ok: true,
        interacao_id: "int-1",
        tarefa_id: "tar-1",
        respondeu: false,
        entrou: false,
        moveu: false,
        via: null,
        status: "qualificacao_corretor",
        lotado: null,
      },
      error: null,
    });
    montar(
      <RegistrarContatoDialog
        open
        onOpenChange={() => {}}
        lead={{ ...lead, status: "qualificacao_corretor" }}
        defaultResultado="nao_atendeu"
      />,
    );
    fireEvent.click(screen.getByText("Registrar"));
    await waitFor(() =>
      expect(estado.toast.success).toHaveBeenCalledWith("Contato registrado · follow-up agendado"),
    );
  });
});
