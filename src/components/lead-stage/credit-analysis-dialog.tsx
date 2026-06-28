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
import type { StageLead } from "@/lib/leads";
import { criarFollowUpAutomatico } from "@/lib/follow-up";

const STATUS_OPTIONS = ["enviada", "aprovada", "reprovada", "pendente"] as const;
const STATUS_LABEL: Record<(typeof STATUS_OPTIONS)[number], string> = {
  enviada: "Enviada",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
  pendente: "Pendente",
};

type Props = {
  lead: StageLead;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

/** Modal de "Análise de crédito": registra os dados na timeline (interação) e
 *  move o lead para `analise_credito`. */
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
      } as never);
      if (insErr) throw insErr;

      const { error: updErr } = await supabase
        .from("leads")
        .update({ status: "analise_credito" } as never)
        .eq("id", lead.id);
      if (updErr) throw updErr;

      // Motor anti-perda: cria a tarefa de cobrar o retorno do banco.
      let followUp = false;
      try {
        followUp = await criarFollowUpAutomatico({
          leadId: lead.id,
          nome: lead.nome,
          corretorId: lead.corretor_id ?? uid,
          status: "analise_credito",
          criadoPorId: uid,
        });
      } catch (e) {
        console.warn("follow-up automático (análise) falhou", e);
      }
      return { followUp };
    },
    onSuccess: (res) => {
      toast.success(
        "Análise registrada · lead movido para Análise de crédito" +
          (res?.followUp ? " · follow-up de cobrança criado" : ""),
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
