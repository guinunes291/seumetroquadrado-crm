// Card de decisão da análise de crédito (item 3.1): no lead em
// analise_credito, o corretor/gestor APROVA ou REPROVA (com motivo) sem
// sair da tela — e cada desfecho já oferece o próximo passo do fluxo:
// aprovada → registrar a venda; reprovada → nova análise (outro banco /
// docs novos) ou perda. É a resposta operacional ao "quantos negócios
// estão liberados?" da auditoria.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, BadgeX, FileSearch, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ANALISE_STATUS_LABEL,
  decidirAnalise,
  fetchAnaliseAtual,
  type AnaliseResultado,
  type AnaliseStatus,
} from "@/features/leads/analise-credito";
import { formatRelativeTime } from "@/lib/interacoes";
import { cn } from "@/lib/utils";

type LeadMin = { id: string; nome: string; status: string };

export function AnaliseCreditoCard({
  lead,
  onRegistrarVenda,
  onNovaAnalise,
  onPerdido,
}: {
  lead: LeadMin;
  /** Abre o modal de venda (aprovada → fechar). */
  onRegistrarVenda?: () => void;
  /** Reabre o modal de análise (reprovada → outro banco/docs novos). */
  onNovaAnalise?: () => void;
  /** Abre o fluxo de perda existente. */
  onPerdido?: () => void;
}) {
  const qc = useQueryClient();
  const [reprovarOpen, setReprovarOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  const analiseQ = useQuery({
    queryKey: ["analise-credito", lead.id],
    staleTime: 15_000,
    queryFn: () => fetchAnaliseAtual(lead.id),
  });

  const decidir = useMutation({
    mutationFn: (args: { resultado: AnaliseResultado; motivo?: string }) =>
      decidirAnalise({ leadId: lead.id, leadNome: lead.nome, ...args }),
    onSuccess: (_r, args) => {
      toast.success(
        args.resultado === "aprovada"
          ? "Análise aprovada — negócio liberado para fechamento."
          : "Análise reprovada registrada.",
      );
      setReprovarOpen(false);
      setMotivo("");
      void qc.invalidateQueries({ queryKey: ["analise-credito", lead.id] });
      void qc.invalidateQueries({ queryKey: ["lead-detail:interacoes", lead.id] });
      void qc.invalidateQueries({ queryKey: ["dash:kpis"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (lead.status !== "analise_credito") return null;

  const analise = analiseQ.data;
  const status = (analise?.status ?? "enviada") as AnaliseStatus;
  const decidida = status === "aprovada" || status === "reprovada";
  const label = ANALISE_STATUS_LABEL[status] ?? analise?.status ?? "Em análise";

  return (
    <Card
      className={cn(
        status === "aprovada" && "border-success/50",
        status === "reprovada" && "border-destructive/50",
        !decidida && "border-info/40",
      )}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <FileSearch className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Análise de crédito</span>
          {analiseQ.isLoading ? (
            <Skeleton className="h-5 w-24" />
          ) : (
            <Badge
              variant="secondary"
              className={cn(
                status === "aprovada" && "bg-success/15 text-success",
                status === "reprovada" && "bg-destructive/15 text-destructive",
              )}
            >
              {label}
            </Badge>
          )}
          {analise && (
            <span className="text-xs text-muted-foreground">
              {decidida ? "decidida" : "registrada"} {formatRelativeTime(analise.updated_at)}
            </span>
          )}
          {!analise && !analiseQ.isLoading && (
            <span className="text-xs text-muted-foreground">
              sem registro — decida aqui mesmo (vale para análises antigas)
            </span>
          )}
        </div>

        {analise?.observacoes && (
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">{analise.observacoes}</p>
        )}

        {/* A decisão OU o próximo passo — nunca os dois ao mesmo tempo. */}
        {!decidida ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-success text-success-foreground hover:bg-success/90"
              disabled={decidir.isPending}
              onClick={() => decidir.mutate({ resultado: "aprovada" })}
            >
              <BadgeCheck className="h-4 w-4" /> Aprovar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={decidir.isPending}
              onClick={() => setReprovarOpen(true)}
            >
              <BadgeX className="h-4 w-4" /> Reprovar
            </Button>
          </div>
        ) : status === "aprovada" ? (
          onRegistrarVenda && (
            <Button size="sm" onClick={onRegistrarVenda}>
              Registrar venda
            </Button>
          )
        ) : (
          <div className="flex flex-wrap gap-2">
            {onNovaAnalise && (
              <Button size="sm" variant="outline" onClick={onNovaAnalise}>
                <RotateCcw className="h-4 w-4" /> Nova análise
              </Button>
            )}
            {onPerdido && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={onPerdido}
              >
                Marcar como perdido
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={reprovarOpen} onOpenChange={setReprovarOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reprovar análise — {lead.nome}</DialogTitle>
            <DialogDescription>
              O motivo fica na análise e na timeline — é o que orienta a próxima tentativa (outro
              banco, renda composta, docs novos).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Motivo da reprovação</Label>
            <Textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: restrição no CPF do cônjuge; renda insuficiente para a faixa…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReprovarOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={decidir.isPending}
              onClick={() => decidir.mutate({ resultado: "reprovada", motivo })}
            >
              {decidir.isPending ? "Salvando…" : "Reprovar análise"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
