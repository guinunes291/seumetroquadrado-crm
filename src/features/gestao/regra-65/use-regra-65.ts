// Leitura da simulação da regra dos 65 (modo sombra). O escopo é decidido no
// banco: gestor vê a equipe; admin/superintendente, a casa inteira e as
// portas. Sem a RPC (banco antes da migration 20261009120600), null — o cartão
// diz "sem dado", nunca uma equipe vazia.
//
// As RPCs não estão nos types gerados; passam pela fronteira `rpc` de
// features/dashboard/queries para não gastar o budget de escapes de tipo.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { rpc } from "@/features/dashboard/queries";
import {
  parseConfigRegra65,
  parseExecucoesRegra65,
  parsePortasRegra65,
  parseRegra65,
  parseRevisaoRegra65,
  type ConfigRegra65,
  type ExecucaoRegra65,
  type LinhaRegra65,
  type LinhaRevisao65,
  type PortasRegra65,
} from "@/features/gestao/regra-65/derive";

export const REGRA_65_KEY = "regra-65:sombra";
export const REGRA_65_PORTAS_KEY = "regra-65:portas";
export const REGRA_65_CONFIG_KEY = "regra-65:config";
export const REGRA_65_EXECUCOES_KEY = "regra-65:execucoes";
export const REGRA_65_REVISAO_KEY = "regra-65:revisao";

export function useRegra65Sombra(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [REGRA_65_KEY, user?.id],
    enabled: enabled && !!user,
    // A classificação percorre a carteira inteira de cada corretor: não é
    // leitura para refazer a cada foco de janela.
    staleTime: 5 * 60_000,
    queryFn: () =>
      rpcWithFallback<LinhaRegra65[] | null>(
        async () => {
          const { data, error } = await rpc("em_atendimento_sombra_v1", {});
          if (error) throw error;
          return parseRegra65(data);
        },
        () => null,
      ),
  });
}

/** Número da casa inteira — só admin/superintendente (o banco recusa o resto). */
export function useRegra65Portas(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [REGRA_65_PORTAS_KEY, user?.id],
    enabled: enabled && !!user,
    staleTime: 5 * 60_000,
    queryFn: () =>
      rpcWithFallback<PortasRegra65 | null>(
        async () => {
          const { data, error } = await rpc("em_atendimento_portas_v1", {});
          if (error) throw error;
          return parsePortasRegra65(data);
        },
        () => null,
      ),
  });
}

// ---------------------------------------------------------------------------
// Fatia 3b: o estado da regra, as rodadas, e ligar/desligar (admin)
// ---------------------------------------------------------------------------

/** A config vigente (modo, virada, teto). Sem a RPC, null. */
export function useRegra65Config(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [REGRA_65_CONFIG_KEY, user?.id],
    enabled: enabled && !!user,
    staleTime: 60_000,
    queryFn: () =>
      rpcWithFallback<ConfigRegra65 | null>(
        async () => {
          const { data, error } = await rpc("em_atendimento_config", {});
          if (error) throw error;
          return parseConfigRegra65(data);
        },
        () => null,
      ),
  });
}

/** As últimas rodadas do cron (gestão). Sem a RPC, null. */
export function useRegra65Execucoes(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [REGRA_65_EXECUCOES_KEY, user?.id],
    enabled: enabled && !!user,
    staleTime: 60_000,
    queryFn: () =>
      rpcWithFallback<ExecucaoRegra65[] | null>(
        async () => {
          const { data, error } = await rpc("em_atendimento_execucoes_v1", { _limite: 5 });
          if (error) throw error;
          return parseExecucoesRegra65(data);
        },
        () => null,
      ),
  });
}

/** Liga a regra com a data da virada (admin). Até a data, segue em sombra. */
export function useLigarRegra65() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (viradaEm: string) => {
      const { data, error } = await rpc("em_atendimento_ligar", { _virada_em: viradaEm });
      if (error) throw error;
      return parseConfigRegra65(data);
    },
    onSuccess: (cfg) => {
      toast.success(
        cfg.virada_em && new Date(cfg.virada_em).getTime() > Date.now()
          ? "Regra dos 65 agendada: até a virada ela segue em sombra."
          : "Regra dos 65 ligada: a próxima rodada do cron aplica.",
      );
      qc.invalidateQueries({ queryKey: [REGRA_65_CONFIG_KEY] });
      qc.invalidateQueries({ queryKey: [REGRA_65_KEY] });
    },
    onError: (e: Error) =>
      toast.error("Não foi possível ligar a regra", { description: e.message }),
  });
}

export function useDesligarRegra65() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await rpc("em_atendimento_desligar", {});
      if (error) throw error;
      return parseConfigRegra65(data);
    },
    onSuccess: () => {
      toast.success("Regra dos 65 de volta à sombra: nada mais se move.");
      qc.invalidateQueries({ queryKey: [REGRA_65_CONFIG_KEY] });
      qc.invalidateQueries({ queryKey: [REGRA_65_KEY] });
    },
    onError: (e: Error) =>
      toast.error("Não foi possível desligar a regra", { description: e.message }),
  });
}

// ---------------------------------------------------------------------------
// Fatia 4: a revisão mensal
// ---------------------------------------------------------------------------

/** Os últimos N meses, por corretor e a linha da casa (gestão). Sem a RPC, null. */
export function useRegra65Revisao(meses = 6, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [REGRA_65_REVISAO_KEY, user?.id, meses],
    enabled: enabled && !!user,
    // Varre as transições e os toques de meses: leitura de revisão, não de
    // acompanhamento ao vivo.
    staleTime: 5 * 60_000,
    queryFn: () =>
      rpcWithFallback<LinhaRevisao65[] | null>(
        async () => {
          const { data, error } = await rpc("em_atendimento_revisao_v1", { _meses: meses });
          if (error) throw error;
          return parseRevisaoRegra65(data);
        },
        () => null,
      ),
  });
}
