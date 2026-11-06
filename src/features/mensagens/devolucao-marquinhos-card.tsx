// "Devolver ao Marquinhos" (migration 20261106120000): faixa da conversa com
// o estado da devolução e o botão que abre a escolha do objetivo. Usada pela
// Central de Mensagens e pela aba WhatsApp da ficha — o mesmo lugar onde o
// corretor lê a conversa com o cliente.
//
// O corretor escolhe UM objetivo (remarcar / documentos / dúvidas) e, se
// quiser, deixa um recado. O Marquinhos fala com o cliente no 4099 dizendo
// que é a pedido do corretor e, ao terminar, devolve com um resumo (nota na
// ficha + push). Enquanto ele atende, "Retomar atendimento" para o robô.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowUUpLeft, Robot, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { formatRelativeTime } from "@/lib/interacoes";
import {
  devolverAoMarquinhos,
  retomarAtendimentoMarquinhos,
} from "@/lib/marquinhos-devolucao.functions";
import { cn } from "@/lib/utils";
import {
  definicaoObjetivo,
  devolucaoAtiva,
  mensagemErroDevolucao,
  OBJETIVOS_DEVOLUCAO,
  OBSERVACAO_MAX,
  primeiroNome,
  resumoEstado,
  type ObjetivoDevolucao,
} from "./devolucao-marquinhos";
import { ultimaDevolucaoDoLead } from "./mensagens-client";

/** Encerrada há até 3 dias ainda aparece (o resumo do robô interessa). */
const MOSTRAR_ENCERRADA_MS = 3 * 24 * 60 * 60 * 1000;

export function DevolucaoMarquinhosFaixa({
  leadId,
  clienteNome,
  className,
}: {
  leadId: string;
  clienteNome: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const chave = ["marquinhos-devolucao", leadId];

  const q = useQuery({
    queryKey: chave,
    queryFn: () => ultimaDevolucaoDoLead(leadId),
    staleTime: 15_000,
  });
  useRealtimeInvalidate("marquinhos_devolucoes", [chave], { filter: `lead_id=eq.${leadId}` });

  const retomarFn = useServerFn(retomarAtendimentoMarquinhos);
  const retomar = useMutation({
    mutationFn: (devolucaoId: string) => retomarFn({ data: { devolucaoId } }),
    onSuccess: (r) => {
      toast.success(
        r.status === "cancelada"
          ? "Pronto: o atendimento voltou para você."
          : "Avisando o Marquinhos para parar. O atendimento volta para você em instantes.",
      );
      void qc.invalidateQueries({ queryKey: chave });
    },
    onError: (e) => toast.error(mensagemErroDevolucao(e)),
  });

  // Sem a migration (ou com erro de leitura) a faixa some: a conversa segue.
  if (!q.data?.disponivel) return null;
  const d = q.data.devolucao;
  const ativa = devolucaoAtiva(d);
  const encerradaRecente =
    !!d &&
    !ativa &&
    !!d.encerrado_em &&
    Date.now() - Date.parse(d.encerrado_em) < MOSTRAR_ENCERRADA_MS;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2 text-xs",
        ativa ? "bg-primary/5" : "bg-card",
        className,
      )}
    >
      {d && (ativa || encerradaRecente) ? (
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-medium">
            <Robot className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{resumoEstado(d)}</span>
          </p>
          {d.resultado && !ativa && (
            <p className="mt-0.5 line-clamp-2 text-muted-foreground">{d.resultado}</p>
          )}
          {ativa && d.ultimo_erro && (
            <p className="mt-0.5 flex items-center gap-1 text-warning">
              <Warning className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">Tentando de novo: {d.ultimo_erro}</span>
            </p>
          )}
          {ativa && !d.ultimo_erro && (
            <p className="mt-0.5 text-muted-foreground">
              Pedido {formatRelativeTime(d.criado_em)}. O resumo chega na ficha e no seu celular.
            </p>
          )}
        </div>
      ) : (
        <p className="min-w-0 flex-1 text-muted-foreground">
          O Marquinhos pode remarcar, recolher documentos ou tirar dúvidas por você no 4099.
        </p>
      )}

      {ativa && d ? (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={retomar.isPending || d.envio_pendente === "retomar"}
          onClick={() => retomar.mutate(d.id)}
          title="Para o Marquinhos e traz o atendimento de volta para você"
        >
          <ArrowUUpLeft className="h-4 w-4" /> Retomar atendimento
        </Button>
      ) : (
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setAberto(true)}>
          <Robot className="h-4 w-4" /> Devolver ao Marquinhos
        </Button>
      )}

      <DevolverDialog
        aberto={aberto}
        onAberto={setAberto}
        leadId={leadId}
        clienteNome={clienteNome}
        onDevolvido={() => void qc.invalidateQueries({ queryKey: chave })}
      />
    </div>
  );
}

