import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { LeadStatus } from "@/lib/leads";
import { criarFollowUpAutomatico, followUpParaStatus } from "@/lib/follow-up";
import { transicionarLead } from "@/lib/lead-transitions";

type Vars = {
  id: string;
  status: LeadStatus;
  motivo?: string | null;
  proximaAcao?: string | null;
  proximoFollowup?: string | null;
};

type Options = {
  /** Chaves de query cujo array de leads em cache deve receber patch otimista. */
  optimisticKeys?: readonly unknown[][];
  /** Chaves a invalidar ao concluir (default: as mesmas de optimisticKeys). */
  invalidateKeys?: readonly unknown[][];
  onSuccess?: (vars: Vars) => void;
};

/**
 * Mutação reutilizável para mudar o status (etapa do funil) de um lead.
 * Centraliza o padrão otimista + invalidação usado no Kanban e na lista de Leads.
 * A RPC valida a máquina de estados e grava etapa, próxima ação, follow-up e
 * timeline na mesma transação. Nenhuma tela deve atualizar `leads.status`
 * diretamente.
 */
export function useLeadStatusMutation(opts: Options = {}) {
  const qc = useQueryClient();
  const { optimisticKeys = [], invalidateKeys = optimisticKeys, onSuccess } = opts;

  // Referência à própria mutação para permitir "Tentar novamente" no toast de erro.
  const mutateRef = useRef<((vars: Vars) => void) | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ id, status, motivo, proximaAcao, proximoFollowup }: Vars) => {
      await transicionarLead({
        id,
        status,
        motivo,
        proximaAcao,
        proximoFollowup,
      });
    },
    onMutate: async ({ id, status }) => {
      const snapshots: Array<{ key: readonly unknown[]; data: unknown }> = [];
      for (const key of optimisticKeys) {
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData(key);
        snapshots.push({ key, data: prev });
        if (Array.isArray(prev)) {
          qc.setQueryData(
            key,
            prev.map((l) =>
              l && typeof l === "object" && (l as { id?: string }).id === id ? { ...l, status } : l,
            ),
          );
        }
      }
      return { snapshots };
    },
    onError: (err: Error, vars, ctx) => {
      // Reverte o update otimista e oferece retry visível (o card "voltar" de
      // coluna no Kanban pode passar despercebido sem isso).
      ctx?.snapshots.forEach(({ key, data }) => qc.setQueryData(key, data));
      toast.error(err.message, {
        action: {
          label: "Tentar novamente",
          onClick: () => mutateRef.current?.(vars),
        },
      });
    },
    onSuccess: async (_data, vars) => {
      onSuccess?.(vars);
      // Motor anti-perda: toda transição direta que pede acompanhamento gera a
      // próxima tarefa de follow-up — em qualquer tela (lista, Kanban, Blitz,
      // detalhe). As transições com modal cuidam disso por conta própria, com os
      // dados que capturam. Best-effort: a mudança de etapa não pode falhar aqui.
      if (!followUpParaStatus(vars.status)) return;
      try {
        const { data } = await supabase
          .from("leads")
          .select("nome, corretor_id")
          .eq("id", vars.id)
          .maybeSingle();
        const lead = data as { nome: string; corretor_id: string | null } | null;
        if (!lead) return;
        const criou = await criarFollowUpAutomatico({
          leadId: vars.id,
          nome: lead.nome,
          corretorId: lead.corretor_id,
          status: vars.status,
        });
        if (criou) {
          qc.invalidateQueries({ queryKey: ["tarefas"] });
          qc.invalidateQueries({ queryKey: ["tarefas-lead", vars.id] });
        }
      } catch {
        // silencioso por design
      }
    },
    onSettled: () => {
      invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
    },
  });

  mutateRef.current = mutation.mutate;
  return mutation;
}
