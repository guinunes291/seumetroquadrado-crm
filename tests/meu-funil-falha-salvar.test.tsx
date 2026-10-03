import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { mensagemDeErro } from "@/lib/mensagem-erro";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "c1" }, session: null, loading: false }),
  useUserRoles: () => ({ isCorretor: true, loading: false }),
}));
// Nenhum estudo salvo hoje: sem a liberação, o estudo estaria pendente.
vi.mock("@/features/meu-funil/use-meu-funil", () => ({
  useEstudoDeHoje: () => ({ data: null, isPending: false, isError: false }),
}));

import { liberarPorFalha, useEstudoFunilPendente } from "@/features/meu-funil/use-estudo-pendente";
import { diaSaoPaulo } from "@/features/metas-dia/metas-dia";

// Quinta-feira 01/10/2026, meio-dia em São Paulo: o dia do estudo.
const QUINTA = new Date("2026-10-01T15:00:00Z");
// Sábado 03/10/2026: fora do dia do estudo.
const SABADO = new Date("2026-10-03T15:00:00Z");

beforeEach(() => {
  // Só o relógio: o setInterval do useDia segue real.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(QUINTA);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

describe("mensagemDeErro", () => {
  it("lê o erro do Supabase, que chega como objeto simples e não como Error", () => {
    // Formato exato que o postgrest-js devolve em { error } numa gravação recusada.
    const erro = {
      code: "42501",
      message: "permission denied for table x",
      details: null,
      hint: null,
    };
    expect(erro instanceof Error).toBe(false);
    expect(mensagemDeErro(erro)).toBe("permission denied for table x (42501)");
  });
});

describe("estudo pendente × dia da semana e falha ao salvar", () => {
  it("quinta sem estudo salvo: o estudo fica pendente", () => {
    const { result } = renderHook(() => useEstudoFunilPendente());
    expect(result.current).toBe(true);
  });

  it("gravação recusada libera o corretor por hoje neste aparelho", () => {
    liberarPorFalha("c1", diaSaoPaulo());
    const { result } = renderHook(() => useEstudoFunilPendente());
    expect(result.current).toBe(false);
  });

  it("fora da quinta o estudo não abre, mesmo sem estudo salvo", () => {
    vi.setSystemTime(SABADO);
    const { result } = renderHook(() => useEstudoFunilPendente());
    expect(result.current).toBe(false);
  });

  it("a liberação de outro dia não vale hoje", () => {
    liberarPorFalha("c1", "2000-01-01");
    const { result } = renderHook(() => useEstudoFunilPendente());
    expect(result.current).toBe(true);
  });
});
