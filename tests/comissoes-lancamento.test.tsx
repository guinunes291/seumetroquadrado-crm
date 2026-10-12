// Comissões no padrão Lançamento (Fase 1 do plano das demais páginas): os três
// filtros saem do cabeçalho para um "Filtros" com o estado em texto, logo
// acima da tabela; o cabeçalho fica com a ação Exportar; os Totais não repetem
// o VGV (já é o primeiro número do topo); as vendas da gestão (distrato e
// exclusão) ficam atrás de "Ver vendas do período"; e o menu "…" de cada
// comissão é o AcoesLinha compartilhado, com os mesmos itens e condições.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComissaoRow } from "@/lib/comissoes";

const papel = vi.hoisted(() => ({ gestao: true }));
const dados = vi.hoisted(() => ({ comissoes: [] as unknown[] }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-auth", () => ({
  useUserRoles: () => ({
    isAdmin: papel.gestao,
    isGestor: false,
    isSuperintendente: false,
    loading: false,
  }),
}));
vi.mock("@/hooks/use-realtime-invalidate", () => ({ useRealtimeInvalidate: () => {} }));
// DataTable guarda colunas/ordem em preferências do usuário (AuthProvider +
// Supabase); aqui basta um estado em memória com a mesma assinatura.
vi.mock("@/hooks/use-preference", () => ({
  usePreference: <T,>(_key: string, fallback: T) => [fallback, () => {}] as const,
}));
vi.mock("@/components/pending-sales-approval", () => ({
  PendingSalesApproval: () => <div>Aprovações de venda</div>,
}));
vi.mock("@/components/vendas-gestao-card", () => ({
  VendasGestaoCard: () => <div data-testid="vendas-gestao">Quadro de vendas</div>,
}));
vi.mock("@/lib/comissoes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/comissoes")>()),
  listComissoes: async () => dados.comissoes,
  listVendasPeriodo: async () => [
    { id: "v1", valor_venda: 289900, percentual_comissao: 5, distrato: false },
  ],
}));

import { ComissoesPage } from "@/features/comissoes/comissoes-page";
import { ultimosMeses } from "@/lib/comissoes";

function comissao(over: Partial<ComissaoRow>): ComissaoRow {
  return {
    id: "c1",
    venda_id: "v1",
    lead_id: "l1",
    beneficiario_id: "u1",
    beneficiario_nome: "Marina Costa",
    tipo: "corretor",
    status: "pendente",
    data_pagamento: null,
    valor_base: 289900,
    percentual: 1.5,
    valor_comissao: 4348.5,
    percentual_desconto: 0,
    valor_liquido: 4348.5,
    contrato_vgv: 289900,
    observacoes: null,
    created_at: "2026-10-02T12:00:00Z",
    venda: {
      data_assinatura: "2026-10-02",
      projeto_nome: "Vibra Barra Funda",
      valor_venda: 289900,
      distrato: false,
      corretor_id: "u1",
    },
    ...over,
  };
}

function renderPagina() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ComissoesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  papel.gestao = true;
  dados.comissoes = [
    comissao({ id: "c1" }),
    comissao({
      id: "c2",
      beneficiario_id: "u2",
      beneficiario_nome: "Renata Vieira",
      tipo: "gerente",
      status: "paga",
      data_pagamento: "2026-10-08",
      valor_comissao: 869.7,
      valor_liquido: 869.7,
    }),
  ];
});
afterEach(() => cleanup());

const mesAtual = () => ultimosMeses(1)[0].label;

describe("Comissões no padrão Lançamento", () => {
  it("os filtros moram atrás de 'Filtros', com o estado em texto, e o cabeçalho fica com Exportar", async () => {
    renderPagina();
    expect(
      await screen.findByText(`${mesAtual()} · todos os status · todos os beneficiários`),
    ).toBeTruthy();
    // No padrão (mês corrente, todos os status e beneficiários) nada conta como ativo.
    expect(screen.getByRole("button", { name: "Filtros" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Exportar/ })).toBeTruthy();
    // Os Selects não ficam mais soltos na tela: só aparecem dentro do popover.
    expect(screen.queryByLabelText("Status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    expect(await screen.findByLabelText("Status")).toBeTruthy();
    expect(screen.getByLabelText("Período")).toBeTruthy();
    expect(screen.getByLabelText("Beneficiário")).toBeTruthy();
  });

  it("os Totais trazem Valor e Líquido, sem repetir o VGV do topo", async () => {
    renderPagina();
    const totais = (await screen.findByText("Totais (2 comissões)")).parentElement!;
    expect(totais.textContent).toContain("Valor");
    expect(totais.textContent).toContain("Líquido");
    expect(totais.textContent).not.toContain("VGV");
    // O VGV continua sendo o primeiro número do topo.
    expect(screen.getByText("VGV do período")).toBeTruthy();
  });

  it("as vendas da gestão ficam recolhidas atrás de 'Ver vendas do período'", async () => {
    renderPagina();
    const ver = await screen.findByRole("button", { name: /Ver vendas do período/ });
    expect(ver.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("vendas-gestao")).toBeNull();
    fireEvent.click(ver);
    expect(await screen.findByTestId("vendas-gestao")).toBeTruthy();
  });

  it("o '…' de cada comissão mantém os itens e as condições de antes", async () => {
    renderPagina();
    await screen.findByText("Marina Costa");
    const [pendente, paga] = screen.getAllByRole("button", { name: "Ações da comissão" });

    fireEvent.pointerDown(pendente, { button: 0, pointerType: "mouse" });
    const menuPendente = await screen.findByRole("menu");
    expect(within(menuPendente).getByRole("menuitem", { name: /Marcar como paga/ })).toBeTruthy();
    expect(
      within(menuPendente).getByRole("menuitem", { name: /Alterar beneficiário/ }),
    ).toBeTruthy();
    expect(within(menuPendente).getByRole("menuitem", { name: /Aplicar desconto/ })).toBeTruthy();
    expect(within(menuPendente).queryByRole("menuitem", { name: /Reverter/ })).toBeNull();
    fireEvent.keyDown(menuPendente, { key: "Escape" });

    fireEvent.pointerDown(paga, { button: 0, pointerType: "mouse" });
    const menuPaga = await screen.findByRole("menu");
    expect(within(menuPaga).getByRole("menuitem", { name: /Reverter para pendente/ })).toBeTruthy();
    expect(within(menuPaga).queryByRole("menuitem", { name: /Marcar como paga/ })).toBeNull();
  });

  it("o corretor vê as próprias comissões sem o '…', sem o quadro de vendas e sem o filtro de beneficiário", async () => {
    papel.gestao = false;
    renderPagina();
    expect(await screen.findByText(`${mesAtual()} · todos os status`)).toBeTruthy();
    expect(
      screen.getByText("Só as suas, geradas após a aprovação gerencial da venda."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ações da comissão" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ver vendas do período/ })).toBeNull();
  });
});
