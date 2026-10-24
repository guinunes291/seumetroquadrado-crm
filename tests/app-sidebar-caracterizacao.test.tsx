// @vitest-environment jsdom
// Caracterização de src/components/app-sidebar.tsx escrita ANTES da quebra do
// arquivo em módulos: a lista de módulos por papel com as seções do módulo
// aberto, o que fica aceso (aria-current), os badges de pendência (e o 99+),
// o trilho recolhido (atalho "[" e botão), o rodapé (Configurações só para
// admin), o menu da conta (nome, iniciais, papel, Como usar o CRM, Sair) e o
// Sheet do celular. Os valores esperados foram capturados do código original
// e revisados à mão.

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const tela = vi.hoisted(() => ({
  pathname: "/fila",
  search: {} as Record<string, unknown>,
  fase: null as string | null,
  roles: ["corretor"] as string[],
  badges: null as null | Record<string, number>,
  log: [] as string[],
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: tela.pathname, search: tela.search } }),
  Link: ({
    to,
    search,
    children,
    params: _params,
    ...rest
  }: {
    to: string;
    search?: Record<string, unknown>;
    children: ReactNode;
    params?: unknown;
  }) => (
    <a
      href={search ? `${to}?${new URLSearchParams(search as Record<string, string>)}` : to}
      {...rest}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signOut: async () => {
        tela.log.push("auth.signOut()");
        return { error: null };
      },
    },
  },
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { email: "ana.souza@smq.com", user_metadata: { full_name: "Ana Maria Souza" } },
  }),
  useUserRoles: () => ({
    roles: tela.roles,
    isAdmin: tela.roles.includes("admin"),
    isCorretor: tela.roles.includes("corretor"),
  }),
}));
vi.mock("@/hooks/use-preference", async () => {
  const { useState } = await import("react");
  return { usePreference: <T,>(_k: string, inicial: T) => useState<T>(inicial) };
});
vi.mock("@/features/nav/use-nav-badges", () => ({ useNavBadges: () => tela.badges }));
vi.mock("@/features/academia/use-flags-nav", () => ({ useFlagsNav: () => new Set<string>() }));
vi.mock("@/features/nav/contexto-jornada", () => ({ useFaseDaJornada: () => tela.fase }));
vi.mock("@/features/presenca/checkin-lateral", () => ({
  CheckinLateral: ({ collapsed }: { collapsed?: boolean }) => (
    <div data-testid="checkin">checkin {collapsed ? "recolhido" : "aberto"}</div>
  ),
}));
vi.mock("@/components/theme-toggle", () => ({ ThemeMenuItems: () => null }));

import { AppSidebar, MobileSidebar } from "@/components/app-sidebar";
import { EVENTO_ABRIR_ONBOARDING } from "@/features/onboarding/onboarding";

/** Cada item da navegação: texto · destino · [atual] · pendências. */
function mapa(raiz: HTMLElement) {
  return [...raiz.querySelectorAll("a")].map((a) => {
    const nivel = a.closest("ul[aria-label^='Páginas de']") ? "  " : "";
    const atual = a.getAttribute("aria-current") ? " [atual]" : "";
    const rotulo = a.getAttribute("aria-label") ?? a.textContent;
    return `${nivel}${rotulo} → ${a.getAttribute("href")}${atual}`;
  });
}
const nav = () => screen.getByRole("navigation", { name: "Módulos" });

beforeEach(() => {
  tela.pathname = "/fila";
  tela.search = {};
  tela.fase = null;
  tela.roles = ["corretor"];
  tela.badges = null;
  tela.log = [];
});
afterEach(cleanup);

