import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Assina mudanças em uma ou mais tabelas via Supabase Realtime e invalida
 * as queryKeys informadas no react-query a cada evento. Substitui polling
 * (refetchInterval) por atualização push.
 */
export function useRealtimeInvalidate(
  tables: string | string[],
  queryKeys: QueryKey[],
  options: { schema?: string; enabled?: boolean } = {},
) {
  const qc = useQueryClient();
  const tablesArr = Array.isArray(tables) ? tables : [tables];
  const schema = options.schema ?? "public";
  const enabled = options.enabled ?? true;
  const keysSig = JSON.stringify(queryKeys);
  const tablesSig = tablesArr.join(",");

  useEffect(() => {
    if (!enabled) return;
    const channelName = `rt-${schema}-${tablesSig}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase.channel(channelName);

    tablesArr.forEach((table) => {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema, table },
        () => {
          queryKeys.forEach((key) => {
            qc.invalidateQueries({ queryKey: key });
          });
        },
      );
    });

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesSig, keysSig, schema, enabled]);
}
