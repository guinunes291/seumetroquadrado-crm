// O hook da equipe: a forma da RPC (numeric chega como string), RPC ausente
// vira null ("sem dado"), qualquer outro erro propaga.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "g1" }, session: null, loading: false }),
}));
vi.mock("@/hooks/use-realtime-invalidate", () => ({ useRealtimeInvalidate: () => {} }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/features/dashboard/queries", () => ({ rpc }));

import { parseFilaEquipe, useFilaEquipe } from "@/features/fila-unica/use-fila-equipe";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

afterEach(() => rpc.mockReset());

describe("parseFilaEquipe", () => {
  it("aceita a forma da RPC, converte em_jogo e rejeita payload fora dela", () => {
    const rows = parseFilaEquipe([
      {
        corretor_id: null,
        nome: "Sem corretor",
        carteira_ativa: 3,
        vencidos: 0,
        sem_proximo_passo: 0,
        fundo_parado: 0,
        em_jogo: "250000",
      },
    ]);
    expect(rows[0].em_jogo).toBe(250000);
    expect(parseFilaEquipe(null)).toEqual([]);
    expect(() => parseFilaEquipe([{ nome: "x" }])).toThrow();
  });
});

describe("useFilaEquipe", () => {
  it("chama fila_equipe_v1; RPC ausente vira null; erro de permissão propaga", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          corretor_id: "11111111-1111-4111-8111-111111111111",
          nome: "A",
          carteira_ativa: 1,
          vencidos: 0,
          sem_proximo_passo: 0,
          fundo_parado: 0,
          em_jogo: "0",
        },
      ],
      error: null,
    });
    const ok = renderHook(() => useFilaEquipe(), { wrapper });
    await waitFor(() => expect(ok.result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith("fila_equipe_v1", {});
    expect(ok.result.current.data?.[0].nome).toBe("A");

    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "missing" } });
    const ausente = renderHook(() => useFilaEquipe(), { wrapper });
    await waitFor(() => expect(ausente.result.current.isSuccess).toBe(true));
    expect(ausente.result.current.data).toBeNull();

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "forbidden" } });
    const negado = renderHook(() => useFilaEquipe(), { wrapper });
    await waitFor(() => expect(negado.result.current.isError).toBe(true));
  });
});
