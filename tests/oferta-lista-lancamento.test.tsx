// Detalhe de uma lista da Oferta Ativa no padrão Lançamento (Fase 1 do plano
// das demais páginas): sem a seta de voltar no título (a trilha já leva), o
// status ao lado do nome, três StatTiles no topo, a etapa atrás de "Filtros"
// (busca e Contato seguem à vista), WhatsApp como a ação da linha e Ligar,
// Abrir lead e a etapa no "…"; a faixa de 100% sem emoji, na cor de sucesso.
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OfertaLeadRow } from "@/lib/oferta-ativa";

const papel = vi.hoisted(() => ({ gestao: false }));
const dados = vi.hoisted(() => ({ leads: [] as unknown[] }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({
    ...opts,
    useParams: () => ({ ofertaId: "o1" }),
  }),
  Link: ({
    children,
    to,
    params: _params,
    ...rest
  }: {
    children: ReactNode;
    to: string;
    params?: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));
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
vi.mock("@/hooks/use-lead-status", () => ({
  useLeadStatusMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/oferta-envio-massa", () => ({ OfertaEnvioMassa: () => null }));
vi.mock("@/components/lead-stage/lead-stage-modals", () => ({ LeadStageModals: () => null }));
vi.mock("@/lib/oferta-ativa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/oferta-ativa")>()),
  getOferta: async () => ({
    oferta: {
      id: "o1",
      nome: "Vibra Barra Funda — renda 4 a 6 mil",
      descricao: "Quem pediu Barra Funda nos últimos 90 dias.",
      status: "ativa",
      corretor_id: "u1",
      criado_por: "u1",
      filtros: {},
      created_at: "2026-10-05T12:00:00Z",
      updated_at: "2026-10-05T12:00:00Z",
    },
    leads: dados.leads,
  }),
}));

import { Route } from "@/routes/_authenticated/oferta-ativa.$ofertaId";

function vinculo(id: string, nome: string, over: Partial<OfertaLeadRow> = {}, status = "novo") {
  return {
    id,
    contatado: false,
    contatado_em: null,
    avancado: false,
    lead: {
      id: `l-${id}`,
      nome,
      telefone: "(11) 98765-4321",
      projeto_nome: "Vibra Barra Funda",
      projeto_id: "p1",
      corretor_id: "u1",
      observacoes: null,
      status,
    },
    ...over,
  };
}

function renderPagina() {
  const Pagina = (Route as unknown as { component: () => ReactNode }).component;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Pagina />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  papel.gestao = false;
  dados.leads = [
    vinculo("v1", "Paulo Henrique"),
    vinculo("v2", "Sueli Ramos", { contatado: true }, "agendado"),
  ];
});
afterEach(() => cleanup());

describe("Lista da Oferta Ativa no padrão Lançamento", () => {
  it("um título só, com o status ao lado e sem a seta de voltar", async () => {
    renderPagina();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Vibra Barra Funda — renda 4 a 6 mil" }),
    ).toBeTruthy();
    expect(screen.getByText("Ativa")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Voltar para Oferta Ativa" })).toBeNull();
  });

  it("o topo são três números com dono, os mesmos de antes", async () => {
    renderPagina();
    expect(await screen.findByText("Total de leads")).toBeTruthy();
    expect(screen.getByText("Contatados · desde a criação")).toBeTruthy();
    expect(screen.getByText("Avançados · desde a criação")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("busca e Contato à vista; a etapa só aparece dentro de 'Filtros'", async () => {
    renderPagina();
    expect(await screen.findByRole("textbox", { name: "Buscar na lista" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Não contatados" })).toBeTruthy();
    expect(screen.getByText("todas as etapas")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Agendado · 1/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    const chip = await screen.findByRole("button", { name: /Agendado · 1/ });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    const botao = await screen.findByRole("button", { name: "Filtros (1 ativos)" });
    // O estado vira texto ao lado do botão, e a lista obedece.
    expect(botao.parentElement!.querySelector("span")!.textContent).toBe("Agendado");
    await waitFor(() =>
      expect(
        screen.queryAllByRole("button", { name: "Enviar WhatsApp para Paulo Henrique" }),
      ).toHaveLength(0),
    );
    expect(
      screen.getAllByRole("button", { name: "Enviar WhatsApp para Sueli Ramos" }).length,
    ).toBeGreaterThan(0);
  });

  it("WhatsApp é a ação da linha; Ligar, Abrir lead e a etapa vão para o '…'", async () => {
    renderPagina();
    expect(
      (await screen.findAllByRole("button", { name: "Enviar WhatsApp para Paulo Henrique" }))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Ligar para Paulo Henrique" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mudar etapa do lead" })).toBeNull();

    const [mais] = screen.getAllByRole("button", { name: "Mais ações de Paulo Henrique" });
    fireEvent.pointerDown(mais, { button: 0, pointerType: "mouse" });
    const menu = await screen.findByRole("menu");
    const ligar = within(menu).getByRole("menuitem", { name: /Ligar/ });
    expect(ligar.getAttribute("href")).toBe("tel:(11) 98765-4321");
    expect(within(menu).getByRole("menuitem", { name: /Abrir lead/ })).toBeTruthy();
    expect(within(menu).getByText("Mover para")).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: /Marcar como perdido/ })).toBeTruthy();
  });

  it("com todos contatados, a gestão vê a faixa de sucesso sem emoji", async () => {
    papel.gestao = true;
    dados.leads = [
      vinculo("v1", "Paulo Henrique", { contatado: true }),
      vinculo("v2", "Sueli Ramos", { contatado: true }),
    ];
    renderPagina();
    const frase = await screen.findByText("Todos os 2 leads desta lista já foram contatados.");
    const faixa = frase.parentElement!;
    expect(faixa.className).toContain("bg-success/10");
    expect(faixa.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(within(faixa).getByRole("button", { name: /Concluir lista/ })).toBeTruthy();
    // O menu de gestão do cabeçalho continua lá.
    expect(screen.getByRole("button", { name: "Ações da lista" })).toBeTruthy();
  });
});
