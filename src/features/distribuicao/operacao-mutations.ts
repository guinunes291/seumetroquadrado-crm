// Distribuição v3 — mutações da OPERAÇÃO do dia: participante na roleta,
// exceção, distribuição manual, presença pela gestão, rodada automática e
// escoamento do estoque.
// Recortado de queries.ts (que reexporta tudo) sem mudança de conteúdo.

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { motivoExcecaoLabel } from "@/lib/distribuicao";
import { useInvalidateDistribuicao } from "./distribuicao-keys";

// ---------------------------------------------------------------------------
// Mutações (todas via RPC SECURITY DEFINER — a auditoria é atômica no banco)
// ---------------------------------------------------------------------------
export function useGerenciarParticipante() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: {
      slug: string;
      corretorId: string;
      acao: "incluir" | "remover" | "pausar" | "reativar" | "limite";
      motivo?: string;
      limite?: number | null;
      pausadoAte?: string;
    }) => {
      const { data, error } = await supabase.rpc("gerenciar_participante_roleta", {
        _slug: args.slug,
        _corretor_id: args.corretorId,
        _acao: args.acao,
        _motivo: args.motivo,
        _limite: args.limite ?? undefined,
        _pausado_ate: args.pausadoAte,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(`Falha na ação: ${e.message}`),
  });
}

/** Notifica o corretor via WhatsApp (edge fn) — paridade com as demais
 *  atribuições manuais do CRM; falha nunca bloqueia a ação. */
async function notificarCorretorTransferencia(leadId: string, corretorId: string) {
  try {
    await supabase.functions.invoke("notify-lead-transfer", {
      body: { lead_id: leadId, corretor_id: corretorId },
    });
  } catch (e) {
    console.warn("[distribuicao] notificação WhatsApp falhou:", e);
  }
}

export function useResolverExcecao() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: {
      excecaoId: string;
      leadId: string;
      acao: string;
      params?: Json;
    }) => {
      const { data, error } = await supabase.rpc("resolver_excecao", {
        _excecao_id: args.excecaoId,
        _acao: args.acao,
        _params: args.params ?? {},
      });
      if (error) throw error;
      return data as {
        ok?: boolean;
        motivo?: string;
        corretor_id?: string;
        corretor_nome?: string;
      } | null;
    },
    onSuccess: (res, args) => {
      invalidate();
      if (res && res.ok === false) {
        toast.warning(
          `Ainda sem corretor apto${res.motivo ? ` (${motivoExcecaoLabel(res.motivo)})` : ""} — exceção mantida.`,
        );
      } else if (res?.ok && res.corretor_id) {
        void notificarCorretorTransferencia(args.leadId, res.corretor_id);
      }
    },
    onError: (e: Error) => toast.error(`Falha ao resolver exceção: ${e.message}`),
  });
}

export function useDistribuirManual() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (args: {
      leadId: string;
      corretorId?: string;
      roletaSlug?: string;
      gatilho?: string;
    }) => {
      const { data, error } = await supabase.rpc("distribuir_lead_v3", {
        _lead_id: args.leadId,
        _tipo: args.corretorId ? "manual" : "automatica",
        _roleta_slug: args.roletaSlug,
        _corretor_id: args.corretorId,
        _gatilho: args.gatilho ?? "manual",
      });
      if (error) throw error;
      return data as {
        ok?: boolean;
        corretor_id?: string;
        corretor_nome?: string;
        motivo?: string;
        aviso_zona?: string | null;
      } | null;
    },
    onSuccess: (res, args) => {
      invalidate();
      if (res?.ok) {
        toast.success(`Lead distribuído para ${res.corretor_nome ?? "corretor"}.`);
        // Fora da zona: a atribuição manual vale, mas o gestor precisa saber
        // que está passando por cima do corte geográfico (fica no log também).
        if (res.aviso_zona) toast.warning(res.aviso_zona);
        if (res.corretor_id) void notificarCorretorTransferencia(args.leadId, res.corretor_id);
      } else {
        toast.warning(`Sem corretor apto (${res?.motivo ?? "?"}) — lead na fila de exceções.`);
      }
    },
    onError: (e: Error) => toast.error(`Falha na distribuição: ${e.message}`),
  });
}

/** Gestor marca presença de outro corretor (capacidade da página antiga). */
export function useMarcarPresencaAdmin() {
  const invalidate = useInvalidateDistribuicao();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: { corretorId: string; presente: boolean }) => {
      // A gestão não LIGA a si mesma nas roletas (decisão do dono, 13/10/2026):
      // o interruptor fura a regra da localização de propósito, para os outros;
      // para si, o gestor que também é corretor faz o check-in como todo
      // corretor. Desligar a própria presença (encerrar o dia) continua valendo.
      if (args.presente && user && args.corretorId === user.id) {
        throw new Error(
          "a gestão não libera a si mesma: faça o seu check-in pelo Check-in da barra lateral, com a localização do celular",
        );
      }
      const { error } = await supabase.rpc("marcar_presenca_admin", {
        _corretor_id: args.corretorId,
        _presente: args.presente,
      });
      if (error) throw error;
    },
    onSuccess: (_res, args) => {
      invalidate();
      toast.success(
        args.presente
          ? "Na roleta hoje — registrado como liberado pela gestão."
          : "Presença encerrada: fora da roleta até o próximo check-in.",
      );
    },
    onError: (e: Error) => toast.error(`Falha ao marcar presença: ${e.message}`),
  });
}

export function useRodarDistribuicao() {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("processar_distribuicao_automatica");
      if (error) throw error;
      return data as {
        distribuidos?: number;
        sem_corretor?: number;
        repassados_sla?: number;
        redistribuidos?: number;
      } | null;
    },
    onSuccess: (res) => {
      invalidate();
      toast.success(
        `Rodada concluída: ${res?.distribuidos ?? 0} distribuídos · ` +
          `${res?.sem_corretor ?? 0} sem corretor · ${res?.repassados_sla ?? 0} repasses SLA · ` +
          `${res?.redistribuidos ?? 0} redistribuídos.`,
      );
    },
    onError: (e: Error) => toast.error(`Falha ao rodar distribuição: ${e.message}`),
  });
}

/** Escoa o estoque de leads sem corretor para os aptos da roleta. */
export function useEscoarEstoque(slug: string) {
  const invalidate = useInvalidateDistribuicao();
  return useMutation({
    mutationFn: async (limite: number) => {
      const { data, error } = await supabase.rpc("distribuir_estoque_roleta", {
        _roleta: slug,
        _limite: limite,
      });
      if (error) throw error;
      return data as {
        distribuidos?: number;
        corretores_aptos?: number;
        restante_estoque?: number;
      } | null;
    },
    onSuccess: (res) => {
      invalidate();
      toast.success(
        `${res?.distribuidos ?? 0} leads do estoque distribuídos para ${res?.corretores_aptos ?? 0} corretor(es) apto(s) · ` +
          `${res?.restante_estoque ?? 0} ainda no estoque.`,
      );
    },
    onError: (e: Error) => toast.error(`Falha ao escoar estoque: ${e.message}`),
  });
}
