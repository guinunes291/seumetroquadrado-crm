// A query principal de /leads, extraída para ser a MESMA no modo Consulta de
// Atender (item 2.7, PR a): um único encadeamento v4 → v3 → v2 → v1 — quem
// muda a regra da lista muda nos dois lugares ao mesmo tempo, por construção.
// O fatiamento client-side do fallback v1 com filtro de contato continua na
// página (o memo `filtered`), como antes da extração.

import { supabase } from "@/integrations/supabase/client";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { passaContato, passaParado } from "@/lib/leads-views";
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

/**
 * Recortes transitórios no CLIENTE enquanto as migrations não chegam — o
 * espelho exato do memo `filtered` que vivia em leads.index.tsx, agora
 * compartilhado com o modo Consulta de Atender (item 2.7b):
 * - v2/v3: sem_contato_30d só existe a partir da v3 e _parado_dias só na v4 —
 *   nos degraus abaixo, filtra a página localmente (total fica aproximado);
 * - v1: contato e parado inteiros no cliente + a ordenação de prioridade
 *   antiga (Aguardando+ADS > Aguardando+projeto > Aguardando > demais).
 * Com a v4 aplicada em produção, devolve as linhas intactas.
 */
export function recortesClientSide(
  rows: Lead[],
  source: LeadsSource,
  contato: string,
  paradoDias: string,
  followupIds?: Set<string>,
): Lead[] {
  if (source !== "v1") {
    let out = rows;
    if (source !== "v4" && paradoDias !== "all") {
      out = out.filter((l) =>
        passaParado(paradoDias, { ultimaInteracao: l.ultima_interacao, status: l.status }),
      );
    }
    if (source === "v2" && contato === "sem_contato_30d") {
      out = out.filter((l) =>
        passaContato("sem_contato_30d", {
          ultimaInteracao: l.ultima_interacao,
          status: l.status,
          temFollowup: l.tem_followup ?? false,
        }),
      );
    }
    return out;
  }
  let base = rows;
  if (paradoDias !== "all") {
    base = base.filter((l) =>
      passaParado(paradoDias, { ultimaInteracao: l.ultima_interacao, status: l.status }),
    );
  }
  if (contato !== "all") {
    base = base.filter((l) =>
      passaContato(contato, {
        ultimaInteracao: l.ultima_interacao,
        status: l.status,
        temFollowup: followupIds?.has(l.id) ?? false,
      }),
    );
  }
  const priority = (l: Lead) => {
    const aguardando = l.status === "aguardando_atendimento";
    if (aguardando && l.origem === "facebook") return 0;
    if (aguardando && (l.projeto_id || l.projeto_nome)) return 1;
    if (aguardando) return 2;
    return 3;
  };
  return [...base].sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    if (a.status === "contrato_fechado" || b.status === "contrato_fechado") {
      const av = a.data_venda ? new Date(a.data_venda).getTime() : 0;
      const bv = b.data_venda ? new Date(b.data_venda).getTime() : 0;
      if (av !== bv) return bv - av;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

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
