// @vitest-environment jsdom
// Caracterização de src/components/leads-kanban-board.tsx escrita ANTES da
// quebra do arquivo em módulos: grava o que o quadro pede ao banco (e em que
// ordem), o conteúdo e a ordem dos cartões, "Carregar mais 20", recolher e
// expandir coluna, para onde cada "próximo passo" leva, o descarte, o peek e
// os estados de erro e vazio. Os valores esperados foram capturados do código
// original e revisados à mão.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  banco,
  cartoes,
  coluna,
  efeitos,
  id,
  montar as montarCom,
  papel,
  prepararCenario,
} from "./helpers/kanban-board-falsos";

// Cada módulo substituído vem do helper (mesma instância do estado acima).
const falsosDe = vi.hoisted(
  () => async (k: string) =>
    (await import("./helpers/kanban-board-falsos")).falsos[k as "supabase"],
);
vi.mock("@/integrations/supabase/client", () => falsosDe("supabase"));
vi.mock("@/hooks/use-auth", () => falsosDe("auth"));
vi.mock("@/features/em-atendimento/use-em-atendimento", () => falsosDe("emAtendimento"));
vi.mock("@/hooks/use-lead-status", () => falsosDe("leadStatus"));
vi.mock("@/hooks/use-realtime-invalidate", () => falsosDe("realtime"));
vi.mock("@/hooks/use-whatsapp-lead", () => falsosDe("whatsapp"));
vi.mock("@/hooks/use-mobile", () => falsosDe("mobile"));
vi.mock("@/components/lead-stage-menu", () => falsosDe("stageMenu"));
vi.mock("@/components/lead-stage/lead-stage-modals", () => falsosDe("stageModals"));
vi.mock("@/components/registrar-contato-dialog", () => falsosDe("contatoDialog"));
vi.mock("@/components/sla-badge", () => falsosDe("slaBadge"));
vi.mock("@/components/transfer-sla-badge", () => falsosDe("transferSla"));
vi.mock("@/features/leads/lead-peek-drawer", () => falsosDe("peekDrawer"));

import { KanbanBoard } from "@/components/leads-kanban-board";
const montar = () => montarCom(<KanbanBoard />);

