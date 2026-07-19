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
import { transicionarLead } from "@/lib/lead-transitions";

const RESULTADO_OPTIONS = [
  "interesse_alto",
  "interesse_medio",
  "interesse_baixo",
  "sem_interesse",
  "pendente_documentacao",
  "encaminhado_analise",
] as const;

const RESULTADO_LABEL: Record<(typeof RESULTADO_OPTIONS)[number], string> = {
  interesse_alto: "Interesse alto",
  interesse_medio: "Interesse médio",
  interesse_baixo: "Interesse baixo",
  sem_interesse: "Sem interesse",
  pendente_documentacao: "Pendente de documentação",
  encaminhado_analise: "Encaminhado para análise",
};

type Props = {
  lead: StageLead;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

/** Modal de "Visita realizada": registra o feedback na timeline (interação) e
 *  move o lead para `visita_realizada`. */
export function VisitFeedbackDialog({ lead, onOpenChange, onDone }: Props) {
  const qc = useQueryClient();
  const [resultado, setResultado] = useState<(typeof RESULTADO_OPTIONS)[number]>("interesse_medio");
  const [observacoes, setObservacoes] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;

      const { error: insErr } = await supabase.from("interacoes").insert({
        lead_id: lead.id,
        autor_id: uid,
        tipo: "visita",
        direcao: "interna",
        titulo: `Visita realizada — ${RESULTADO_LABEL[resultado]}`,
        conteudo: observacoes.trim() || "(sem observações)",
        metadata: { resultado },
      });
      if (insErr) throw insErr;

      await transicionarLead({ id: lead.id, nome: lead.nome, status: "visita_realizada" });

      // Motor anti-perda: pós-visita não pode ficar sem próximo passo.
      let followUp = false;
      try {
        followUp = await criarFollowUpAutomatico({
          leadId: lead.id,
          nome: lead.nome,
          corretorId: lead.corretor_id ?? uid,
          status: "visita_realizada",
          criadoPorId: uid,
        });
      } catch (e) {
        console.warn("follow-up automático (visita) falhou", e);
      }
      return { followUp };
    },
    onSuccess: (res) => {
      toast.success(
        "Visita registrada · lead movido para Visita realizada" +
          (res?.followUp ? " · follow-up de pós-visita criado" : ""),
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
          <DialogTitle>Registrar visita — {lead.nome}</DialogTitle>
          <DialogDescription>
            Registre o resultado da visita. Fica na timeline do lead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Resultado</Label>
            <Select value={resultado} onValueChange={(v) => setResultado(v as typeof resultado)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESULTADO_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {RESULTADO_LABEL[r]}
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
              placeholder="Impressões, objeções, próximos passos…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvando…" : "Registrar visita"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
