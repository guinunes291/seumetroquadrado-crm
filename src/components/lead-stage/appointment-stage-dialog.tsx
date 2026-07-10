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
import { criarAgendamento, invalidateAgendamentoQueries } from "@/lib/agendamentos";
import { buildGoogleCalendarUrl } from "@/lib/calendar-links";
import { syncAgendamentoGoogle } from "@/lib/google-calendar.functions";

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

  // Seleção rápida de dia + horário (os horários de visita variam muito, então
  // combinamos um chip de dia com um horário comum em vez de presets fixos).
  const diaAtual = dataInicio.slice(0, 10);
  const horaAtual = dataInicio.slice(11, 16);
  const COMMON_TIMES = Array.from({ length: 23 }, (_, i) => {
    const m = 8 * 60 + i * 30; // 08:00 → 19:00 a cada 30min
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  });
  const offsetDateStr = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return toLocal(d).slice(0, 10);
  };
  const setDia = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const [hh, mm] = (horaAtual || "09:00").split(":").map(Number);
    d.setHours(hh, mm, 0, 0);
    setDataInicio(toLocal(d));
    setDataFim(toLocal(new Date(d.getTime() + 60 * 60 * 1000)));
  };
  const setHora = (hhmm: string) => {
    const base = new Date(`${diaAtual}T${hhmm}`);
    setDataInicio(toLocal(base));
    setDataFim(toLocal(new Date(base.getTime() + 60 * 60 * 1000)));
  };
  const DIAS = [
    { label: "Hoje", offset: 0 },
    { label: "Amanhã", offset: 1 },
    { label: "+2 dias", offset: 2 },
  ];
  const [descricao, setDescricao] = useState(
    [lead.projeto_nome ? `Projeto: ${lead.projeto_nome}` : "", lead.observacoes ?? ""]
      .filter(Boolean)
      .join("\n"),
  );

  const mut = useMutation({
    mutationFn: async () => {
      const inicio = new Date(dataInicio);
      const fim = dataFim ? new Date(dataFim) : new Date(inicio.getTime() + 60 * 60 * 1000);

      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;

      // Helper único: insere o agendamento e move o lead com compensação
      // (se o update do lead falhar, desfaz o agendamento), + follow-up.
      const res = await criarAgendamento(
        {
          leadId: lead.id,
          leadNome: lead.nome,
          corretorId: lead.corretor_id ?? uid,
          criadoPorId: uid,
          tipo,
          titulo,
          descricao,
          local,
          dataInicio: inicio.toISOString(),
          dataFim: fim.toISOString(),
        },
        { moverLeadPara: "agendado", criarFollowUp: true },
      );

      // Espelha na agenda Google do corretor (se conectada) sem travar o fluxo.
      syncAgendamentoGoogle({ data: { agendamentoId: res.agendamentoId } }).catch(() => {});
      return res;
    },
    onSuccess: (res) => {
      const gcalUrl = buildGoogleCalendarUrl({
        titulo: titulo.trim() || `Visita - ${lead.nome}`,
        inicio: new Date(dataInicio),
        fim: dataFim ? new Date(dataFim) : undefined,
        local: local.trim() || null,
        descricao: [`Lead: ${lead.nome}`, descricao.trim() || null].filter(Boolean).join("\n"),
      });
      toast.success(
        "Agendamento criado · lead movido para Agendado" +
          (res?.followUpCriado ? " · tarefa de confirmação criada" : ""),
        {
          action: {
            label: "Google Agenda",
            onClick: () => window.open(gcalUrl, "_blank", "noopener"),
          },
          duration: 8000,
        },
      );
      res.avisos.forEach((a) => toast.warning(a));
      invalidateAgendamentoQueries(qc, lead.id);
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
              <Label>Dia</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map((d) => (
                  <Button
                    key={d.offset}
                    type="button"
                    size="sm"
                    variant={diaAtual === offsetDateStr(d.offset) ? "default" : "outline"}
                    className="h-8"
                    onClick={() => setDia(d.offset)}
                  >
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Horário</Label>
              <Select
                value={COMMON_TIMES.includes(horaAtual) ? horaAtual : ""}
                onValueChange={setHora}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o horário" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {COMMON_TIMES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
