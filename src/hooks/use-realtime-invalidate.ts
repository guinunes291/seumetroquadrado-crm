import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Assina mudanças em uma ou mais tabelas via Supabase Realtime e invalida
 * as queryKeys informadas no react-query. Substitui polling por atualização push.
 *
 * Os eventos são COALESCIDOS numa janela (`debounceMs`, padrão 500ms): uma
 * rajada de mudanças (ex.: transferência em lote, pico de intake) gera no
 * máximo uma invalidação por janela em vez de uma por linha — evita a
 * tempestade de refetch que travava listas grandes. Use `filter` (ex.:
 * `corretor_id=eq.<uid>`) para só acordar com mudanças relevantes àquela tela.
 */
export function useRealtimeInvalidate(
  tables: string | string[],
  queryKeys: QueryKey[],
  options: { schema?: string; enabled?: boolean; filter?: string; debounceMs?: number } = {},
) {
  const qc = useQueryClient();
  const tablesArr = Array.isArray(tables) ? tables : [tables];
  const schema = options.schema ?? "public";
  const enabled = options.enabled ?? true;
  const filter = options.filter;
  const debounceMs = options.debounceMs ?? 500;
  const keysSig = JSON.stringify(queryKeys);
  const tablesSig = tablesArr.join(",");

  useEffect(() => {
    if (!enabled) return;
    const channelName = `rt-${schema}-${tablesSig}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase.channel(channelName);

    // Coalescing por janela: no máximo uma invalidação a cada `debounceMs`
    // durante uma rajada (garante atualização contínua sem starvation).
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      queryKeys.forEach((key) => {
        qc.invalidateQueries({ queryKey: key });
      });
    };
    const agendarInvalidacao = () => {
      if (timer) return;
      timer = setTimeout(flush, debounceMs);
    };

    tablesArr.forEach((table) => {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema, table, ...(filter ? { filter } : {}) },
        agendarInvalidacao,
      );
    });

    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesSig, keysSig, schema, enabled, filter, debounceMs]);
}
