// Agendar visita pelo SDR — a roleta roda ANTES do agendamento (decisão
// 2026-09-04): o SDR só escolhe o horário; quem atende é decidido pelo motor
// (corretor original com prioridade, senão roleta de agendados pulando
// conflito de agenda) e o agendamento já nasce no nome do corretor. O SDR
// recebe as tarefas de confirmação D-1/D-0.

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { sdrRegraLabel } from "@/lib/sdr";
import { agendarVisitaSdr, notificarCorretorSdr, useInvalidarSdr } from "./client";

function toLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const HORARIOS = Array.from({ length: 23 }, (_, i) => {
  const m = 8 * 60 + i * 30; // 08:00 → 19:00 a cada 30min
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

type Props = {
  lead: { id: string; nome: string; projeto_nome?: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

export function AgendarVisitaSdrDialog({ lead, open, onOpenChange, onDone }: Props) {
  const invalidar = useInvalidarSdr();
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  amanha.setHours(10, 0, 0, 0);
  const [dataInicio, setDataInicio] = useState(toLocal(amanha));
  const [titulo, setTitulo] = useState(`Visita - ${lead.nome}`);
  const [local, setLocal] = useState(lead.projeto_nome ?? "");
  const [descricao, setDescricao] = useState("");

  const diaAtual = dataInicio.slice(0, 10);
  const horaAtual = dataInicio.slice(11, 16);
  const offsetDateStr = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return toLocal(d).slice(0, 10);
  };
  const setDia = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const [hh, mm] = (horaAtual || "10:00").split(":").map(Number);
    d.setHours(hh, mm, 0, 0);
    setDataInicio(toLocal(d));
  };
  const setHora = (hhmm: string) => setDataInicio(`${diaAtual}T${hhmm}`);

  const agendar = useMutation({
    mutationFn: async () => {
      const inicio = new Date(dataInicio);
      if (Number.isNaN(inicio.getTime())) throw new Error("Informe a data e o horário da visita.");
      if (inicio.getTime() <= Date.now()) throw new Error("A visita precisa estar no futuro.");
      const fim = new Date(inicio.getTime() + 60 * 60 * 1000);
      return agendarVisitaSdr({
        leadId: lead.id,
        dataInicio: inicio.toISOString(),
        dataFim: fim.toISOString(),
        titulo: titulo.trim() || null,
        local: local.trim() || null,
        descricao: descricao.trim() || null,
      });
    },
    onSuccess: async (res) => {
      toast.success(`Visita marcada com ${res.corretor_nome ?? "o corretor"}`, {
        description: `${sdrRegraLabel(res.regra)} · você confirma a visita (D-1 e no dia); o corretor atende da visita em diante.`,
      });
      if (res.corretor_id) void notificarCorretorSdr(lead.id, res.corretor_id);
      invalidar(lead.id);
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error("Não foi possível agendar", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agendar visita e entregar ao corretor</DialogTitle>
          <DialogDescription>
            A roleta escolhe o corretor apto e com agenda livre neste horário. Se o lead já tem
            corretor ativo, ele tem prioridade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Dia</Label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { l: "Hoje", n: 0 },
                { l: "Amanhã", n: 1 },
                { l: "+2 dias", n: 2 },
                { l: "+3 dias", n: 3 },
              ].map((o) => (
                <Button
                  key={o.n}
                  type="button"
                  size="sm"
                  variant={diaAtual === offsetDateStr(o.n) ? "default" : "outline"}
                  onClick={() => setDia(o.n)}
                >
                  {o.l}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Horário</Label>
            <div className="flex flex-wrap gap-1">
              {HORARIOS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHora(h)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs tabular-nums transition-colors",
                    horaAtual === h
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sdr-visita-quando">Data e hora</Label>
              <Input
                id="sdr-visita-quando"
                type="datetime-local"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sdr-visita-local">Local</Label>
              <Input
                id="sdr-visita-local"
                value={local}
                placeholder="Estande, decorado, endereço…"
                onChange={(e) => setLocal(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sdr-visita-titulo">Título</Label>
            <Input
              id="sdr-visita-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sdr-visita-obs">Briefing para o corretor</Label>
            <Textarea
              id="sdr-visita-obs"
              rows={3}
              value={descricao}
              placeholder="O que o cliente quer, o que já foi combinado, objeções…"
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={agendar.isPending} onClick={() => agendar.mutate()}>
            {agendar.isPending ? "Rodando a roleta…" : "Agendar e entregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
