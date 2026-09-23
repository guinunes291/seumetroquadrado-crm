// Estudo diário obrigatório do Meu Funil.
//
// Ordem da abertura do dia (corretor): onboarding → ESTUDO DO FUNIL → metas do
// dia. O estudo vem antes das metas de propósito: quem acabou de ver que
// precisa de 12 conversas para 1 agendamento declara a meta de agendamentos
// sabendo o que ela custa.
//
// Em dia útil é bloqueante: a única saída é concluir o estudo, que só libera
// depois de SEGUNDOS_MINIMOS_ESTUDO com a tela aberta e visível e com um foco
// escolhido. Fim de semana: pode pular.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle, Funnel, Timer } from "@phosphor-icons/react";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { ehDiaUtil } from "@/features/metas-dia/metas-dia";
import { useOnboardingStatus } from "@/features/onboarding/use-onboarding";
import {
  FOCOS,
  SEGUNDOS_MINIMOS_ESTUDO,
  type Diagnostico,
  type FocoChave,
} from "@/features/meu-funil/meu-funil";
import { MeuFunilView } from "@/features/meu-funil/meu-funil-view";
import { useRegistrarEstudo } from "@/features/meu-funil/use-meu-funil";
import {
  EVENTO_ESTUDO_FUNIL,
  gravarPulado,
  useDia,
  useEstudoFunilPendente,
} from "@/features/meu-funil/use-estudo-pendente";

/** Segundos com a aba VISÍVEL desde que `ativo` virou true. */
function useSegundosVisiveis(ativo: boolean): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") setS((x) => x + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [ativo]);
  return s;
}

export function MeuFunilGlobal() {
  const { user } = useAuth();
  const { isCorretor } = useUserRoles();
  const uid = user?.id ?? "";
  const dia = useDia();
  const pendente = useEstudoFunilPendente();

  // Onboarding vem antes de tudo (mesma regra das metas do dia).
  const onboardingQ = useOnboardingStatus();
  const onboardingPendente =
    isCorretor && !!onboardingQ.data && onboardingQ.data.concluido_em === null;

  const aberto = pendente === true && !onboardingPendente;
  const bloqueante = ehDiaUtil(dia);
  const segundos = useSegundosVisiveis(aberto);
  const faltam = Math.max(0, SEGUNDOS_MINIMOS_ESTUDO - segundos);

  const [foco, setFoco] = useState<FocoChave | null>(null);
  const [compromisso, setCompromisso] = useState("");
  const sugerido = useRef<FocoChave | null>(null);
  const aoDiagnosticar = useCallback((d: Diagnostico) => {
    sugerido.current = d.foco;
    // Pré-seleciona a sugestão, sem atropelar a escolha do corretor.
    setFoco((atual) => atual ?? d.foco);
  }, []);

  const registrar = useRegistrarEstudo();

  const concluir = () => {
    if (!foco || faltam > 0) return;
    registrar.mutate(
      { dia, foco, compromisso, segundos },
      {
        onSuccess: () => {
          toast.success("Estudo do funil concluído", {
            description: `Foco de hoje: ${FOCOS.find((f) => f.chave === foco)?.label}.`,
          });
          window.dispatchEvent(new Event(EVENTO_ESTUDO_FUNIL));
        },
        onError: (e) =>
          toast.error("Não foi possível salvar o estudo", {
            description: e instanceof Error ? e.message : undefined,
          }),
      },
    );
  };

  const pular = () => {
    if (bloqueante) return;
    gravarPulado(uid, dia);
    window.dispatchEvent(new Event(EVENTO_ESTUDO_FUNIL));
  };

  if (!aberto) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && pular()}>
      <DialogContent
        className={cn(
          "flex max-h-[92vh] max-w-5xl flex-col gap-0 p-0",
          bloqueante && "[&>button.absolute]:hidden",
        )}
        onEscapeKeyDown={(e) => bloqueante && e.preventDefault()}
        onPointerDownOutside={(e) => bloqueante && e.preventDefault()}
        onInteractOutside={(e) => bloqueante && e.preventDefault()}
        data-testid="meu-funil-estudo-dialog"
      >
        <DialogHeader className="border-b p-5">
          <DialogTitle className="flex items-center gap-2 font-display">
            <Funnel className="h-5 w-5 text-primary" /> Antes de começar: estude o seu funil
          </DialogTitle>
          <DialogDescription>
            Quantos leads, conversas, agendamentos, visitas e pastas custam 1 venda sua — e onde o
            seu funil está vazando. Leia com calma: é daqui que sai o seu dia.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5">
          <MeuFunilView dia={dia} onDiagnostico={aoDiagnosticar} />

          <section className="mt-6 space-y-3 rounded-xl border bg-muted/30 p-4">
            <Label className="text-base font-semibold">Qual é o seu foco hoje?</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup">
              {FOCOS.map((f) => (
                <button
                  key={f.chave}
                  type="button"
                  role="radio"
                  aria-checked={foco === f.chave}
                  onClick={() => setFoco(f.chave)}
                  className={cn(
                    "rounded-lg border p-3 text-left text-sm transition-colors",
                    foco === f.chave
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:bg-muted/50",
                  )}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {foco === f.chave && <CheckCircle className="h-4 w-4 text-primary" />}
                    {f.label}
                    {sugerido.current === f.chave && (
                      <span className="ml-auto text-[10px] font-semibold uppercase text-primary">
                        sugerido
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="meu-funil-compromisso">
                Seu compromisso de hoje <span className="font-normal">(opcional)</span>
              </Label>
              <Textarea
                id="meu-funil-compromisso"
                maxLength={500}
                rows={2}
                placeholder="Ex.: ligar para os 15 leads que ainda não responderam e marcar 3 visitas."
                value={compromisso}
                onChange={(e) => setCompromisso(e.target.value)}
              />
            </div>
          </section>
        </div>

        <DialogFooter className="items-center gap-2 border-t p-4 sm:justify-between">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="h-4 w-4" />
            {faltam > 0
              ? `Leitura mínima: libera em ${faltam}s`
              : !foco
                ? "Escolha o seu foco de hoje"
                : "Pronto para começar"}
          </span>
          <div className="flex gap-2">
            {!bloqueante && (
              <Button type="button" variant="ghost" onClick={pular}>
                Pular hoje
              </Button>
            )}
            <Button
              type="button"
              onClick={concluir}
              disabled={faltam > 0 || !foco || registrar.isPending}
              className="bg-gradient-gold text-navy-900 shadow-glow-gold hover:opacity-90"
              data-testid="meu-funil-concluir"
            >
              Concluí meu estudo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
