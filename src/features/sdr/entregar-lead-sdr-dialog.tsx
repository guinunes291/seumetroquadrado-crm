// Entrega manual com motivo (decisão 2026-09-04): lead qualificado ou com
// documento que ainda não marcou visita. Motivo obrigatório (vai para o log
// de distribuição); o lead cai em "Qualificação Corretor" na base do corretor.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { motivoEntregaValido, sdrRegraLabel } from "@/lib/sdr";
import { entregarLeadSdr, notificarCorretorSdr, useInvalidarSdr } from "./client";

type Props = {
  lead: { id: string; nome: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

export function EntregarLeadSdrDialog({ lead, open, onOpenChange, onDone }: Props) {
  const invalidar = useInvalidarSdr();
  const [motivo, setMotivo] = useState("");

  const entregar = useMutation({
    mutationFn: () => entregarLeadSdr(lead.id, motivo.trim()),
    onSuccess: (res) => {
      toast.success(`Entregue a ${res.corretor_nome ?? "um corretor"}`, {
        description: `${sdrRegraLabel(res.regra)} · o lead entra em Qualificação Corretor na base dele.`,
      });
      if (res.corretor_id) void notificarCorretorSdr(lead.id, res.corretor_id);
      invalidar(lead.id);
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error("Não foi possível entregar", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Entregar {lead.nome} sem visita marcada</DialogTitle>
          <DialogDescription>
            Use quando o cliente está pronto mas ainda não pôde marcar a visita. O motivo fica no
            histórico da distribuição.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="sdr-entrega-motivo">Motivo da entrega</Label>
          <Textarea
            id="sdr-entrega-motivo"
            rows={3}
            value={motivo}
            placeholder="Ex.: documentos recebidos, só consegue visitar em 3 semanas"
            onChange={(e) => setMotivo(e.target.value)}
          />
          {!motivoEntregaValido(motivo) && motivo.length > 0 && (
            <p className="text-xs text-destructive">Mínimo de 5 caracteres.</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!motivoEntregaValido(motivo) || entregar.isPending}
            onClick={() => entregar.mutate()}
          >
            {entregar.isPending ? "Entregando…" : "Entregar ao corretor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
