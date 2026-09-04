// Mini-registro da visita, direto da agenda do dia: três toques no caminho
// feliz (Realizada → como o cliente saiu → Registrar). Gaveta inferior no
// celular, diálogo no desktop. Guarda os MESMOS dados estruturados do Modo
// Visita (interesse, objeção, próxima etapa, próximo contato) — é isso que a
// operação cruza no fim do mês; o checklist completo continua no Modo Visita.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  INTERESSE_LABEL,
  INTERESSE_VISITA,
  OBJECAO_LABEL,
  OBJECAO_VISITA,
  type InteresseVisita,
  type ObjecaoVisita,
} from "@/features/visitas/resultado-visita";
import {
  registroVisitaInicial,
  validarRegistroVisita,
  type ErroRegistroVisita,
  type ItemAgendaDia,
  type RegistroVisita,
} from "./agenda-do-dia";

type Props = {
  item: ItemAgendaDia;
  /** Pré-seleciona o desfecho quando o corretor tocou "Não veio" na linha. */
  desfechoInicial?: "realizada" | "nao_compareceu";
  onOpenChange: (open: boolean) => void;
  onSubmit: (registro: RegistroVisita) => void;
  pending?: boolean;
};

const INTERESSE_CURTO: Record<InteresseVisita, string> = {
  alto: "Alto",
  medio: "Médio",
  baixo: "Baixo",
  sem_interesse: "Sem interesse",
};

function Campo({
  label,
  erro,
  hint,
  children,
}: {
  label: string;
  erro?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {erro ? (
        <p className="text-xs text-destructive" role="alert">
          {erro}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function ValidarVisitaSheet({
  item,
  desfechoInicial = "realizada",
  onOpenChange,
  onSubmit,
  pending,
}: Props) {
  const isMobile = useIsMobile();
  const [r, setR] = useState<RegistroVisita>(() => ({
    ...registroVisitaInicial(),
    compareceu: desfechoInicial === "realizada",
  }));
  const [erros, setErros] = useState<ErroRegistroVisita>({});
  const [tentou, setTentou] = useState(false);

  // Erros só depois da primeira tentativa — e recalculados a cada mudança.
  useEffect(() => {
    if (tentou) setErros(validarRegistroVisita(r));
  }, [r, tentou]);

  const patch = (p: Partial<RegistroVisita>) => setR((atual) => ({ ...atual, ...p }));

  const submit = () => {
    const e = validarRegistroVisita(r);
    setTentou(true);
    setErros(e);
    if (Object.keys(e).length > 0) return;
    onSubmit(r);
  };

  const quando = format(new Date(item.data_inicio), "EEEE, dd/MM 'às' HH:mm", { locale: ptBR });
  const titulo = item.lead?.nome ? `Visita · ${item.lead.nome}` : item.titulo;
  const descricao = `${quando}${item.local ? ` · ${item.local}` : ""}. A visita conta no dia em que aconteceu.`;

  const corpo = (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        variant="outline"
        value={r.compareceu ? "realizada" : "nao_compareceu"}
        onValueChange={(v) => {
          if (!v) return;
          patch({
            compareceu: v === "realizada",
            interesse: v === "realizada" ? r.interesse : "",
            objecao: v === "realizada" ? r.objecao : "",
          });
        }}
        className="grid grid-cols-2 gap-2"
        aria-label="Desfecho da visita"
      >
        <ToggleGroupItem value="realizada" className="min-h-11 data-[state=on]:border-success">
          Cliente compareceu
        </ToggleGroupItem>
        <ToggleGroupItem value="nao_compareceu" className="min-h-11 data-[state=on]:border-warning">
          Não compareceu
        </ToggleGroupItem>
      </ToggleGroup>

      {r.compareceu ? (
        <>
          <Campo label="Como o cliente saiu da visita?" erro={erros.interesse}>
            <ToggleGroup
              type="single"
              variant="outline"
              value={r.interesse}
              onValueChange={(v) => patch({ interesse: (v || "") as InteresseVisita | "" })}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {INTERESSE_VISITA.map((i) => (
                <ToggleGroupItem
                  key={i}
                  value={i}
                  title={INTERESSE_LABEL[i]}
                  className={cn("min-h-11", erros.interesse && "border-destructive/60")}
                >
                  {INTERESSE_CURTO[i]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Campo>

          <Campo label="O que trava a decisão? (opcional)">
            <Select
              value={r.objecao || "nenhuma"}
              onValueChange={(v) => patch({ objecao: v === "nenhuma" ? "" : (v as ObjecaoVisita) })}
            >
              <SelectTrigger className="min-h-11">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Não registrar agora</SelectItem>
                {OBJECAO_VISITA.map((o) => (
                  <SelectItem key={o} value={o}>
                    {OBJECAO_LABEL[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>

          <Campo label="Etapa do lead">
            <ToggleGroup
              type="single"
              variant="outline"
              value={r.proximaEtapa}
              onValueChange={(v) => {
                if (v === "visita_realizada" || v === "aguardando_retorno") {
                  patch({ proximaEtapa: v });
                }
              }}
              className="grid grid-cols-2 gap-2"
            >
              <ToggleGroupItem value="visita_realizada" className="min-h-11">
                Visita realizada
              </ToggleGroupItem>
              <ToggleGroupItem value="aguardando_retorno" className="min-h-11">
                Aguardando retorno
              </ToggleGroupItem>
            </ToggleGroup>
          </Campo>
        </>
      ) : (
        <Campo
          label="Remarcar para (opcional)"
          erro={erros.reagendarPara}
          hint="Cria o novo horário na mesma ação — o cliente sai daqui com data, não com intenção."
        >
          <Input
            type="datetime-local"
            className="min-h-11"
            value={r.reagendarPara}
            onChange={(e) => patch({ reagendarPara: e.target.value })}
          />
        </Campo>
      )}

      <Campo
        label={r.compareceu ? "Próximo contato" : "Próximo contato (obrigatório)"}
        erro={erros.proximoFollowup}
        hint={
          r.compareceu
            ? "Vira a tarefa de pós-visita, para o lead não esfriar."
            : "Cliente que não veio e não tem retorno marcado é lead perdido em câmera lenta."
        }
      >
        <Input
          type="datetime-local"
          className="min-h-11"
          value={r.proximoFollowup}
          onChange={(e) => patch({ proximoFollowup: e.target.value })}
        />
      </Campo>

      <Campo label="Observações (opcional)" erro={erros.observacoes}>
        <Textarea
          rows={2}
          value={r.observacoes}
          onChange={(e) => patch({ observacoes: e.target.value })}
          placeholder="Impressões, o que o cliente disse, próximos passos…"
        />
      </Campo>

      <p className="text-xs text-muted-foreground">
        Precisa do checklist completo?{" "}
        <Link
          to="/modo-visita"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Abrir no Modo Visita
        </Link>
      </p>
    </div>
  );

  const rodape = (
    <>
      <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
        Cancelar
      </Button>
      <Button onClick={submit} disabled={pending} className="min-h-11">
        {pending ? "Salvando…" : r.compareceu ? "Registrar visita" : "Registrar não comparecimento"}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <div className="overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <DrawerHeader className="text-left">
              <DrawerTitle className="font-display">{titulo}</DrawerTitle>
              <DrawerDescription>{descricao}</DrawerDescription>
            </DrawerHeader>
            <div className="px-4">{corpo}</div>
            <DrawerFooter className="flex-row justify-end">{rodape}</DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        {corpo}
        <DialogFooter>{rodape}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
