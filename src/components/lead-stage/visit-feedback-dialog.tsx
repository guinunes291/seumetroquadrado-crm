import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StageLead } from "@/lib/leads";
import { criarFollowUpAutomatico } from "@/lib/follow-up";

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

type Agendamento = {
  id: string;
  titulo: string;
  data_inicio: string;
  status: string;
};

/** Agendamentos de visita do lead que ainda esperam validação. */
const AGUARDANDO_VALIDACAO = ["agendado", "confirmado", "remarcado"] as const;

type Props = {
  lead: StageLead;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

/**
 * Modal de "Visita realizada".
 *
 * A visita é validada POR AGENDAMENTO, não por lead: um cliente que remarcou
 * três vezes tem três agendamentos, e cada um é validado (ou marcado como não
 * compareceu) separadamente. É isso que faz a métrica cair no dia em que a
 * visita realmente aconteceu — `agendamentos.data_inicio` — em vez do dia em
 * que o corretor lembrou de registrar.
 *
 * Quando o lead não tem agendamento aberto, o corretor informa a data em que a
 * visita ocorreu e o agendamento é criado já validado — nenhuma visita fica
 * sem data própria.
 */
export function VisitFeedbackDialog({ lead, onOpenChange, onDone }: Props) {
  const qc = useQueryClient();
  const [agendamentoId, setAgendamentoId] = useState<string>("");
  const [dataVisita, setDataVisita] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  );
  const [resultado, setResultado] = useState<(typeof RESULTADO_OPTIONS)[number]>("interesse_medio");
  const [observacoes, setObservacoes] = useState("");

  const agendaQ = useQuery({
    queryKey: ["visita-validar", lead.id],
    queryFn: async (): Promise<Agendamento[]> => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, titulo, data_inicio, status")
        .eq("lead_id", lead.id)
        .eq("tipo", "visita")
        .is("deleted_at", null)
        .in("status", AGUARDANDO_VALIDACAO)
        .order("data_inicio", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Agendamento[];
    },
  });

  // Pré-seleciona a visita mais recente pendente de validação; sem nenhuma,
  // cai no modo "visita sem agendamento" com a data informada pelo corretor.
  useEffect(() => {
    if (!agendamentoId && agendaQ.data && agendaQ.data.length > 0) {
      setAgendamentoId(agendaQ.data[0].id);
    }
  }, [agendaQ.data, agendamentoId]);

  const semAgendamento = !agendamentoId || agendamentoId === "sem_agendamento";

  const mut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;

      let alvo = agendamentoId;

      if (semAgendamento) {
        const inicio = new Date(dataVisita);
        if (Number.isNaN(inicio.getTime()))
          throw new Error("Informe a data em que a visita ocorreu");
        if (inicio.getTime() > Date.now()) {
          throw new Error("A visita não pode ter acontecido no futuro");
        }
        const { data: criado, error: agErr } = await supabase
          .from("agendamentos")
          .insert({
            lead_id: lead.id,
            corretor_id: lead.corretor_id ?? uid,
            titulo: `Visita — ${lead.nome}`,
            tipo: "visita",
            status: "agendado",
            data_inicio: inicio.toISOString(),
            data_fim: new Date(inicio.getTime() + 60 * 60 * 1000).toISOString(),
            // Registro criado só para DATAR uma visita que já aconteceu: conta
            // como visita realizada, nunca como "agendamento criado" (régua
            // de datas 20260731121000) — sem isto rendia 100 pts de agenda.
            auto_gerado: true,
          } as never)
          .select("id")
          .single();
        if (agErr) throw agErr;
        alvo = (criado as { id: string }).id;
      }

      // A RPC valida o agendamento, registra a visita na timeline do lead e
      // move o status — tudo numa transação só.
      const { error } = await supabase.rpc("validar_visita", {
        _agendamento_id: alvo,
        _compareceu: true,
        _resultado: RESULTADO_LABEL[resultado],
        _observacoes: observacoes.trim() || null,
      } as never);
      if (error) throw error;

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
      qc.invalidateQueries({ queryKey: ["agendamentos"] });
      qc.invalidateQueries({ queryKey: ["visita-validar", lead.id] });
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
            A visita conta no dia em que aconteceu. Valide qual agendamento foi realizado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Qual visita foi realizada?</Label>
            {agendaQ.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={agendamentoId} onValueChange={setAgendamentoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o agendamento" />
                </SelectTrigger>
                <SelectContent>
                  {(agendaQ.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {format(parseISO(a.data_inicio), "dd/MM/yyyy HH:mm", { locale: ptBR })} ·{" "}
                      {a.titulo}
                    </SelectItem>
                  ))}
                  <SelectItem value="sem_agendamento">Visita sem agendamento</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {semAgendamento && (
            <div className="space-y-1.5">
              <Label>Quando a visita aconteceu</Label>
              <Input
                type="datetime-local"
                value={dataVisita}
                onChange={(e) => setDataVisita(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                É esta data que vai para o relatório — não a data de hoje.
              </p>
            </div>
          )}

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
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || agendaQ.isLoading}>
            {mut.isPending ? "Salvando…" : "Registrar visita"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
