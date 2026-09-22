// Tela da reativação — SDR (e gestão, para acompanhar).
//
// Duas listas, vindas separadas do banco: acionáveis e em descanso. Quem está
// em descanso é somente leitura, com a data em que fica elegível. Não há botão
// de antecipar: a janela existe porque o cliente acabou de receber a mensagem
// dizendo que o atendimento foi encerrado, e ligar no dia seguinte é bloqueio
// e denúncia do número no discador — que derruba junto SDR, atendimento e
// oferta ativa.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowCounterClockwise, Moon, PhoneSlash } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchFilaReativacao,
  marcarReativado,
  marcarSemRetorno,
  resumoHorarios,
  type ItemReativacao,
} from "@/features/cadencia/reativacao-client";

const dataHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
};

export function ReativacaoView() {
  const qc = useQueryClient();
  const [reativando, setReativando] = useState<ItemReativacao | null>(null);

  const fila = useQuery({ queryKey: ["reativacao:fila"], queryFn: fetchFilaReativacao });
  const invalidar = () => void qc.invalidateQueries({ queryKey: ["reativacao:fila"] });

  const semRetorno = useMutation({
    mutationFn: (id: string) => marcarSemRetorno(id),
    onSuccess: () => {
      toast.success("Sem retorno registrado — o lead foi arquivado.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (fila.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Carregando a fila">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (fila.isError) {
    return <QueryErrorState error={fila.error as Error} onRetry={() => void fila.refetch()} />;
  }

  const { acionaveis, em_descanso: descanso } = fila.data!;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowCounterClockwise size={18} weight="duotone" /> Para trabalhar hoje
          </CardTitle>
          <CardDescription>
            Maior renda primeiro. As faixas de horário já gastas aparecem na linha — tente uma que
            ainda não foi tentada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {acionaveis.length === 0 ? (
            <EmptyState
              icon={ArrowCounterClockwise}
              title="Nada elegível agora"
              description="Quem cumpriu a cadência entra aqui quando a janela de descanso termina."
            />
          ) : (
            <ul className="space-y-3">
              {acionaveis.map((item) => (
                <li key={item.id}>
                  <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{item.nome}</span>
                        <Badge variant="outline">prioridade {item.prioridade}</Badge>
                        {item.tentativas_reativacao > 0 && (
                          <Badge variant="secondary">
                            {item.tentativas_reativacao} tentativa
                            {item.tentativas_reativacao > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.empreendimento ?? "Sem empreendimento"}
                        {item.faixa_renda ? ` · ${item.faixa_renda}` : ""} · na fila desde{" "}
                        {dataHora(item.entrou_em)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Horários já tentados: {resumoHorarios(item.horarios_tentados)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button size="sm" onClick={() => setReativando(item)}>
                        <ArrowCounterClockwise size={16} weight="bold" /> Reativado
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={semRetorno.isPending}
                        onClick={() => semRetorno.mutate(item.id)}
                      >
                        <PhoneSlash size={16} weight="bold" /> Sem retorno
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon size={18} weight="duotone" /> Em descanso
          </CardTitle>
          <CardDescription>
            Somente leitura. Cada um volta a ficar disponível na data indicada — não dá para
            antecipar, e é de propósito.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {descanso.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém em descanso no momento.</p>
          ) : (
            <ul className="divide-y">
              {descanso.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="truncate">
                    {d.nome}
                    <span className="ml-2 text-sm text-muted-foreground">
                      {d.empreendimento ?? "Sem empreendimento"}
                    </span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    elegível em {dataHora(d.elegivel_em)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <DialogReativado
        item={reativando}
        onClose={() => setReativando(null)}
        onSalvo={() => {
          setReativando(null);
          invalidar();
        }}
      />
    </div>
  );
}

function DialogReativado({
  item,
  onClose,
  onSalvo,
}: {
  item: ItemReativacao | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [notas, setNotas] = useState("");

  const salvar = useMutation({
    mutationFn: () => {
      if (!item) throw new Error("sem linha");
      return marcarReativado(item.id, notas);
    },
    onSuccess: () => {
      toast.success("Lead reativado — volta para a roleta da campanha.");
      setNotas("");
      onSalvo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={Boolean(item)} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar como reativado</DialogTitle>
          <DialogDescription>
            O lead volta para a roleta da campanha — não para o corretor anterior. A sua anotação
            aparece para quem receber.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reativacao-notas">O que o cliente disse</Label>
          <Input
            id="reativacao-notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ex.: quer visitar no sábado de manhã, prefere ligação à noite"
            maxLength={500}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate()}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
