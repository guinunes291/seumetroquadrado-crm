import { cleanup, render as baseRender, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/features/dashboard/relatorios-nominais", () => ({
  useCorretorNomes: () => ({
    data: new Map([
      ["sdr-ana", "Ana SDR"],
      ["sdr-bruno", "Bruno SDR"],
      ["cor-1", "Carlos Corretor"],
    ]),
  }),
}));

const ok = <T,>(data: T) => ({ data, isLoading: false, error: null, refetch: vi.fn() });

const lead = (id: string, nome: string, sdr: string | null) => ({
  id,
  nome,
  telefone: null,
  sdr_id: sdr,
});

vi.mock("@/features/dashboard/relatorios-sdr-queries", () => ({
  useSdrsDoTime: () =>
    ok([
      { id: "sdr-ana", nome: "Ana SDR" },
      { id: "sdr-bruno", nome: "Bruno SDR" },
    ]),
  useAgendamentosSemanaSdr: () =>
    ok([
      {
        id: "ag-1",
        lead_id: "l1",
        corretor_id: "cor-1",
        criado_por_id: "sdr-ana",
        status: "agendado",
        data_inicio: "2026-09-24T14:00:00.000Z",
        created_at: "2026-09-21T13:00:00.000Z",
        lead: lead("l1", "Cliente Um", "sdr-ana"),
      },
      {
        id: "ag-2",
        lead_id: "l9",
        corretor_id: "cor-1",
        criado_por_id: "cor-1",
        status: "agendado",
        data_inicio: "2026-09-24T14:00:00.000Z",
        created_at: "2026-09-21T13:00:00.000Z",
        // lead de corretor, sem SDR: não é produção de pré-venda
        lead: lead("l9", "Cliente Sem SDR", null),
      },
    ]),
  useVisitasSemanaSdr: () =>
    ok([
      {
        id: "v-1",
        lead_id: "l1",
        corretor_id: "cor-1",
        // remarcada pelo corretor: quem criou é outro, o crédito é do SDR dono
        criado_por_id: "cor-1",
        status: "realizado",
        data_inicio: "2026-09-22T14:00:00.000Z",
        created_at: "2026-09-21T13:00:00.000Z",
        lead: lead("l1", "Cliente Um", "sdr-ana"),
      },
      {
        id: "v-2",
        lead_id: "l2",
        corretor_id: "cor-1",
        criado_por_id: "sdr-bruno",
        status: "nao_compareceu",
        data_inicio: "2026-09-23T14:00:00.000Z",
        created_at: "2026-09-21T13:00:00.000Z",
        lead: lead("l2", "Cliente Dois", "sdr-bruno"),
      },
    ]),
  usePastasSemanaSdr: () =>
    ok([
      {
        id: "p-1",
        lead_id: "l1",
        corretor_id: "cor-1",
        alterado_por: "cor-1",
        created_at: "2026-09-23T13:00:00.000Z",
        lead: lead("l1", "Cliente Um", "sdr-ana"),
      },
    ]),
  useVendasSemanaSdr: () =>
    ok([
      {
        id: "vd-1",
        lead_id: "l1",
        corretor_id: "cor-1",
        projeto_nome: "Residencial Teste",
        unidade: "101",
        valor_venda: 250000,
        data_assinatura: "2026-09-22",
        data_recebimento: null,
        status_recebimento: "pendente",
        lead: lead("l1", "Cliente Um", "sdr-ana"),
      },
    ]),
  useVendasRecebidasSemanaSdr: () =>
    ok([
      {
        id: "vd-9",
        lead_id: "l2",
        corretor_id: "cor-1",
        projeto_nome: "Residencial Antigo",
        unidade: "22",
        valor_venda: 180000,
        data_assinatura: "2026-07-10",
        data_recebimento: "2026-09-24",
        status_recebimento: "recebido",
        lead: lead("l2", "Cliente Dois", "sdr-bruno"),
      },
    ]),
}));

import { RelatoriosSdrTab } from "@/features/dashboard/relatorios-sdr-tab";

const render = (ui: ReactElement) => baseRender(ui);

/** O Intl separa "R$" do número com espaço fino — normaliza para comparar. */
const texto = (n: Element) => (n.textContent ?? "").replace(/\u00a0/g, " ");

/** Células de uma linha da tabela "Por SDR" (nome + 8 números). */
function linhaDoSdr(nome: string): string[] {
  const celula = screen.getAllByText(nome).find((n) => n.tagName === "TD");
  const linha = celula!.closest("tr")!;
  return within(linha)
    .getAllByRole("cell")
    .map((c) => texto(c));
}

beforeEach(() => {
  vi.useFakeTimers();
  // Quarta-feira, 23/09/2026 — dentro da semana sáb 19/09 → sex 25/09.
  vi.setSystemTime(new Date("2026-09-23T15:00:00.000Z"));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RelatoriosSdrTab", () => {
  it("abre na semana de pagamento sábado→sexta que está em curso", () => {
    render(<RelatoriosSdrTab />);
    expect(screen.getByText("sáb 19/09 → sex 25/09")).toBeInTheDocument();
    expect(screen.getByText("Semana em curso")).toBeInTheDocument();
  });

  it("no SÁBADO abre já na semana fechada — é a que vai ser paga naquela manhã", () => {
    vi.setSystemTime(new Date("2026-09-26T12:00:00.000Z"));
    render(<RelatoriosSdrTab />);
    expect(screen.getByText("sáb 19/09 → sex 25/09")).toBeInTheDocument();
    expect(screen.getByText("Semana fechada — folha do sábado")).toBeInTheDocument();
  });

  it("dá o crédito ao SDR dono do lead mesmo quando outra pessoa criou o registro", () => {
    render(<RelatoriosSdrTab />);
    // Ana: 1 agendamento, 1 visita realizada (remarcada pelo corretor),
    // 0 no-show, 1 pasta, 1 venda assinada, 0 recebida.
    const ana = linhaDoSdr("Ana SDR");
    expect(ana.slice(1)).toEqual(["1", "1", "0", "100%", "1", "1", "R$ 250.000", "0"]);
  });

  it("no-show não vira visita realizada e venda recebida entra em quem é dono do lead", () => {
    render(<RelatoriosSdrTab />);
    const bruno = linhaDoSdr("Bruno SDR");
    expect(bruno.slice(1)).toEqual(["0", "0", "1", "0%", "0", "0", "R$ 0", "1"]);
  });

  it("registro de lead sem SDR fica fora do relatório", () => {
    render(<RelatoriosSdrTab />);
    expect(screen.queryByText("Cliente Sem SDR")).not.toBeInTheDocument();
    const total = screen.getByText("Total").closest("tr")!;
    const celulas = within(total)
      .getAllByRole("cell")
      .map((c) => texto(c));
    // 2 agendamentos no banco, só 1 é de lead com SDR.
    expect(celulas[1]).toBe("1");
  });
});
