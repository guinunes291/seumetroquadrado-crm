import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAD_STATUS_LABEL, type LeadStatus, type StageLead } from "@/lib/leads";
import { criarFollowUpAutomatico } from "@/lib/follow-up";
import { transicionarLead } from "@/lib/lead-transitions";

const STATUS_OPTIONS = ["enviada", "aprovada", "reprovada", "pendente"] as const;
const STATUS_LABEL: Record<(typeof STATUS_OPTIONS)[number], string> = {
  enviada: "Enviada",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
  pendente: "Pendente",
};

/** Desfecho da análise → etapa do funil. Este select já existia e o resultado
 *  ia só para o metadata da interação: o lead caía em `analise_credito` fosse
 *  qual fosse a resposta do banco, e aprovado e reprovado ficavam idênticos no
 *  kanban. Agora o desfecho move a etapa. */
const STATUS_ETAPA: Record<(typeof STATUS_OPTIONS)[number], LeadStatus> = {
  enviada: "analise_credito",
  pendente: "analise_credito",
  aprovada: "analise_aprovada",
  reprovada: "analise_reprovada",
};

type Props = {
  lead: StageLead;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

/** Modal de "Análise de crédito": registra os dados na timeline (interação) e
 *  move o lead para a etapa que corresponde ao desfecho — em análise, crédito
 *  aprovado ou crédito reprovado. */
export function CreditAnalysisDialog({ lead, onOpenChange, onDone }: Props) {
  const qc = useQueryClient();
  const [statusAnalise, setStatusAnalise] = useState<(typeof STATUS_OPTIONS)[number]>("enviada");
  const [observacoes, setObservacoes] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;

      const { error: insErr } = await supabase.from("interacoes").insert({
        lead_id: lead.id,
        autor_id: uid,
        tipo: "nota",
        direcao: "interna",
        titulo: `Análise de crédito — ${STATUS_LABEL[statusAnalise]}`,
        conteudo: observacoes.trim() || `Status da análise: ${STATUS_LABEL[statusAnalise]}`,
        metadata: { status_analise: statusAnalise },
      });
      if (insErr) throw insErr;

      // Passa SEMPRE por `analise_credito` primeiro: o lead pode estar vindo de
      // visita/proposta, de onde a máquina de estados não permite ir direto ao
      // resultado. Assim o histórico registra a entrada na análise (que de fato
      // aconteceu) e o desfecho, na ordem certa.
      await transicionarLead({ id: lead.id, nome: lead.nome, status: "analise_credito" });
      const etapaFinal = STATUS_ETAPA[statusAnalise];
      if (etapaFinal !== "analise_credito") {
        await transicionarLead({ id: lead.id, nome: lead.nome, status: etapaFinal });
      }

      // Motor anti-perda: a tarefa muda com o desfecho — cobrar o banco,
      // fechar contrato ou recompor renda.
      let followUp = false;
      try {
        followUp = await criarFollowUpAutomatico({
          leadId: lead.id,
          nome: lead.nome,
          corretorId: lead.corretor_id ?? uid,
          status: etapaFinal,
          criadoPorId: uid,
        });
      } catch (e) {
        console.warn("follow-up automático (análise) falhou", e);
      }
      return { followUp, etapaFinal };
    },
    onSuccess: (res) => {
      toast.success(
        `Análise registrada · lead movido para ${LEAD_STATUS_LABEL[res.etapaFinal]}` +
          (res?.followUp ? " · follow-up criado" : ""),
      );
      qc.invalidateQueries({ queryKey: ["interacoes", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads-kanban"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["tarefas-lead", lead.id] });
      onDone?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Análise de crédito — {lead.nome}</DialogTitle>
          <DialogDescription>
            Registre a situação da análise. Fica na timeline do lead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Situação</Label>
            <Select
              value={statusAnalise}
              onValueChange={(v) => setStatusAnalise(v as typeof statusAnalise)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              rows={4}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Banco, documentos enviados, renda considerada…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvando…" : "Registrar análise"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
