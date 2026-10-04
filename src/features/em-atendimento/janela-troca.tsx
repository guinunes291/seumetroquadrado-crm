// A janela de troca "entra um, sai um" (regra dos 65, decisão 6). Abre quando
// o banco recusa a entrada em Em atendimento com o teto cheio (código EA065):
// sugere os 5 mais parados, o corretor escolhe quem libera a vaga e com qual
// desfecho, e a troca acontece numa transação só (trocar_vaga_em_atendimento).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  MOTIVO_PERDA_CATEGORIAS,
  MOTIVO_PERDA_LABEL,
  type MotivoPerdaCategoria,
} from "@/lib/leads";
import {
  DESFECHO_RETORNO_LABEL,
  DIAS_SUGERIDOS,
  deInputData,
  destinoDoRetorno,
  maisParados,
  paraInputData,
} from "@/lib/em-atendimento";
import {
  invalidarEmAtendimento,
  trocarVaga,
  useEmAtendimentoContador,
  useMeus65,
  type DesfechoTroca,
} from "./use-em-atendimento";

export type PedidoTroca = { id: string; nome?: string | null; onDone?: () => void };

type Props = {
  entra: PedidoTroca;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

const DIA = 86_400_000;

export function JanelaTroca({ entra, onOpenChange, onDone }: Props) {
  const qc = useQueryClient();
  const contador = useEmAtendimentoContador();
  const meus = useMeus65();
  // O nome de quem entra nem sempre vem com o pedido (a mutação de etapa só
  // tem o id): busca leve, só para a frase da janela.
  const nomeQ = useQuery({
    queryKey: ["lead-nome", entra.id],
    enabled: !entra.nome,
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("nome").eq("id", entra.id).maybeSingle();
      return (data as { nome?: string } | null)?.nome ?? null;
    },
  });
  const nomeEntra = entra.nome ?? nomeQ.data ?? "este lead";

  const candidatos = useMemo(() => maisParados(meus.data ?? [], 5), [meus.data]);
  const [sai, setSai] = useState<string | null>(null);
  const [desfecho, setDesfecho] = useState<DesfechoTroca>("pediu_retorno");
  const [data, setData] = useState(() =>
    paraInputData(new Date(Date.now() + DIAS_SUGERIDOS.pediu_retorno * DIA)),
  );
  const [categoria, setCategoria] = useState<MotivoPerdaCategoria | "">("");
  const [detalhe, setDetalhe] = useState("");

  const escolhida = deInputData(data);
  const maxDias = contador.data?.retorno_max_dias ?? 30;
  // O mesmo aviso do diálogo de retorno: acima do máximo, quem sai vira perda
  // "Retorno futuro" — o corretor precisa saber antes de trocar (revisão).
  const viraRetornoFuturo =
    desfecho !== "perdido" &&
    !!escolhida &&
    destinoDoRetorno(escolhida, new Date(), maxDias, null) === "retorno_futuro";
  const pronto =
    !!sai &&
    (desfecho === "perdido"
      ? categoria !== "" && (categoria !== "outro" || detalhe.trim().length > 0)
      : !!escolhida && escolhida.getTime() > Date.now());

  const mut = useMutation({
    mutationFn: async () => {
      if (!sai) throw new Error("Escolha quem libera a vaga");
      return trocarVaga({
        entra: entra.id,
        sai,
        desfecho,
        data: desfecho === "perdido" ? null : escolhida,
        categoria: desfecho === "perdido" ? categoria : null,
        detalhe,
      });
    },
    onSuccess: (r) => {
      const quemSaiu = candidatos.find((c) => c.lead_id === sai)?.nome ?? "o lead";
      const saida =
        r.saida?.categoria === "retorno_futuro"
          ? `${quemSaiu} virou Retorno futuro e volta pela reativação`
          : r.saida?.destino === "perdido"
            ? `${quemSaiu} foi marcado como perdido`
            : `${quemSaiu} foi para Aguardando retorno`;
      toast.success(`${nomeEntra} entrou em atendimento; ${saida}.`);
      invalidarEmAtendimento(qc);
      entra.onDone?.();
      onDone?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const teto = contador.data?.teto ?? 65;
  const ocupacao = contador.data?.em_atendimento ?? teto;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="janela-troca">
        <DialogHeader>
          <DialogTitle>
            Em atendimento lotado — {ocupacao}/{teto}
          </DialogTitle>
          <DialogDescription>
            Para pôr <strong>{nomeEntra}</strong> em atendimento, libere a vaga de um destes. Entra
            um, sai um. Sugestão: os {candidatos.length || 5} mais parados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {meus.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : candidatos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum lead em Em atendimento para liberar. Dê um desfecho a um deles pela ficha.
            </p>
          ) : (
            <ul className="space-y-1.5" role="radiogroup" aria-label="Quem libera a vaga">
              {candidatos.map((c) => {
                const ativo = sai === c.lead_id;
                return (
                  <li key={c.lead_id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      onClick={() => setSai(c.lead_id)}
                      data-testid="troca-candidato"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition",
                        ativo ? "border-primary bg-primary/5" : "hover:bg-muted",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.projeto_nome ?? "sem empreendimento"}
                          {c.escolhido ? " · escolhido" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {c.dias_sem_toque} {c.dias_sem_toque === 1 ? "dia" : "dias"} sem toque
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Desfecho de quem sai</Label>
              <Select value={desfecho} onValueChange={(v) => setDesfecho(v as DesfechoTroca)}>
                <SelectTrigger aria-label="Desfecho">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pediu_retorno">
                    {DESFECHO_RETORNO_LABEL.pediu_retorno}
                  </SelectItem>
                  <SelectItem value="esfriou">{DESFECHO_RETORNO_LABEL.esfriou}</SelectItem>
                  <SelectItem value="perdido">Perdido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {desfecho === "perdido" ? (
              <div className="space-y-1.5">
                <Label>Motivo da perda *</Label>
                <Select
                  value={categoria}
                  onValueChange={(v) => setCategoria(v as MotivoPerdaCategoria)}
                >
                  <SelectTrigger aria-label="Motivo da perda">
                    <SelectValue placeholder="Selecione…" />
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
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="troca-data">Retornar em *</Label>
                <Input
                  id="troca-data"
                  type="date"
                  value={data}
                  min={paraInputData(new Date(Date.now() + DIA))}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
            )}
          </div>
          {viraRetornoFuturo && (
            <p className="text-xs text-warning" data-testid="troca-aviso-futuro">
              Mais de {maxDias} dias: quem sai vira perda "Retorno futuro" e volta pela reativação
              perto da data. Lead próprio (indicação, captação, plantão) fica com você.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="troca-detalhe">
              {desfecho === "perdido" && categoria === "outro"
                ? "Descreva o motivo *"
                : "Observação (opcional)"}
            </Label>
            <Textarea
              id="troca-detalhe"
              rows={2}
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Agendou ou Mandou doc também liberam vaga: dê o desfecho pela ficha do lead.{" "}
            <Link to="/meus-65" className="underline" onClick={() => onOpenChange(false)}>
              Ver os meus {teto}
            </Link>
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !pronto}>
            {mut.isPending ? "Trocando…" : "Trocar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
