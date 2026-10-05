// Permanência semanal na roleta Agendados do SDR (migration 20261011120000) —
// leituras da tela. O placar vem do SERVIDOR (`roleta_sdr_placar`, que faz o
// recorte: admin vê todos, corretor só a própria linha); o status previsto é a
// cascata pura de lib/roleta-sdr-semanal.ts sobre esse placar.
//
// As RPCs não estão nos types gerados: passam pela fronteira `rpc` de
// features/dashboard/queries (sem gastar o budget de escapes de tipo), com a
// resposta validada fail-closed. Em banco sem a migration tudo degrada para
// "regra desligada" (rpcWithFallback) e a tela some em vez de quebrar.

import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/features/dashboard/queries";
import { rpcWithFallback } from "@/lib/supabase-errors";
import {
  CONFIG_ROLETA_SDR_PADRAO,
  lerConfigRoletaSdr,
  parseApuracoes,
  parsePlacar,
  type ApuracaoSemana,
  type ConfigRoletaSdr,
  type LinhaPlacarTela,
} from "@/lib/roleta-sdr-semanal";

export type { ApuracaoSemana, LinhaPlacarTela } from "@/lib/roleta-sdr-semanal";

export const ROLETA_SDR_KEYS = {
  config: ["roleta-sdr:config"] as const,
  placar: (semana: string) => ["roleta-sdr:placar", semana] as const,
  apuracoes: (qtd: number) => ["roleta-sdr:apuracoes", qtd] as const,
};

export function useRoletaSdrConfig(enabled = true) {
  return useQuery({
    queryKey: ROLETA_SDR_KEYS.config,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () =>
      rpcWithFallback<ConfigRoletaSdr>(
        async () => {
          const { data, error } = await rpc("roleta_sdr_config", {});
          if (error) throw error;
          return lerConfigRoletaSdr(data);
        },
        () => CONFIG_ROLETA_SDR_PADRAO,
      ),
  });
}

/** Placar de uma semana (sábado "YYYY-MM-DD"). Corretor recebe só a própria linha. */
export function usePlacarRoletaSdr(semana: string, enabled = true) {
  return useQuery({
    queryKey: ROLETA_SDR_KEYS.placar(semana),
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      rpcWithFallback<LinhaPlacarTela[]>(
        async () => {
          const { data, error } = await rpc("roleta_sdr_placar", { _semana_inicio: semana });
          if (error) throw error;
          return parsePlacar(data);
        },
        () => [],
      ),
  });
}

/** As últimas `qtd` apurações gravadas (uma por semana), da mais recente para a mais antiga. */
export function useUltimasApuracoesRoletaSdr(qtd = 4, enabled = true) {
  return useQuery({
    queryKey: ROLETA_SDR_KEYS.apuracoes(qtd),
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      rpcWithFallback<ApuracaoSemana[]>(
        async () => {
          const { data, error } = await rpc("roleta_sdr_apuracoes_recentes", { _semanas: qtd });
          if (error) throw error;
          return parseApuracoes(data);
        },
        () => [],
      ),
  });
}
