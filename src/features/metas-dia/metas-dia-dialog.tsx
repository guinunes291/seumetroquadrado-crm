import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";
import {
  METAS_CHAVES,
  ROTULOS,
  normalizarMeta,
  popupBloqueante,
  sugestaoInicial,
  type MetaChave,
  type MetaDia,
  type MetaGestor,
} from "@/features/metas-dia/metas-dia";
import { useSalvarMetaDia } from "@/features/metas-dia/use-metas-dia";
import { CalendarCheck, FileText, SunHorizon, Target, Trophy } from "@phosphor-icons/react";

const ICONE: Record<MetaChave, typeof Target> = {
  agendamentos: CalendarCheck,
  documentacoes: FileText,
  vendas_semana: Trophy,
};

type Valores = Record<MetaChave, string>;

function valoresIniciais(
  dia: string,
  atual: MetaDia | null | undefined,
  ultima: MetaDia | null | undefined,
  gestor: MetaGestor,
): Valores {
  const base = atual ?? sugestaoInicial({ dia, ultima, gestor });
  return {
    agendamentos: String(base.meta_agendamentos),
    documentacoes: String(base.meta_documentacoes),
    vendas_semana: String(base.meta_vendas_semana),
  };
}

/**
 * Popup das metas do dia. Em dia útil é BLOQUEANTE: sem X, sem Esc, sem clique
 * fora — o corretor só segue depois de declarar as metas. No fim de semana
 * (ou ao reabrir para editar) pode ser fechado.
 */
export function MetasDiaDialog({
  open,
  dia,
  atual,
  ultima,
  gestor,
  modo,
  onClose,
}: {
  open: boolean;
  dia: string;
  /** Resposta já registrada hoje (modo edição). */
  atual: MetaDia | null | undefined;
  ultima: MetaDia | null | undefined;
  gestor: MetaGestor;
  /** "primeira": abertura do dia (bloqueante em dia útil). "editar": reabertura pelo card. */
  modo: "primeira" | "editar";
  /** Chamado ao fechar sem salvar (só permitido quando não é bloqueante). */
  onClose: (motivo: "salvo" | "pulado") => void;
}) {
  const salvar = useSalvarMetaDia();
  const bloqueante = modo === "primeira" && popupBloqueante(dia);
  const [valores, setValores] = useState<Valores>(() =>
    valoresIniciais(dia, atual, ultima, gestor),
  );

  // Recalcula o pré-preenchimento quando o popup abre com dados novos (as
  // queries de "última" e "gestor" podem resolver depois do primeiro render) —
  // mas NUNCA por cima do que o corretor já digitou nesta abertura.
  const tocouRef = useRef(false);
  useEffect(() => {
    if (!open) {
      tocouRef.current = false;
      return;
    }
    if (tocouRef.current) return;
    setValores(valoresIniciais(dia, atual, ultima, gestor));
  }, [open, dia, atual, ultima, gestor]);

  const set = (k: MetaChave) => (e: React.ChangeEvent<HTMLInputElement>) => {
    tocouRef.current = true;
    setValores((v) => ({ ...v, [k]: e.target.value }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    salvar.mutate(
      {
        dia,
        meta_agendamentos: normalizarMeta(valores.agendamentos),
        meta_documentacoes: normalizarMeta(valores.documentacoes),
        meta_vendas_semana: normalizarMeta(valores.vendas_semana),
      },
      {
        onSuccess: () => {
          toast.success(
            modo === "primeira"
              ? "Metas do dia registradas. Bora pra cima! 🚀"
              : "Metas atualizadas.",
          );
          onClose("salvo");
        },
        onError: (err: Error) => toast.error(err.message),
      },
    );
  };

  const fechar = (aberto: boolean) => {
    if (aberto) return;
    if (bloqueante) return; // ignorado: a única saída é salvar
    onClose("pulado");
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent
        className={cn("max-w-md", bloqueante && "[&>button.absolute]:hidden")}
        onEscapeKeyDown={(e) => bloqueante && e.preventDefault()}
        onPointerDownOutside={(e) => bloqueante && e.preventDefault()}
        onInteractOutside={(e) => bloqueante && e.preventDefault()}
        data-testid="metas-dia-dialog"
      >
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <SunHorizon className="h-5 w-5 text-primary" />
              {modo === "primeira" ? "Suas metas de hoje" : "Ajustar metas de hoje"}
            </DialogTitle>
            <DialogDescription>
              {modo === "primeira"
                ? "Antes de começar, declare o que você vai entregar hoje. O progresso fica visível o dia todo."
                : "Você pode ajustar as metas declaradas. O histórico do dia fica registrado."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {METAS_CHAVES.map((k) => {
              const Icon = ICONE[k];
              const zero = normalizarMeta(valores[k]) === 0;
              return (
                <div key={k}>
                  <Label htmlFor={`meta-${k}`} className="flex items-center gap-1.5">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {ROTULOS[k].pergunta}
                  </Label>
                  <Input
                    id={`meta-${k}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={valores[k]}
                    onChange={set(k)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-display mt-1 w-32 text-lg tabular-nums"
                    autoFocus={k === "agendamentos"}
                  />
                  {zero && (
                    <p className="mt-1 text-xs text-warning">
                      Meta zero: a barra desta meta não aparece no card hoje.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            {!bloqueante && (
              <Button type="button" variant="ghost" onClick={() => onClose("pulado")}>
                {modo === "primeira" ? "Hoje não" : "Cancelar"}
              </Button>
            )}
            <Button type="submit" disabled={salvar.isPending}>
              <Target className="h-4 w-4" />
              {modo === "primeira" ? "Começar o dia" : "Salvar metas"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
