// O hook é a única fronteira do funil com o banco. A regra da casa que ele
// precisa provar: falha de leitura NUNCA vira funil vazio — RPC ausente vira
// null ("sem dado"), qualquer outro erro propaga; payload fora da forma é
// rejeitado pelo zod, nunca desenhado.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "c1" }, session: null, loading: false }),
}));
vi.mock("@/hooks/use-realtime-invalidate", () => ({ useRealtimeInvalidate: () => {} }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/features/dashboard/queries", () => ({ rpc }));

import { parseFunilRows, useFilaFunil } from "@/features/fila-unica/use-fila-funil";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

afterEach(() => rpc.mockReset());

describe("parseFunilRows", () => {
  it("aceita a forma da RPC e rejeita payload fora dela", () => {
    expect(
      parseFunilRows([{ recorte: "base", etapa: "agendado", ordem: 5, quantidade: 2, parados: 1 }]),
    ).toHaveLength(1);
    expect(parseFunilRows(null)).toEqual([]);
    expect(() => parseFunilRows([{ recorte: "base", etapa: "agendado" }])).toThrow();
    expect(() => parseFunilRows([{ recorte: "base", etapa: 1, ordem: "x" }])).toThrow();
  });
});

describe("useFilaFunil", () => {
  it("chama fila_funil_v1 com a janela pedida e devolve as linhas", async () => {
    rpc.mockResolvedValue({
      data: [{ recorte: "safra", etapa: "em_atendimento", ordem: 4, quantidade: 3, parados: 1 }],
      error: null,
    });
    const { result } = renderHook(() => useFilaFunil(30), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith("fila_funil_v1", { _dias: 30, _corretor: null });
    expect(result.current.data).toEqual([
      { recorte: "safra", etapa: "em_atendimento", ordem: 4, quantidade: 3, parados: 1 },
    ]);
  });

  it("RPC ausente (banco antigo) vira null — 'sem dado', não funil vazio", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.fila_funil_v1" },
    });
    const { result } = renderHook(() => useFilaFunil(30), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("qualquer outro erro propaga para a tela (nunca lista vazia)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "conta inativa" } });
    const { result } = renderHook(() => useFilaFunil(30), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
