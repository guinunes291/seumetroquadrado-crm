import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  cleanup();
  localStorage.clear();
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

describe("estudo pendente × falha ao salvar", () => {
  it("sem estudo salvo, o estudo fica pendente", () => {
    const { result } = renderHook(() => useEstudoFunilPendente());
    expect(result.current).toBe(true);
  });

  it("gravação recusada libera o corretor por hoje neste aparelho", () => {
    liberarPorFalha("c1", diaSaoPaulo());
    const { result } = renderHook(() => useEstudoFunilPendente());
    expect(result.current).toBe(false);
  });

  it("a liberação de ontem não vale hoje", () => {
    liberarPorFalha("c1", "2000-01-01");
    const { result } = renderHook(() => useEstudoFunilPendente());
    expect(result.current).toBe(true);
  });
});
