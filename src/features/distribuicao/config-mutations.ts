// Distribuição v3 — mutações de CONFIGURAÇÃO: settings da política, origem,
// roleta, criação de campanha, campos de distribuição do corretor e tiers.
// Recortado de queries.ts (que reexporta tudo) sem mudança de conteúdo.

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { supabasePendente } from "@/integrations/supabase/pendentes";
import type { Database, Json } from "@/integrations/supabase/types";
import { useInvalidateDistribuicao } from "./distribuicao-keys";

type LeadOrigem = Database["public"]["Enums"]["lead_origem"];

// ---------------------------------------------------------------------------
// Mutações (todas via RPC SECURITY DEFINER — a auditoria é atômica no banco)
// ---------------------------------------------------------------------------
export function useAtualizarSetting() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: { chave: string; valor: Json }) => {
      const { data, error } = await supabase.rpc("atualizar_distribuicao_setting", {
        _chave: args.chave,
        _valor: args.valor,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Configuração atualizada.");
    },
    onError: (e: Error) => toast.error(`Falha ao salvar configuração: ${e.message}`),
  });
}

/** Configuração por origem (mapeamento de roleta + tempos) — RPC admin. */
export function useAtualizarConfigOrigem() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: {
      origem: LeadOrigem;
      /** null = desvincular de roleta (leads vão para exceção); undefined = manter. */
      roletaSlug?: string | null;
      timeoutHoras?: number;
      /** null = origem sem repasse por minutos; undefined = manter. */
      timeoutMinutos?: number | null;
      slaMinutos?: number;
    }) => {
      const { data, error } = await (supabase.rpc as CallableFunction)(
        "atualizar_distribuicao_config",
        {
          _origem: args.origem,
          _roleta_slug: args.roletaSlug ?? undefined,
          _limpar_roleta: args.roletaSlug === null,
          _timeout_horas: args.timeoutHoras,
          _timeout_minutos: args.timeoutMinutos ?? undefined,
          _limpar_timeout_minutos: args.timeoutMinutos === null,
          _sla_minutos: args.slaMinutos,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Origem atualizada.");
    },
    onError: (e: Error) => toast.error(`Falha ao salvar origem: ${e.message}`),
  });
}

/** Configuração da própria roleta (horários, presença, ativo e, nas
 *  campanhas, equipe fixa + projeto + filial) — RPC admin auditada. A
 *  assinatura com `_filial_slug`/`_limpar_filial` é a da 0079 (a antiga saiu
 *  do banco); os parâmetros passam pela fronteira pendentes.ts. */
export function useAtualizarRoleta() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: {
      slug: string;
      ativo?: boolean;
      exigirPresenca?: boolean;
      horarioInicio?: string | null;
      horarioFim?: string | null;
      permitirForaHorario?: boolean;
      equipeFixa?: boolean;
      /** null = desvincular projeto; undefined = manter. */
      projetoId?: string | null;
      /** Campanha por filial (12/10/2026): null = sem filial; undefined = manter.
       *  A roleta de filial (tipo zona) não troca de filial por aqui — o banco recusa. */
      filialSlug?: string | null;
    }) => {
      const { data, error } = await supabasePendente.rpc("atualizar_roleta", {
        _slug: args.slug,
        _ativo: args.ativo,
        _exigir_presenca: args.exigirPresenca,
        _horario_inicio: args.horarioInicio,
        _horario_fim: args.horarioFim,
        _permitir_fora_horario: args.permitirForaHorario,
        _equipe_fixa: args.equipeFixa,
        _projeto_id: args.projetoId ?? undefined,
        _limpar_projeto: args.projetoId === null,
        _filial_slug: args.filialSlug ?? undefined,
        // Só manda quando é para limpar: com o parâmetro omitido a chamada
        // casa também com a assinatura antiga (banco ainda sem a 0079).
        _limpar_filial: args.filialSlug === null ? true : undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Roleta atualizada.");
    },
    onError: (e: Error) => toast.error(`Falha ao salvar roleta: ${e.message}`),
  });
}

/** Cria roleta de campanha — slug e token nascem no SERVIDOR (RPC auditada).
 *  Desde a 0079 a campanha pode nascer com a filial dona (`_filial_slug`). */
export function useCriarRoletaCampanha() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: {
      nome: string;
      equipeFixa?: boolean;
      projetoId?: string | null;
      filialSlug?: string | null;
    }) => {
      const { data, error } = await supabasePendente.rpc("criar_roleta_campanha", {
        _nome: args.nome,
        _equipe_fixa: args.equipeFixa ?? false,
        _projeto_id: args.projetoId ?? undefined,
        _filial_slug: args.filialSlug ?? undefined,
      });
      if (error) throw error;
      return data as { ok?: boolean; roleta?: { slug?: string } } | null;
    },
    onSuccess: (res) => {
      invalidate();
      toast.success(
        `Campanha criada${res?.roleta?.slug ? ` (${res.roleta.slug})` : ""} — monte a equipe e copie o token.`,
      );
    },
    onError: (e: Error) => toast.error(`Falha ao criar campanha: ${e.message}`),
  });
}

/** Campos de DISTRIBUIÇÃO do corretor (zonas, vínculo, onboarding, limite de
 *  webhook) — RPC admin auditada; nunca UPDATE direto em profiles. */
export function useAtualizarCorretorDistribuicao() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: {
      corretorId: string;
      zonas?: string[];
      /** null = limpar (volta a pendente); undefined = manter. */
      modeloContrato?: "fixo" | "autonomo" | null;
      onboardingConcluido?: boolean;
      limiteDiarioWebhook?: number;
    }) => {
      const { data, error } = await (supabase.rpc as CallableFunction)(
        "atualizar_corretor_distribuicao",
        {
          _corretor_id: args.corretorId,
          _zonas: args.zonas,
          _modelo_contrato: args.modeloContrato ?? undefined,
          _limpar_modelo_contrato: args.modeloContrato === null,
          _onboarding_concluido: args.onboardingConcluido,
          _limite_diario_webhook: args.limiteDiarioWebhook,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Corretor atualizado.");
    },
    onError: (e: Error) => toast.error(`Falha ao atualizar corretor: ${e.message}`),
  });
}

/** Recalcula os tiers de uma roleta agora (RPC com guarda admin/gestor). */
export function useRecalcularTiers() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (slug: string) => {
      const { data, error } = await supabase.rpc("recalcular_tiers_roleta", {
        _roleta_slug: slug,
        _gatilho: "manual",
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      invalidate();
      toast.success(n > 0 ? `${n} mudança(s) de tier.` : "Tiers atualizados (sem mudanças).");
    },
    onError: (e: Error) => toast.error(`Falha ao recalcular tiers: ${e.message}`),
  });
}
