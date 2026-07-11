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
import {
  MOTIVO_PERDA_CATEGORIAS,
  MOTIVO_PERDA_LABEL,
  type MotivoPerdaCategoria,
  type StageLead,
} from "@/lib/leads";

type Props = {
  lead: StageLead;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

/** Diálogo de "Marcar como perdido": exige categoria (sem default), força
 *  observação quando "outro", grava motivo + status + data_perda via RPC e
 *  redistribui o lead (ou envia para perdidos se ninguém elegível). */
export function PerdidoDialog({ lead, onOpenChange, onDone }: Props) {
  const qc = useQueryClient();
  const [categoria, setCategoria] = useState<MotivoPerdaCategoria | "">("");
  const [detalhe, setDetalhe] = useState("");

  const obsExigida = categoria === "outro";
  const podeSalvar = categoria !== "" && (!obsExigida || detalhe.trim().length > 0);

  const mut = useMutation({
    mutationFn: async () => {
      if (!categoria) throw new Error("Escolha o motivo da perda");
      if (obsExigida && !detalhe.trim()) {
        throw new Error("Descreva o motivo em 'Observação'");
      }
      const { data, error } = await supabase.rpc("marcar_lead_perdido_v2", {
        _lead_id: lead.id,
        _categoria: categoria,
        _detalhe: detalhe.trim() || null,
      });
      if (error) throw error;
      return data as unknown as string | null;
    },
    onSuccess: (novoCorretor) => {
      if (novoCorretor) {
        toast.success("Lead redistribuído para outro corretor");
      } else {
        toast("Sem corretor disponível — lead movido para perdidos");
      }
      qc.invalidateQueries({ queryKey: ["leads-kanban"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["interacoes", lead.id] });
      onDone?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como perdido — {lead.nome}</DialogTitle>
          <DialogDescription>
            Informe o motivo. O lead será redistribuído ao próximo corretor elegível; se não houver,
            vai para os perdidos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Motivo da perda *</Label>
            <Select
              value={categoria}
              onValueChange={(v) => setCategoria(v as MotivoPerdaCategoria)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo…" />
              </SelectTrigger>
              <SelectContent>
                {MOTIVO_PERDA_CATEGORIAS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {MOTIVO_PERDA_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{obsExigida ? "Descreva o motivo *" : "Observação (opcional)"}</Label>
            <Textarea
              rows={3}
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              placeholder="Contexto adicional sobre a perda…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !podeSalvar}
          >
            {mut.isPending ? "Processando…" : "Marcar como perdido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
