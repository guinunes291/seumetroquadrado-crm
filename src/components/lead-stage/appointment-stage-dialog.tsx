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
import { Input } from "@/components/ui/input";
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

const TIPO_OPTIONS = ["visita", "reuniao", "ligacao", "follow_up", "outro"] as const;
const TIPO_LABEL: Record<(typeof TIPO_OPTIONS)[number], string> = {
  visita: "Visita",
  reuniao: "Reunião",
  ligacao: "Ligação",
  follow_up: "Follow-up",
  outro: "Outro",
};

function toLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  lead: StageLead;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

/** Modal de "Agendado": cria um agendamento e move o lead para `agendado`. */
export function AppointmentStageDialog({ lead, onOpenChange, onDone }: Props) {
  const qc = useQueryClient();
  const now = new Date();
  const [titulo, setTitulo] = useState(`Visita - ${lead.nome}`);
  const [tipo, setTipo] = useState<(typeof TIPO_OPTIONS)[number]>("visita");
  const [dataInicio, setDataInicio] = useState(toLocal(new Date(now.getTime() + 60 * 60 * 1000)));
  const [dataFim, setDataFim] = useState(toLocal(new Date(now.getTime() + 2 * 60 * 60 * 1000)));
  const [local, setLocal] = useState("");
  const [descricao, setDescricao] = useState(
    [lead.projeto_nome ? `Projeto: ${lead.projeto_nome}` : "", lead.observacoes ?? ""]
      .filter(Boolean)
      .join("\n"),
  );

  const mut = useMutation({
    mutationFn: async () => {
      if (!titulo.trim()) throw new Error("Informe um título");
      const inicio = new Date(dataInicio);
      const fim = dataFim ? new Date(dataFim) : new Date(inicio.getTime() + 60 * 60 * 1000);
      if (fim <= inicio) throw new Error("O fim deve ser depois do início");

      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;

      const { error: insErr } = await supabase.from("agendamentos").insert({
        lead_id: lead.id,
        corretor_id: lead.corretor_id ?? uid,
        criado_por_id: uid,
        tipo,
        status: "agendado",
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        local: local.trim() || null,
        data_inicio: inicio.toISOString(),
        data_fim: fim.toISOString(),
        timezone: "America/Sao_Paulo",
        lembrete_minutos: 30,
      } as never);
      if (insErr) throw insErr;

      const { error: updErr } = await supabase
        .from("leads")
        .update({ status: "agendado", ultima_interacao: new Date().toISOString() } as never)
        .eq("id", lead.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast.success("Agendamento criado · lead movido para Agendado");
      qc.invalidateQueries({ queryKey: ["agendamentos"] });
      qc.invalidateQueries({ queryKey: ["agendamentos-lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads-kanban"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      onDone?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agendar — {lead.nome}</DialogTitle>
          <DialogDescription>
            Crie o agendamento. O lead será movido para "Agendado".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Local</Label>
              <Input
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Endereço, sala, link…"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input
                type="datetime-local"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input
                type="datetime-local"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvando…" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
