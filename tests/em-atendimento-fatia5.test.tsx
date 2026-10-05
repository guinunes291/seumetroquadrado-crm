// Regra dos 65, Fatia 5 — a virada segura na tela: o aviso ao corretor
// (agendada / recém-ligada) e a dica "um motor só" no cartão da régua.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { avisoDaVirada, DIAS_DE_AVISO_APOS_VIRADA } from "@/lib/em-atendimento";
import type { ConfigRegra65 } from "@/features/gestao/regra-65/derive";

const agora = new Date("2026-10-06T12:00:00Z");
const cfg = (p: Partial<ConfigRegra65> = {}): ConfigRegra65 => ({
  modo: "sombra",
  virada_em: null,
  teto: 65,
  trava_roleta: 60,
  teto_base: 150,
  dias_sem_toque: 5,
  ...p,
});

describe("Fatia 5: quando avisar a virada (derivação)", () => {
  it("sombra: nada; agendada: a data; ligada: até 7 dias depois da virada", () => {
    expect(avisoDaVirada(cfg(), agora)).toBeNull();
    expect(avisoDaVirada(null, agora)).toBeNull();
    expect(
      avisoDaVirada(cfg({ modo: "ligado", virada_em: "2026-10-13T09:00:00Z" }), agora),
    ).toEqual({
      estado: "agendada",
      viradaEm: new Date("2026-10-13T09:00:00Z"),
    });
    expect(
      avisoDaVirada(cfg({ modo: "ligado", virada_em: "2026-10-05T09:00:00Z" }), agora),
    ).toEqual({
      estado: "ligada",
      desde: new Date("2026-10-05T09:00:00Z"),
    });
    const antiga = new Date(agora.getTime() - (DIAS_DE_AVISO_APOS_VIRADA + 1) * 86_400_000);
    expect(
      avisoDaVirada(cfg({ modo: "ligado", virada_em: antiga.toISOString() }), agora),
    ).toBeNull();
  });

  it("ligada sem data de virada usa ligado_em; sem nenhuma, não avisa", () => {
    expect(
      avisoDaVirada(
        cfg({ modo: "ligado", virada_em: null, ligado_em: "2026-10-04T10:00:00Z" }),
        agora,
      ),
    ).toEqual({ estado: "ligada", desde: new Date("2026-10-04T10:00:00Z") });
    expect(avisoDaVirada(cfg({ modo: "ligado", virada_em: null }), agora)).toBeNull();
    expect(avisoDaVirada(cfg({ modo: "ligado", virada_em: "não é data" }), agora)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

const estado = vi.hoisted(() => ({
  config: { data: undefined as ConfigRegra65 | null | undefined },
}));
vi.mock("@/features/gestao/regra-65/use-regra-65", () => ({
  useRegra65Config: () => estado.config,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search: _search,
    ...rest
  }: { children: React.ReactNode; to: string; search?: unknown } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { AvisoViradaRegra65 } from "@/features/em-atendimento/aviso-virada";
import { ReguaEditor } from "@/features/gestao/regua-followup-config";

afterEach(() => {
  cleanup();
  estado.config.data = undefined;
});

const emUmaSemana = new Date(Date.now() + 7 * 86_400_000).toISOString();
const ontem = new Date(Date.now() - 86_400_000).toISOString();

describe("Fatia 5: o aviso da virada", () => {
  it("agendada: data, o que muda, e a porta para os Meus 65", () => {
    estado.config.data = cfg({ modo: "ligado", virada_em: emUmaSemana });
    render(<AvisoViradaRegra65 />);
    const aviso = screen.getByTestId("aviso-virada-65");
    expect(aviso.getAttribute("data-estado")).toBe("agendada");
    expect(aviso.textContent).toMatch(/A regra dos 65 liga em \d{2}\/\d{2} às \d{2}:\d{2}\./);
    expect(aviso.textContent).toContain("5 dias sem contato registrado e o lead perde a vaga");
    expect(aviso.textContent).toContain("60 em atendimento ou 150 na Minha base");
    expect(aviso.textContent).toContain("Contato fora do CRM não conta");
    expect(aviso.textContent).toContain("Até lá, escolha quem fica nos seus 65");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/meus-65");
  });

  it("recém-ligada: diz que já vale; em sombra ou sem a migration, some", () => {
    estado.config.data = cfg({ modo: "ligado", virada_em: ontem });
    render(<AvisoViradaRegra65 />);
    const aviso = screen.getByTestId("aviso-virada-65");
    expect(aviso.getAttribute("data-estado")).toBe("ligada");
    expect(aviso.textContent).toMatch(/está valendo desde/);
    cleanup();
    estado.config.data = cfg();
    render(<AvisoViradaRegra65 />);
    expect(screen.queryByTestId("aviso-virada-65")).toBeNull();
    cleanup();
    estado.config.data = null;
    render(<AvisoViradaRegra65 />);
    expect(screen.queryByTestId("aviso-virada-65")).toBeNull();
  });
});

describe("Fatia 5: um motor só no cartão da régua", () => {
  const row = { chave: "regua_followup", valor: {}, descricao: "" };

  it("com a regra dos 65 ligada ou agendada, a devolução por SLA nasce travada, com o motivo", () => {
    estado.config.data = cfg({ modo: "ligado", virada_em: emUmaSemana });
    render(<ReguaEditor row={row} onSave={vi.fn()} saving={false} />);
    const chave = screen.getByRole("switch", { name: "Devolução automática ativa" });
    expect(chave.hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("regua-um-motor").textContent).toContain("um motor só");
  });

  it("em sombra a chave fica livre e não há dica", () => {
    estado.config.data = cfg();
    render(<ReguaEditor row={row} onSave={vi.fn()} saving={false} />);
    const chave = screen.getByRole("switch", { name: "Devolução automática ativa" });
    expect(chave.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByTestId("regua-um-motor")).toBeNull();
  });
});
