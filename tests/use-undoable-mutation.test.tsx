import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Captura toasts para inspecionar mensagem/ação de Desfazer.
type ToastCall = { message: string; options?: { action?: { label: string; onClick: () => void } } };
const toasts: { success: ToastCall[]; error: ToastCall[] } = { success: [], error: [] };
vi.mock("sonner", () => ({
  toast: {
    success: (message: string, options?: ToastCall["options"]) => {
      toasts.success.push({ message, options });
    },
    error: (message: string, options?: ToastCall["options"]) => {
      toasts.error.push({ message, options });
    },
  },
}));

import { useUndoableMutation } from "@/hooks/use-undoable-mutation";

function wrapperWith(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  toasts.success = [];
  toasts.error = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useUndoableMutation (delayed)", () => {
  it("aplica o patch otimista já e só chama o servidor quando a janela expira", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["leads", "lista"], [{ id: "a" }, { id: "b" }]);
    const mutationFn = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useUndoableMutation<{ ids: string[] }>({
          mode: "delayed",
          message: (v) => `${v.ids.length} lead(s) movidos para a lixeira`,
          mutationFn,
          optimistic: {
            keys: [["leads"]],
            apply: (cached, vars) =>
              Array.isArray(cached)
                ? (cached as { id: string }[]).filter((l) => !vars.ids.includes(l.id))
                : cached,
          },
        }),
      { wrapper: wrapperWith(qc) },
    );

    act(() => result.current.mutate({ ids: ["a"] }));

    // otimista: some da lista na hora; servidor ainda não foi chamado
    expect(qc.getQueryData(["leads", "lista"])).toEqual([{ id: "b" }]);
    expect(mutationFn).not.toHaveBeenCalled();
    expect(toasts.success[0].message).toContain("1 lead(s)");
    expect(toasts.success[0].options?.action?.label).toBe("Desfazer");

    // janela expira → commit
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });

  it("Desfazer dentro da janela restaura o snapshot e NUNCA chama o servidor", () => {
    const qc = new QueryClient();
    qc.setQueryData(["leads", "lista"], [{ id: "a" }, { id: "b" }]);
    const mutationFn = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useUndoableMutation<{ ids: string[] }>({
          mode: "delayed",
          message: () => "movido",
          mutationFn,
          optimistic: {
            keys: [["leads"]],
            apply: (cached, vars) =>
              Array.isArray(cached)
                ? (cached as { id: string }[]).filter((l) => !vars.ids.includes(l.id))
                : cached,
          },
        }),
      { wrapper: wrapperWith(qc) },
    );

    act(() => result.current.mutate({ ids: ["a"] }));
    expect(qc.getQueryData(["leads", "lista"])).toEqual([{ id: "b" }]);

    act(() => toasts.success[0].options!.action!.onClick());

    expect(qc.getQueryData(["leads", "lista"])).toEqual([{ id: "a" }, { id: "b" }]);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(mutationFn).not.toHaveBeenCalled();
  });

  it("rollback + toast de erro quando o servidor falha no commit", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["tarefas"], [{ id: "t1", done: false }]);
    const mutationFn = vi.fn().mockRejectedValue(new Error("boom"));

    const { result } = renderHook(
      () =>
        useUndoableMutation<{ id: string }>({
          mode: "delayed",
          message: () => "Tarefa concluída",
          errorMessage: "Não foi possível concluir a tarefa",
          mutationFn,
          optimistic: {
            keys: [["tarefas"]],
            apply: (cached) =>
              Array.isArray(cached)
                ? (cached as { id: string; done: boolean }[]).map((t) => ({ ...t, done: true }))
                : cached,
          },
        }),
      { wrapper: wrapperWith(qc) },
    );

    act(() => result.current.mutate({ id: "t1" }));
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(qc.getQueryData(["tarefas"])).toEqual([{ id: "t1", done: false }]);
    expect(toasts.error[0].message).toBe("Não foi possível concluir a tarefa");
  });

  it("flush no unmount efetiva a intenção pendente (nada se perde)", async () => {
    const qc = new QueryClient();
    const mutationFn = vi.fn().mockResolvedValue(undefined);

    const { result, unmount } = renderHook(
      () =>
        useUndoableMutation<{ id: string }>({
          mode: "delayed",
          message: () => "ok",
          mutationFn,
        }),
      { wrapper: wrapperWith(qc) },
    );

    act(() => result.current.mutate({ id: "x" }));
    expect(mutationFn).not.toHaveBeenCalled();
    await act(async () => {
      unmount();
      await Promise.resolve();
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });
});

describe("useUndoableMutation (compensate)", () => {
  it("efetiva imediatamente e o Desfazer executa a inversa", async () => {
    const qc = new QueryClient();
    const mutationFn = vi.fn().mockResolvedValue(undefined);
    const inverseFn = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useUndoableMutation<{ id: string }>({
          mode: "compensate",
          message: () => "Lead restaurado",
          mutationFn,
          inverseFn,
        }),
      { wrapper: wrapperWith(qc) },
    );

    await act(async () => {
      result.current.mutate({ id: "x" });
      await Promise.resolve();
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      toasts.success[0].options!.action!.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(inverseFn).toHaveBeenCalledTimes(1);
  });
});
