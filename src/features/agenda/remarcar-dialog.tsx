// Remarcar direto da linha: só o novo dia/hora. Duração, lead, local e título
// vêm do compromisso atual (regra em agenda-do-dia.ts → remarcarPayload).

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toLocalInput } from "./types";
import { validarRemarcacao, type ItemAgendaDia } from "./agenda-do-dia";

type Props = {
  item: ItemAgendaDia;
  onOpenChange: (open: boolean) => void;
  onSubmit: (novoInicio: Date) => void;
  pending?: boolean;
};

/** Sugestão: mesmo horário, no dia seguinte ao compromisso (ou amanhã, se já passou). */
function sugestaoNovoInicio(item: ItemAgendaDia, agora = new Date()): string {
  const base = new Date(item.data_inicio);
  const d = new Date(base);
  d.setDate(d.getDate() + 1);
  if (d <= agora) {
    d.setFullYear(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
  }
  return toLocalInput(d);
}

export function RemarcarDialog({ item, onOpenChange, onSubmit, pending }: Props) {
  const [valor, setValor] = useState(() => sugestaoNovoInicio(item));
  const [erro, setErro] = useState<string | null>(null);

  const submit = () => {
    const novo = new Date(valor);
    const e = validarRemarcacao(novo);
    setErro(e);
    if (e) return;
    onSubmit(novo);
  };

  const atual = format(new Date(item.data_inicio), "EEEE, dd/MM 'às' HH:mm", { locale: ptBR });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            Remarcar · {item.lead?.nome ?? item.titulo}
          </DialogTitle>
          <DialogDescription>
            Hoje está para {atual}. O horário atual fica no histórico como "remarcado" e um novo
            compromisso é criado com a mesma duração.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="remarcar-para">Novo dia e horário</Label>
          <Input
            id="remarcar-para"
            type="datetime-local"
            className="min-h-11"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoFocus
          />
          {erro && (
            <p className="text-xs text-destructive" role="alert">
              {erro}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending} className="min-h-11">
            {pending ? "Remarcando…" : "Remarcar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
