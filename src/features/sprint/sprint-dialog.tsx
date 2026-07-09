import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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
import { toast } from "sonner";
import { scoreLead } from "@/lib/priority";
import { useSprint, type SprintState } from "@/features/sprint/use-sprint";
import { Zap, Trophy, MessageCircle, CheckCircle2 } from "lucide-react";

/**
 * Diálogo de INÍCIO do sprint: escolhe duração e meta; a fila é montada na
 * hora com os top-20 leads por score (snapshot — não muda durante o sprint).
 */
export function SprintStartDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { user } = useAuth();
  const { start } = useSprint();
  const [duracao, setDuracao] = useState<30 | 60 | 90>(30);
  const [meta, setMeta] = useState(10);

  const iniciar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, status, temperatura, ultima_interacao")
        .eq("corretor_id", user!.id)
        .eq("na_lixeira", false)
        .not("status", "in", "(perdido,contrato_fechado,pos_venda)")
        .limit(300);
      if (error) throw error;
      const fila = (data ?? [])
        .map((l) => ({
          ...l,
          _score: scoreLead({
            temperatura: l.temperatura,
            status: l.status,
            ultimaInteracao: l.ultima_interacao,
          }).score,
        }))
        .sort((a, b) => b._score - a._score)
        .slice(0, 20)
        .map((l) => ({ id: l.id, nome: l.nome, telefone: l.telefone }));
      if (fila.length === 0) throw new Error("Sem leads ativos para montar a fila do sprint.");
      return fila;
    },
    onSuccess: (fila) => {
      start(fila, duracao, meta);
      onOpenChange(false);
      toast.success(`Sprint de ${duracao}min iniciado — ${fila.length} leads na fila. 🔥`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" /> Iniciar Sprint
          </DialogTitle>
          <DialogDescription>
            Um bloco de prospecção focada: fila automática com seus leads mais prioritários,
            cronômetro e resultado no final.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="mb-2 block">Duração</Label>
            <div className="grid grid-cols-3 gap-2">
              {([30, 60, 90] as const).map((d) => (
                <Button
                  key={d}
                  type="button"
                  variant={duracao === d ? "default" : "outline"}
                  onClick={() => setDuracao(d)}
                  className="font-display tabular-nums"
                >
                  {d} min
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="sprint-meta">Meta de contatos</Label>
            <Input
              id="sprint-meta"
              type="number"
              min={1}
              max={50}
              value={meta}
              onChange={(e) => setMeta(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-28 font-display tabular-nums"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => iniciar.mutate()}
            disabled={iniciar.isPending}
            className="bg-gradient-gold text-navy-900 shadow-glow-gold hover:opacity-90"
          >
            <Zap className="h-4 w-4" /> Começar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Diálogo de RESULTADO: mede o que aconteceu durante a janela do sprint
 * consultando as interações e tarefas concluídas do período (dados reais,
 * não contadores do cliente).
 */
export function SprintResultDialog({
  sprint,
  onClose,
}: {
  sprint: SprintState;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const desde = new Date(sprint.startedAt).toISOString();

  const resultado = useQuery({
    queryKey: ["sprint:resultado", sprint.startedAt],
    queryFn: async () => {
      const [interacoesR, tarefasR] = await Promise.all([
        supabase
          .from("interacoes")
          .select("id", { count: "exact", head: true })
          .eq("autor_id", user!.id)
          .gte("ocorreu_em", desde),
        supabase
          .from("tarefas")
          .select("id", { count: "exact", head: true })
          .eq("corretor_id", user!.id)
          .eq("status", "concluida")
          .gte("data_conclusao", desde),
      ]);
      return {
        interacoes: interacoesR.count ?? 0,
        tarefas: tarefasR.count ?? 0,
      };
    },
  });

  const metaBatida = sprint.done.length >= sprint.goal;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" /> Sprint encerrado
          </DialogTitle>
          <DialogDescription>
            {metaBatida
              ? "Meta batida — ritmo de campeão. 🏆"
              : "Ciclo fechado. O que conta é a constância — bora pro próximo."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 py-2 text-center">
          <div className="rounded-lg border p-3">
            <CheckCircle2 className="mx-auto h-5 w-5 text-success" />
            <div className="font-display mt-1 text-2xl font-bold tabular-nums">
              {sprint.done.length}
              <span className="text-sm font-normal text-muted-foreground">/{sprint.goal}</span>
            </div>
            <div className="text-xs text-muted-foreground">leads atacados</div>
          </div>
          <div className="rounded-lg border p-3">
            <MessageCircle className="mx-auto h-5 w-5 text-info" />
            <div className="font-display mt-1 text-2xl font-bold tabular-nums">
              {resultado.data?.interacoes ?? "…"}
            </div>
            <div className="text-xs text-muted-foreground">interações registradas</div>
          </div>
          <div className="rounded-lg border p-3">
            <Zap className="mx-auto h-5 w-5 text-warning" />
            <div className="font-display mt-1 text-2xl font-bold tabular-nums">
              {resultado.data?.tarefas ?? "…"}
            </div>
            <div className="text-xs text-muted-foreground">tarefas concluídas</div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
