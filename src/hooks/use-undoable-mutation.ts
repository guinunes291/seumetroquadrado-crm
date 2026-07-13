// useUndoableMutation — o padrão "Desfazer" universal do CRM.
//
// Dois modos:
//  * "delayed": aplica o patch otimista no cache e mostra o toast com
//    [Desfazer]; a mutação SÓ roda quando a janela expira. Desfazer = nada
//    foi ao servidor, restauramos os snapshots. Ideal p/ lixeira, bulk de
//    temperatura/follow-up, concluir tarefa, ocultar widget.
//  * "compensate": a mutação roda JÁ (estado crítico não pode esperar);
//    Desfazer executa a inversa (ex.: restaurar da lixeira).
//
// Fora do undo por regra de negócio: transição de etapa (máquina de estados),
// registrar venda (fluxo de aprovação), merge de duplicatas, importação.
//
// O snapshot/rollback segue o padrão do use-lead-status.ts (a referência de
// optimistic update do projeto).

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

export type UndoableOptions<TVars> = {
  /** Texto do toast, ex.: (v) => `${v.ids.length} leads movidos para a lixeira`. */
  message: (vars: TVars) => string;
  /** Janela do Desfazer (default 5000ms). */
  delayMs?: number;
  mode: "delayed" | "compensate";
  /** delayed: roda ao expirar a janela; compensate: roda imediatamente. */
  mutationFn: (vars: TVars) => Promise<unknown>;
  /** Só compensate: executada no Desfazer. */
  inverseFn?: (vars: TVars) => Promise<unknown>;
  /** Patch otimista aplicado a todas as queries que casam com cada key. */
  optimistic?: {
    keys: QueryKey[];
    apply: (cached: unknown, vars: TVars) => unknown;
  };
  /** Invalidadas após a mutação (e após a inversa) — além das keys otimistas. */
  invalidateKeys?: QueryKey[];
  errorMessage?: string;
};

type PendingEntry = {
  timer: ReturnType<typeof setTimeout>;
  commit: () => void;
};

export function useUndoableMutation<TVars>(options: UndoableOptions<TVars>) {
  const qc = useQueryClient();
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const pendingRef = useRef<Map<number, PendingEntry>>(new Map());
  const nextIdRef = useRef(0);

  const invalidateAll = useCallback(
    (vars: TVars) => {
      const { optimistic, invalidateKeys } = optionsRef.current;
      const keys = [...(optimistic?.keys ?? []), ...(invalidateKeys ?? [])];
      keys.forEach((key) => void qc.invalidateQueries({ queryKey: key }));
      void vars;
    },
    [qc],
  );

  const snapshotAndPatch = useCallback(
    (vars: TVars) => {
      const { optimistic } = optionsRef.current;
      if (!optimistic) return [] as [QueryKey, unknown][];
      const snapshots: [QueryKey, unknown][] = [];
      for (const key of optimistic.keys) {
        for (const [exactKey, data] of qc.getQueriesData({ queryKey: key })) {
          snapshots.push([exactKey, data]);
          qc.setQueryData(exactKey, optimistic.apply(data, vars));
        }
      }
      return snapshots;
    },
    [qc],
  );

  const rollback = useCallback(
    (snapshots: [QueryKey, unknown][]) => {
      for (const [key, data] of snapshots) qc.setQueryData(key, data);
    },
    [qc],
  );

  const runMutation = useCallback(
    async (vars: TVars, snapshots: [QueryKey, unknown][]) => {
      const { mutationFn, errorMessage } = optionsRef.current;
      try {
        await mutationFn(vars);
        invalidateAll(vars);
      } catch (err) {
        rollback(snapshots);
        const detalhe = err instanceof Error ? err.message : undefined;
        toast.error(errorMessage ?? "Não foi possível concluir a ação", {
          description: detalhe,
          action: { label: "Tentar novamente", onClick: () => void runMutation(vars, snapshots) },
        });
      }
    },
    [invalidateAll, rollback],
  );

  const mutate = useCallback(
    (vars: TVars) => {
      const { message, delayMs = 5000, mode, inverseFn } = optionsRef.current;
      const snapshots = snapshotAndPatch(vars);

      if (mode === "compensate") {
        // Efetiva já; o Desfazer aplica a inversa.
        void runMutation(vars, snapshots);
        toast.success(message(vars), {
          duration: delayMs,
          action: inverseFn
            ? {
                label: "Desfazer",
                onClick: () => {
                  void (async () => {
                    try {
                      await inverseFn(vars);
                      invalidateAll(vars);
                      toast.success("Ação desfeita");
                    } catch {
                      toast.error("Não foi possível desfazer");
                    }
                  })();
                },
              }
            : undefined,
        });
        return;
      }

      // delayed: nada vai ao servidor até a janela expirar.
      const id = nextIdRef.current++;
      const commit = () => {
        const entry = pendingRef.current.get(id);
        if (!entry) return;
        clearTimeout(entry.timer);
        pendingRef.current.delete(id);
        void runMutation(vars, snapshots);
      };
      const timer = setTimeout(commit, delayMs);
      pendingRef.current.set(id, { timer, commit });

      toast.success(message(vars), {
        duration: delayMs,
        action: {
          label: "Desfazer",
          onClick: () => {
            const entry = pendingRef.current.get(id);
            if (!entry) return; // já efetivou
            clearTimeout(entry.timer);
            pendingRef.current.delete(id);
            rollback(snapshots);
            toast.success("Ação desfeita");
          },
        },
      });
    },
    [invalidateAll, rollback, runMutation, snapshotAndPatch],
  );

  /** Efetiva imediatamente tudo que está na janela (troca de rota/unmount). */
  const flush = useCallback(() => {
    for (const entry of [...pendingRef.current.values()]) entry.commit();
  }, []);

  // A intenção do usuário nunca se perde: desmontou com janela aberta, efetiva.
  useEffect(() => flush, [flush]);

  return { mutate, flush };
}