describe("app-sidebar — caracterização", () => {
  it("corretor: módulos do papel, seções do módulo aberto e a seção acesa", () => {
    render(<AppSidebar />);
    expect(mapa(nav())).toMatchInlineSnapshot(`
      [
        "Central de Comando → /fila",
        "  Fila Única → /fila [atual]",
        "  Meus 65 → /meus-65",
        "  Minha base → /reserva",
        "  Bolsão → /bolsao",
        "Prospecção → /prospeccao",
        "Gestão de Carteira → /leads",
        "Modo Visita → /modo-visita",
        "Follow-Up → /follow-up",
        "Documentação & Projetos → /projetos-foco",
        "Assinaturas & Comissões → /financeiro?tab=comissoes",
        "BI · Relatórios → /meu-raio-x",
      ]
    `);
    expect(screen.getByTestId("checkin").textContent).toBe("checkin aberto");
    expect(
      mapa(screen.getByRole("complementary").querySelector(".border-t") as HTMLElement),
    ).toMatchInlineSnapshot(`[]`);
  });

  it("módulo de uma página só (Modo Visita): o próprio item fica aceso, sem lista de seções", () => {
    tela.pathname = "/modo-visita";
    render(<AppSidebar />);
    expect(mapa(nav()).filter((l) => l.includes("[atual]") || l.startsWith("  ")))
      .toMatchInlineSnapshot(`
      [
        "Modo Visita → /modo-visita [atual]",
      ]
    `);
    expect(nav().querySelector("ul[aria-label^='Páginas de']")).toBeNull();
  });

  it("badges: pílula no módulo fechado e nas seções, 99+ acima de 99", () => {
    tela.badges = {
      atendimento: 120,
      tarefasVencidas: 2,
      agendaHoje: 1,
      aprovacoes: 4,
      followups: 7,
      mensagensAguardando: 0,
    };
    render(<AppSidebar />);
    expect(
      [...nav().querySelectorAll("[aria-label$='pendências']")].map(
        (b) => `${b.closest("a")!.textContent} ⇒ ${b.getAttribute("aria-label")}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "Prospecção99+ ⇒ 120 pendências",
        "Gestão de Carteira3 ⇒ 3 pendências",
        "Follow-Up7 ⇒ 7 pendências",
      ]
    `);
  });

  it("admin: Configurações no rodapé, sem check-in nem 'Como usar o CRM'; ficha do lead segue a fase da jornada", async () => {
    tela.roles = ["admin"];
    tela.pathname = "/leads/abc";
    tela.fase = "agendado";
    render(<AppSidebar />);
    expect(mapa(nav()).filter((l) => l.includes("[atual]") || l.startsWith("  ")))
      .toMatchInlineSnapshot(`
      [
        "  Base de leads → /leads [atual]",
        "  Kanban → /pipeline",
        "  Agenda → /agendamentos",
        "  Tarefas → /agendamentos?tab=tarefas",
      ]
    `);
    expect(screen.getByRole("link", { name: /Configurações/ })).toBeTruthy();
    expect(screen.queryByTestId("checkin")).toBeNull();
    const conta = screen.getByRole("button", { name: "Menu da conta" });
    expect(conta.textContent).toMatchInlineSnapshot(`"ASAna Maria SouzaAdministrador"`);
    fireEvent.keyDown(conta, { key: "Enter" });
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toMatchInlineSnapshot(`
      [
        "Meu perfil",
        "Sair",
      ]
    `);
  });

  it("trilho: '[' recolhe (fora de campo de texto), ícones com aria-label e bolinha; o botão expande", () => {
    tela.badges = {
      atendimento: 3,
      tarefasVencidas: 0,
      agendaHoje: 0,
      aprovacoes: 0,
      followups: 0,
      mensagensAguardando: 0,
    };
    render(
      <>
        <input aria-label="campo" />
        <AppSidebar />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("campo"), { key: "[" });
    expect(screen.getByRole("button", { name: "Recolher barra lateral" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "[", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Recolher barra lateral" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "[" });
    const expandir = screen.getByRole("button", { name: "Expandir barra lateral" });
    expect(expandir.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("complementary").className).toContain("md:w-[72px]");
    expect(mapa(nav())).toMatchInlineSnapshot(`
      [
        "Central de Comando → /fila [atual]",
        "Prospecção → /prospeccao",
        "Gestão de Carteira → /leads",
        "Modo Visita → /modo-visita",
        "Follow-Up → /follow-up",
        "Documentação & Projetos → /projetos-foco",
        "Assinaturas & Comissões → /financeiro?tab=comissoes",
        "BI · Relatórios → /meu-raio-x",
        "Fila Única → /fila [atual]",
        "Meus 65 → /meus-65",
        "Minha base → /reserva",
        "Bolsão → /bolsao",
      ]
    `);
    expect(
      [...nav().querySelectorAll("[aria-label$='pendências']")].map(
        (b) => `${b.closest("a")!.getAttribute("aria-label")} ⇒ ${b.getAttribute("aria-label")}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "Prospecção ⇒ 3 pendências",
      ]
    `);
    expect(screen.getByTestId("checkin").textContent).toBe("checkin recolhido");
    fireEvent.click(expandir);
    expect(screen.getByRole("complementary").className).toContain("md:w-68");
  });

  it("menu da conta: 'Como usar o CRM' abre a trilha; Sair encerra a sessão e vai para /auth", async () => {
    const aberturas: string[] = [];
    const ouvir = () => aberturas.push("onboarding");
    window.addEventListener(EVENTO_ABRIR_ONBOARDING, ouvir);
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { href: "/fila" } });
    try {
      render(<AppSidebar />);
      fireEvent.keyDown(screen.getByRole("button", { name: "Menu da conta" }), { key: "Enter" });
      fireEvent.click(await screen.findByRole("menuitem", { name: /Como usar o CRM/ }));
      expect(aberturas).toEqual(["onboarding"]);
      fireEvent.keyDown(screen.getByRole("button", { name: "Menu da conta" }), { key: "Enter" });
      fireEvent.click(await screen.findByRole("menuitem", { name: /Sair/ }));
      await waitFor(() => expect(window.location.href).toBe("/auth"));
      expect(tela.log).toEqual(["auth.signOut()"]);
    } finally {
      window.removeEventListener(EVENTO_ABRIR_ONBOARDING, ouvir);
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });

  it("celular: o ☰ abre o Sheet com a navegação e um clique em item fecha", async () => {
    render(<MobileSidebar />);
    expect(screen.queryByRole("navigation", { name: "Módulos" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    const links = within(await screen.findByRole("navigation", { name: "Módulos" })).getAllByRole(
      "link",
    );
    expect(screen.queryByRole("button", { name: /barra lateral/ })).toBeNull();
    act(() => {
      fireEvent.click(links[0]);
    });
    await waitFor(() => expect(screen.queryByRole("navigation", { name: "Módulos" })).toBeNull());
  });
});
