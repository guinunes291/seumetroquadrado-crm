import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { MissionQueue } from "@/features/command-center/mission-queue";
import { abrirWhatsMissao, useFilaDeMissoes } from "./use-home-data";
import type { WidgetProps } from "@/features/command-center/widget-registry";

/**
 * Widget da fila de missões: a lista única priorizada do dia (SLA estourado +
 * quentes + sem próxima ação), com follow-up de 1 clique.
 */
export function MissoesWidget(props: WidgetProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fila = useFilaDeMissoes(props);

  // Cria, em 1 clique, um follow-up para amanhã — tirando o lead do radar de risco.
  const criarFollowUpRapido = useMutation({
    mutationFn: async (lead: { id: string; nome: string }) => {
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      const { error } = await supabase.from("tarefas").insert({
        titulo: `Follow-up com ${lead.nome}`,
        tipo: "follow_up",
        prioridade: "media",
        status: "pendente",
        lead_id: lead.id,
        corretor_id: user!.id,
        criado_por: user!.id,
        data_vencimento: amanha.toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up criado para amanhã");
      qc.invalidateQueries({ queryKey: ["meu-dia:sem-acao"] });
      qc.invalidateQueries({ queryKey: ["meu-dia:tarefas"] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AsyncBoundary
      isLoading={fila.carregando}
      isError={fila.erro}
      error={fila.error}
      errorTitle="Não foi possível carregar as missões."
      onRetry={fila.recarregar}
      loadingFallback={
        <MissionQueue missions={[]} loading onWhatsApp={() => {}} onFollowUp={() => {}} />
      }
    >
      <MissionQueue
        missions={fila.missoes}
        onWhatsApp={abrirWhatsMissao}
        onFollowUp={(m) => criarFollowUpRapido.mutate({ id: m.leadId, nome: m.nome })}
        followUpPending={criarFollowUpRapido.isPending}
      />
    </AsyncBoundary>
  );
}
