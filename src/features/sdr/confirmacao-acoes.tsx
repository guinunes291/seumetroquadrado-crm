// A resposta do cliente na confirmação D-1/D-0 (decisão de 10/10/2026): cada
// resposta faz uma coisa diferente — e o corretor fica sabendo do que muda o
// dia dele. Antes, um botão "Confirmado" fechava a tarefa qualquer que fosse a
// resposta.
//   Confirmou       → a visita fica "confirmada" (o corretor vê).
//   Pediu remarcar  → novo horário agora, com o mesmo corretor; D-1/D-0 novas.
//   Não atendeu     → o corretor é avisado de que a visita não está confirmada.

import { useState } from "react";
import { toast } from "sonner";
import { CalendarX, CheckCircle, PhoneSlash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { quandoDaVisita } from "@/features/visitas/visita-derive";
import { EscolhaHorario, amanhaAsDez } from "./escolha-horario";
import { useRegistrarConfirmacao, type ResultadoConfirmacao } from "./painel-client";

type Visita = {
  agendamento_id: string;
  nome: string;
  data_inicio: string;
  corretor_nome: string | null;
};

const SUCESSO: Record<ResultadoConfirmacao, string> = {
  confirmou: "Visita confirmada",
  remarcar: "Visita remarcada",
  nao_atendeu: "Registrado: não atendeu",
};

export function ConfirmacaoAcoes({ visita }: { visita: Visita }) {
  const registrar = useRegistrarConfirmacao();
  const [remarcando, setRemarcando] = useState(false);
  const [novo, setNovo] = useState(amanhaAsDez);
  const corretor = visita.corretor_nome ?? "o corretor";

  const enviar = (resultado: ResultadoConfirmacao, novoInicio?: string) =>
    registrar.mutate(
      { agendamentoId: visita.agendamento_id, resultado, novoInicio },
      {
        onSuccess: (r) => {
          toast.success(SUCESSO[resultado], {
            description:
              resultado === "remarcar"
                ? `${visita.nome}: ${quandoDaVisita(r.data_inicio)} com ${corretor}, que já foi avisado.`
                : resultado === "nao_atendeu"
                  ? `${corretor} foi avisado de que a visita ainda não está confirmada.`
                  : `${visita.nome} · ${corretor} vê a visita confirmada.`,
          });
          setRemarcando(false);
        },
        onError: (e: Error) =>
          toast.error("Não foi possível registrar", { description: e.message }),
      },
    );

  return (
    <>
      {/* No celular, três colunas iguais numa linha só (sem os ícones). */}
      <div
        className="grid w-full grid-cols-3 gap-1.5 sm:flex sm:w-auto"
        role="group"
        aria-label={`Confirmação de ${visita.nome}`}
      >
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={registrar.isPending}
          onClick={() => enviar("confirmou")}
        >
          <CheckCircle className="mr-1 hidden h-3.5 w-3.5 sm:inline" weight="fill" /> Confirmou
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={registrar.isPending}
          onClick={() => setRemarcando(true)}
        >
          <CalendarX className="mr-1 hidden h-3.5 w-3.5 sm:inline" /> Remarcar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={registrar.isPending}
          onClick={() => enviar("nao_atendeu")}
        >
          <PhoneSlash className="mr-1 hidden h-3.5 w-3.5 sm:inline" /> Não atendeu
        </Button>
      </div>

      {remarcando && (
        <Dialog open onOpenChange={setRemarcando}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">Remarcar · {visita.nome}</DialogTitle>
              <DialogDescription>
                Era {quandoDaVisita(visita.data_inicio).toLowerCase()}. A visita continua com{" "}
                {corretor}, que é avisado do horário novo; você confirma de novo no D-1 e no dia.
              </DialogDescription>
            </DialogHeader>
            <EscolhaHorario value={novo} onChange={setNovo} idPrefixo="remarcar" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemarcando(false)}>
                Cancelar
              </Button>
              <Button
                disabled={registrar.isPending}
                onClick={() => {
                  const d = new Date(novo);
                  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
                    toast.error("Escolha um horário no futuro.");
                    return;
                  }
                  enviar("remarcar", d.toISOString());
                }}
              >
                Remarcar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