beforeAll(() => {
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  prepararCenario();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("leads-kanban-board — caracterização", () => {
  it("pede ao banco: perfis, uma página por etapa, snapshot v3 e SLA pendente", async () => {
    montar();
    await screen.findByText("Lead 1");
    expect(banco.chamadas).toMatchInlineSnapshot(`
      [
        "from(profiles).select(id, nome).eq(ativo,true).order(nome)",
        "rpc(pipeline_stage_page_v2,{"_status":"aguardando_atendimento","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"aguardando_retorno","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"qualificacao_corretor","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"em_atendimento","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"agendado","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"visita_realizada","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"proposta_enviada","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"analise_credito","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"contrato_fechado","_limit":20})",
        "rpc(pipeline_snapshot_v3,{})",
        "rpc(leads_sla_pendentes,{})",
      ]
    `);
  });

  it("cartões: contato, dias parado, próximo passo; em atendimento ordena quem esfria primeiro", async () => {
    montar();
    await screen.findByText("Lead 1");
    expect(cartoes("em_atendimento")).toMatchInlineSnapshot(`
      [
        "Lead 2Morno(11) 9000-0002 5d paradopróximo passo: agendar visita",
        "Lead 1MornoLongitude(11) 9000-0001um@x.com 3d paradopróximo passo: agendar visita",
        "Lead 3Morno(11) 9000-0003próximo passo: agendar visita",
      ]
    `);
    expect(cartoes("agendado")).toMatchInlineSnapshot(`
      [
        "Lead 4Morno(11) 9000-0004próximo passo: marcar visita realizada",
      ]
    `);
    expect(cartoes("aguardando_atendimento")).toMatchInlineSnapshot(`
      [
        "Lead 5Morno(11) 9000-0005 19d paradopróximo passo: registrar contato",
      ]
    `);
    const badge5 = within(coluna("em_atendimento")).getByTitle("Sem interação há 5 dias");
    expect(badge5.className).toContain("bg-destructive/15");
    expect(
      within(coluna("em_atendimento")).getByTitle("Sem interação há 3 dias").className,
    ).toContain("bg-warning/15");
  });

  it("gestão vê empreendimento · corretor (ou 'sem corretor') e a contagem sem o teto 65", async () => {
    papel.gestao = true;
    montar();
    await screen.findByText("Lead 1");
    expect(cartoes("em_atendimento")).toMatchInlineSnapshot(`
      [
        "Lead 2Mornosem corretor(11) 9000-0002 5d paradopróximo passo: agendar visita",
        "Lead 1MornoLongitude · Ana Corretora(11) 9000-0001um@x.com 3d paradopróximo passo: agendar visita",
        "Lead 3Mornosem corretor(11) 9000-0003próximo passo: agendar visita",
      ]
    `);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toMatchInlineSnapshot(`
      [
        "Aguardando atendimento · 1",
        "Aguardando retorno · 0",
        "Qualificação Corretor · 0",
        "Em atendimento · 3",
        "Agendado · 21",
        "Visita realizada · 0",
        "Proposta enviada · 0",
        "Análise de crédito · 0",
        "Venda · 0",
      ]
    `);
  });

  it("abas do celular e cabeçalho mostram a ocupação do teto 65 para o corretor", async () => {
    montar();
    await screen.findByText("Lead 1");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toMatchInlineSnapshot(`
      [
        "Aguardando atendimento · 1",
        "Aguardando retorno · 0",
        "Qualificação Corretor · 0",
        "Em atendimento · 37/65",
        "Agendado · 21",
        "Visita realizada · 0",
        "Proposta enviada · 0",
        "Análise de crédito · 0",
        "Venda · 0",
      ]
    `);
    expect(screen.getByTestId("kanban-teto-65").textContent).toBe("· 37/65");
  });

  it("'Carregar mais 20' pede a página seguinte com o cursor e anexa os cartões", async () => {
    montar();
    await screen.findByText("Lead 4");
    banco.chamadas = [];
    fireEvent.click(within(coluna("agendado")).getByRole("button", { name: "Carregar mais 20" }));
    await screen.findByText("Lead 6");
    expect(banco.chamadas).toMatchInlineSnapshot(`
      [
        "rpc(pipeline_stage_page_v2,{"_status":"agendado","_limit":20,"_cursor":{"created_at":"2026-10-01T10:00:00Z","id":"00000000-0000-4000-8000-000000000004"}})",
      ]
    `);
    expect(
      within(coluna("agendado")).queryByRole("button", { name: "Carregar mais 20" }),
    ).toBeNull();
  });

  it("recolher e expandir coluna: barra com contagem, localStorage e anúncio", async () => {
    montar();
    await screen.findByText("Lead 1");
    fireEvent.click(screen.getByRole("button", { name: "Recolher coluna Agendado" }));
    const barra = screen.getByRole("button", { name: "Expandir coluna Agendado (21 leads)" });
    expect(barra.getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem("smq:kanban-colapsadas")).toBe('["agendado"]');
    expect(document.querySelector('[aria-live="polite"]')!.textContent).toBe(
      "Coluna Agendado recolhida.",
    );
    fireEvent.click(barra);
    expect(localStorage.getItem("smq:kanban-colapsadas")).toBe("[]");
    expect(document.querySelector('[aria-live="polite"]')!.textContent).toBe(
      "Coluna Agendado expandida.",
    );
  });

  it("coluna recolhida no localStorage já monta recolhida; lixo é ignorado", async () => {
    localStorage.setItem("smq:kanban-colapsadas", '["em_atendimento","etapa_que_nao_existe",3]');
    montar();
    expect(
      await screen.findByRole("button", { name: "Expandir coluna Em atendimento (3 leads)" }),
    ).toBeTruthy();
    expect(screen.queryByText("Lead 1")).toBeNull();
  });

  it("próximo passo, menu, descarte e peek levam cada lead ao fluxo certo", async () => {
    montar();
    await screen.findByText("Lead 1");
    const passo = (n: number) =>
      fireEvent.click(
        within(screen.getByRole("group", { name: new RegExp(`^Lead ${n},`) })).getByText(
          /próximo passo:/,
        ),
      );
    passo(1);
    passo(4);
    passo(5);
    act(() => efeitos.menu[id(4)].onPickDirect("visita_realizada"));
    act(() => efeitos.menu[id(4)].onPickModal("venda"));
    act(() => efeitos.menu[id(2)].onPickContato());
    fireEvent.click(
      within(screen.getByRole("group", { name: /^Lead 2,/ })).getByRole("button", {
        name: "Descartar lead",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir visão rápida de Lead 1" }));
    expect(efeitos.peek?.lead?.id).toBe(id(1));
    expect(efeitos.peek?.corretorNome).toBe("Ana Corretora");
    act(() => efeitos.peek!.onProximaAcao());
    expect(efeitos.peek?.lead).toBeNull();
    expect([...new Set(efeitos.log)]).toMatchInlineSnapshot(`
      [
        "modal agendado 00000000-0000-4000-8000-000000000001",
        "modal visita_realizada 00000000-0000-4000-8000-000000000004",
        "contato 00000000-0000-4000-8000-000000000005 aguardando_atendimento atendeu",
        "mutate 00000000-0000-4000-8000-000000000004 → visita_realizada",
        "modal venda 00000000-0000-4000-8000-000000000004",
        "contato 00000000-0000-4000-8000-000000000002 em_atendimento atendeu",
        "perdido 00000000-0000-4000-8000-000000000002",
      ]
    `);
  });

  it("erro no snapshot: aviso com 'Tentar novamente', que refaz as páginas e o snapshot", async () => {
    banco.snapshot = null;
    montar();
    expect(
      await screen.findByText("Não foi possível carregar o quadro. Tente novamente."),
    ).toBeTruthy();
    banco.chamadas = [];
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(banco.chamadas.length).toBeGreaterThanOrEqual(4));
    expect(banco.chamadas).toMatchInlineSnapshot(`
      [
        "rpc(pipeline_stage_page_v2,{"_status":"aguardando_atendimento","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"aguardando_retorno","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"qualificacao_corretor","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"em_atendimento","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"agendado","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"visita_realizada","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"proposta_enviada","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"analise_credito","_limit":20})",
        "rpc(pipeline_stage_page_v2,{"_status":"contrato_fechado","_limit":20})",
        "rpc(pipeline_snapshot_v3,{})",
      ]
    `);
  });

  it("funil vazio: a frase de vazio no lugar das colunas", async () => {
    banco.snapshot = [];
    montar();
    expect(await screen.findByText("Nenhum lead ativo no funil ainda.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Funil de leads" })).toBeNull();
  });
});