function DevolverDialog({
  aberto,
  onAberto,
  leadId,
  clienteNome,
  onDevolvido,
}: {
  aberto: boolean;
  onAberto: (v: boolean) => void;
  leadId: string;
  clienteNome: string;
  onDevolvido: () => void;
}) {
  const [objetivo, setObjetivo] = useState<ObjetivoDevolucao | null>(null);
  const [recado, setRecado] = useState("");
  const cliente = primeiroNome(clienteNome, "o cliente");
  const devolverFn = useServerFn(devolverAoMarquinhos);

  const devolver = useMutation({
    mutationFn: () => {
      if (!objetivo) throw new Error("Escolha o objetivo da devolução.");
      return devolverFn({ data: { leadId, objetivo, observacao: recado } });
    },
    onSuccess: (r) => {
      toast.success(
        r.enviadoAgora
          ? `${cliente} voltou para o Marquinhos.`
          : `Pedido registrado: o Marquinhos assume ${cliente} assim que o envio sair.`,
      );
      setObjetivo(null);
      setRecado("");
      onAberto(false);
      onDevolvido();
    },
    onError: (e) => toast.error(mensagemErroDevolucao(e)),
  });

  const def = objetivo ? definicaoObjetivo(objetivo) : null;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !devolver.isPending && onAberto(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Devolver {cliente} ao Marquinhos</DialogTitle>
          <DialogDescription>
            O Marquinhos fala com {cliente} pelo 4099, dizendo que é a seu pedido e que você
            continua sendo o consultor. Quando terminar, ele devolve com um resumo.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={objetivo ?? ""}
          onValueChange={(v) => setObjetivo(v as ObjetivoDevolucao)}
          aria-label="Objetivo da devolução"
          className="gap-2"
        >
          {OBJETIVOS_DEVOLUCAO.map((o) => {
            const item = definicaoObjetivo(o);
            const id = `devolucao-${o}`;
            return (
              <Label
                key={o}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-accent/50",
                  objetivo === o && "border-primary bg-primary/5",
                )}
              >
                <RadioGroupItem value={o} id={id} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-semibold">{item.rotulo}</span>
                  <span className="block text-xs text-muted-foreground">{item.oQueFaz}</span>
                </span>
              </Label>
            );
          })}
        </RadioGroup>

        <div className="space-y-1.5">
          <Label htmlFor="devolucao-recado" className="text-sm">
            Recado para o Marquinhos{" "}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Textarea
            id="devolucao-recado"
            value={recado}
            onChange={(e) => setRecado(e.target.value.slice(0, OBSERVACAO_MAX))}
            placeholder={
              def?.exemploRecado ?? "O que ele precisa saber antes de falar com o cliente"
            }
            rows={3}
          />
          <p className="text-right text-[11px] text-muted-foreground tabular-nums">
            {recado.length}/{OBSERVACAO_MAX}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onAberto(false)} disabled={devolver.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => devolver.mutate()} disabled={!objetivo || devolver.isPending}>
            <Robot className="h-4 w-4" />{" "}
            {devolver.isPending ? "Devolvendo…" : "Devolver ao Marquinhos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
