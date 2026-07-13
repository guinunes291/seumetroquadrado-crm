// Preferências de tabela por usuário (colunas ocultas, ordem, sort, densidade)
// — persistidas via camada user-prefs (localStorage + sync Supabase).

import { useCallback } from "react";
import { usePreference } from "@/hooks/use-preference";

export type TableDensity = "comfortable" | "compact";

export type TablePrefs = {
  /** Ids de colunas ocultas pelo usuário. */
  hidden?: string[];
  /** Ordem completa de colunas (ids); ausente = ordem declarada. */
  order?: string[];
  /** Último sort escolhido (uma coluna). */
  sort?: { id: string; desc: boolean } | null;
  density?: TableDensity;
};

export function useTablePrefs(tableId: string) {
  const [prefs, setPrefs] = usePreference<TablePrefs>(`table:${tableId}`, {});
  // Densidade global do usuário — usada quando a tabela não tem override.
  const [globalDensity, setGlobalDensity] = usePreference<TableDensity>(
    "ui:density",
    "comfortable",
  );

  const setHidden = useCallback(
    (hidden: string[]) => setPrefs((p) => ({ ...p, hidden })),
    [setPrefs],
  );
  const setOrder = useCallback(
    (order: string[] | undefined) => setPrefs((p) => ({ ...p, order })),
    [setPrefs],
  );
  const setSort = useCallback(
    (sort: TablePrefs["sort"]) => setPrefs((p) => ({ ...p, sort })),
    [setPrefs],
  );
  const setDensity = useCallback(
    (density: TableDensity) => setPrefs((p) => ({ ...p, density })),
    [setPrefs],
  );
  const reset = useCallback(() => setPrefs({}), [setPrefs]);

  return {
    prefs,
    density: prefs.density ?? globalDensity,
    setHidden,
    setOrder,
    setSort,
    setDensity,
    setGlobalDensity,
    reset,
  };
}
