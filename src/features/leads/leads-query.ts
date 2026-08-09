// A query principal de /leads, extraída para ser a MESMA no modo Consulta de
// Atender (item 2.7, PR a): um único encadeamento v4 → v3 → v2 → v1 — quem
// muda a regra da lista muda nos dois lugares ao mesmo tempo, por construção.
// O fatiamento client-side do fallback v1 com filtro de contato continua na
// página (o memo `filtered`), como antes da extração.

import { supabase } from "@/integrations/supabase/client";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { rpcLeadsFiltered } from "./leads-rpc";
import type { Lead } from "./types";

export type LeadsSource = "v4" | "v3" | "v2" | "v1";

/** Parâmetros que a RPC v1 já conhecia (a base comum das quatro versões).
 *  Sem null: os filtros "desligados" viajam como "all", exatamente como a
 *  página monta em buildParams() — e como a RPC v1 tipada exige. */
export type LeadsQueryBaseParams = {
  _na_lixeira: boolean;
  _status?: string;
  _origem?: string;
  _corretor?: string;
  _temperatura?: string;
  _periodo_start?: string;
  _periodo_end?: string;
  _search?: string;
  _search_digits?: string;
};

export type FetchLeadsArgs = {
  params: LeadsQueryBaseParams;
  contato: string;
  /** Recorte "parado há X+ dias" (item 2.11) — null desliga; só a v4 conhece. */
  paradoDias: number | null;
  sort: string | null;
  sortDir: "asc" | "desc" | null;
  page: number;
  pageSize: number;
};

export async function fetchLeadsFiltered(
  args: FetchLeadsArgs,
): Promise<{ rows: Lead[]; source: LeadsSource }> {
  const { params: paramsV1, contato, paradoDias, sort, sortDir, page, pageSize } = args;
  const paramsPaginados = {
    ...paramsV1,
    _contato: contato,
    _sort: sort,
    _sort_dir: sortDir,
    _limit: pageSize,
    _offset: (page - 1) * pageSize,
  };
  return rpcWithFallback<{ rows: Lead[]; source: LeadsSource }>(
    // v4: tudo da v3 + recorte paramétrico "parado há X+ dias" e validação
    // estrita de _contato (valor desconhecido é erro, não lista inteira).
    async () => ({
      rows: await rpcLeadsFiltered("v4", { ...paramsPaginados, _parado_dias: paradoDias }),
      source: "v4" as const,
    }),
    () =>
      rpcWithFallback<{ rows: Lead[]; source: LeadsSource }>(
        // v3: score de prioridade e proximo_followup por linha, sort por
        // score, recorte sem_contato_30d e escopo de gestor com órfãos.
        async () => ({
          rows: await rpcLeadsFiltered("v3", paramsPaginados),
          source: "v3" as const,
        }),
        () =>
          rpcWithFallback<{ rows: Lead[]; source: LeadsSource }>(
            // v2 (P2-15): contato, sort e paginação 100% no servidor — sempre
            // uma página de pageSize, mesmo com filtro de contato ativo.
            async () => ({
              rows: await rpcLeadsFiltered("v2", paramsPaginados),
              source: "v2" as const,
            }),
            // v1 (fallback enquanto a migration não está aplicada): filtros de
            // contato ainda dependem do conjunto completo — baixa até 1000 linhas
            // e o CHAMADOR fatia no cliente; os demais paginam no banco.
            async () => {
              const v1ServerPaginated = contato === "all";
              const { data, error } = await supabase.rpc("leads_filtered", {
                ...paramsV1,
                _limit: v1ServerPaginated ? pageSize : 1000,
                _offset: v1ServerPaginated ? (page - 1) * pageSize : 0,
              });
              if (error) throw error;
              // O Row gerado da RPC é atribuível a Lead (campos `T` vs `T | null`)
              // — dispensa o antigo double-cast via unknown.
              return { rows: data ?? [], source: "v1" as const };
            },
          ),
      ),
  );
}
