// "Pediu retorno" e "Esfriou": os dois desfechos de Em atendimento que levam
// o lead para Aguardando retorno com a data que o cliente pediu (regra dos
// 65, decisões 7 e 9). Até 30 dias, Aguardando retorno; além disso, a perda
// "retorno futuro", que a reativação recicla — menos o lead próprio, que fica.
// O banco decide (registrar_retorno_lead); aqui se mostra antes o que vai
// acontecer, para o corretor não descobrir depois que "perdeu" o cliente.
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import type { StageLead } from "@/lib/leads";
import {
  DESFECHO_RETORNO_LABEL,
  DIAS_SUGERIDOS,
  dataCurta,
  deInputData,
  destinoDoRetorno,
  paraInputData,
  type DesfechoRetorno,
} from "@/lib/em-atendimento";
import {
  invalidarEmAtendimento,
  registrarRetorno,
  useEmAtendimentoContador,
} from "./use-em-atendimento";

type Props = {
  lead: StageLead;
  tipo: DesfechoRetorno;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

const DIA = 86_400_000;

export function RetornoDialog({ lead, tipo, onOpenChange, onDone }: Props) {
  const qc = useQueryClient();
  const contador = useEmAtendimentoContador();
  const maxDias = contador.data?.retorno_max_dias ?? 30;
  const agora = useMemo(() => new Date(), []);
  const [data, setData] = useState(() =>
    paraInputData(new Date(agora.getTime() + DIAS_SUGERIDOS[tipo] * DIA)),
  );
  const [nota, setNota] = useState("");

  const escolhida = deInputData(data);
  const valida = !!escolhida && escolhida.getTime() > agora.getTime();
  // O lead próprio não se sabe daqui (StageLead não traz origem): o aviso
  // diz as duas coisas, e o banco decide.
  const destino = escolhida && valida ? destinoDoRetorno(escolhida, agora, maxDias, null) : null;

  const mut = useMutation({
    mutationFn: async () => {
      if (!escolhida || !valida) throw new Error("Escolha uma data futura");
      return registrarRetorno({ leadId: lead.id, tipo, data: escolhida, nota });
    },
    onSuccess: (r) => {
      const quando = dataCurta(r.retorno_em);
      if (r.destino === "perdido") {
        toast.success(
          `Retorno futuro registrado: ${lead.nome} volta pela reativação perto de ${quando}.`,
        );
      } else if (r.proprio && destino === "retorno_futuro") {
        toast.success(`Lead próprio: ${lead.nome} fica com você, com retorno em ${quando}.`);
      } else {
        toast.success(`Retorno de ${lead.nome} marcado para ${quando}.`);
      }
      invalidarEmAtendimento(qc);
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["interacoes", lead.id] });
      onDone?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {DESFECHO_RETORNO_LABEL[tipo]} — {lead.nome}
          </DialogTitle>
          <DialogDescription>
            {tipo === "esfriou"
              ? "O lead sai de Em atendimento, vira frio e vai para Aguardando retorno com a data para retomar o contato."
              : "O lead sai de Em atendimento e vai para Aguardando retorno com a data que o cliente pediu."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="retorno-data">Retornar em *</Label>
            <Input
              id="retorno-data"
              type="date"
              value={data}
              min={paraInputData(new Date(agora.getTime() + DIA))}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          {destino === "retorno_futuro" && (
            <p className="text-xs text-warning" data-testid="retorno-aviso-futuro">
              Mais de {maxDias} dias: vira perda "Retorno futuro" e volta pela reativação perto da
              data. Lead próprio (indicação, captação, plantão) fica com você.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="retorno-nota">O que foi combinado (opcional)</Label>
            <Textarea
              id="retorno-nota"
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ex.: vai receber o FGTS em novembro"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !valida}>
            {mut.isPending ? "Salvando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
