// Check-in obrigatório (decisão do dono, 12/10/2026: "checkin obrigatório").
//
// O corretor só usa o CRM depois de dizer onde está hoje: Barra Funda,
// Liberdade, Belém ou Em casa. Montado no shell /_authenticated, carregado
// sob demanda, entre o onboarding e o estudo do funil — ordem da abertura:
// onboarding → CHECK-IN → estudo do funil (quinta) → metas do dia.
//
// Quando abre: papel corretor, nenhum check-in hoje (aberto, encerrado ou
// barrado — "Encerrar presença" não reabre o bloqueio; fica a faixa do topo),
// treino do onboarding fora da tela e rota que não seja /presenca, /meu-perfil
// (já têm o card) nem a tela cheia de campo (/modo-visita). Gestão sem papel
// corretor nunca. Leitura carregando: nada abre (sem piscar). Leitura com
// erro: libera — falha técnica nunca prende ninguém.
//
// Depois do check-in:
// - liberou a roleta → fecha (toast verde);
// - em casa abaixo do mínimo de vendas → mostra o motivo e libera o CRM (ele
//   disse a verdade; só não entra na roleta);
// - filial barrada pela localização (fora do raio ou sem localização, com a
//   exigência ligada) → continua aberto com o porquê e as saídas: tentar de
//   novo, "Estou em casa" ou seguir sem receber leads. Sem armadilha.

import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  ArrowCounterClockwise,
  CircleNotch,
  House,
  MapPinSimpleArea,
  Storefront,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mensagemDeErro } from "@/lib/mensagem-erro";
import { cn } from "@/lib/utils";
import { useEstadoTreino } from "@/features/onboarding/treino-estado";
import { OpcoesCheckin, RegraDasVendas } from "./checkin-card";
import { desfechoCheckin, rotaSemCheckinObrigatorio } from "./checkin-obrigatorio";
import { motivoDoResultado, useCheckin, type ResultadoCheckin } from "./presenca-client";
import { avisoLocalizacao, rotuloLocal } from "./presenca-derive";
import {
  liberarCheckinPorFalha,
  publicarDialogoCheckin,
  useCheckinObrigatorio,
} from "./use-checkin-obrigatorio";

export function CheckinObrigatorioGlobal() {
  // A presença lida pelo hook traz as filiais e a régua das vendas.
  const { pendente, dia, uid, presenca } = useCheckinObrigatorio();
  const treino = useEstadoTreino();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const checkin = useCheckin({ avisarRecusa: false });

  const deveAbrir =
    pendente === true &&
    treino.decidido &&
    !treino.aberto &&
    !rotaSemCheckinObrigatorio(pathname) &&
    !!presenca;

  // Uma vez aberto, só fecha por decisão daqui: o check-in barrado já conta
  // como "fez check-in hoje", mas o diálogo precisa ficar para explicar.
  const [ativo, setAtivo] = useState(false);
  // O último check-in que NÃO liberou a roleta (motivo na tela).
  const [resultado, setResultado] = useState<ResultadoCheckin | null>(null);
  // Qual opção está confirmando (o GPS leva alguns segundos).
  const [escolha, setEscolha] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Já houve check-in por este diálogo (barrado volta às opções sem fechar).
  const [fezCheckin, setFezCheckin] = useState(false);

  useEffect(() => {
    if (deveAbrir) setAtivo(true);
  }, [deveAbrir]);

  // Check-in feito em outro lugar (outra aba, outro aparelho) enquanto só as
  // opções estavam na tela: não há o que explicar, fecha.
  useEffect(() => {
    if (ativo && pendente === false && !fezCheckin && !checkin.isPending) setAtivo(false);
  }, [ativo, pendente, fezCheckin, checkin.isPending]);

  const fechar = () => {
    setAtivo(false);
    setResultado(null);
    setErro(null);
    setFezCheckin(false);
  };

  const escolher = (modo: "loja" | "casa", filial?: string) => {
    setEscolha(filial ?? modo);
    setErro(null);
    checkin.mutate(
      { modo, filial },
      {
        onSuccess: (r) => {
          if (desfechoCheckin(r.presenca) === "na_roleta") return fechar();
          setFezCheckin(true);
          setResultado(r);
        },
        onError: (e) => setErro(mensagemDeErro(e) ?? "sem detalhe do servidor"),
        onSettled: () => setEscolha(null),
      },
    );
  };

  const seguirSemCheckin = () => {
    liberarCheckinPorFalha(uid, dia);
    fechar();
  };

  const p = resultado?.presenca ?? presenca;
  const aberto = (deveAbrir || ativo) && !!p;

  // O estudo do funil e as metas do dia esperam o diálogo fechar.
  useEffect(() => {
    publicarDialogoCheckin(aberto);
  }, [aberto]);
  useEffect(() => () => publicarDialogoCheckin(false), []);

  if (!aberto || !p) return null;

  const desfecho = resultado ? desfechoCheckin(resultado.presenca) : null;
  const bloqueante = desfecho !== "recusado";
  const ocupado = checkin.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && !bloqueante && fechar()}>
      <DialogContent
        className={cn(
          "max-h-[92vh] max-w-xl overflow-y-auto",
          bloqueante && "[&>button.absolute]:hidden",
        )}
        onEscapeKeyDown={(e) => bloqueante && e.preventDefault()}
        onPointerDownOutside={(e) => bloqueante && e.preventDefault()}
        onInteractOutside={(e) => bloqueante && e.preventDefault()}
        data-testid="checkin-obrigatorio-dialog"
      >
        {resultado && desfecho === "barrado" ? (
          <Barrado
            resultado={resultado}
            escolha={escolha}
            ocupado={ocupado}
            onTentarDeNovo={(filial) => escolher("loja", filial)}
            onEmCasa={() => escolher("casa")}
            onOutraFilial={() => setResultado(null)}
            onContinuar={fechar}
            erro={erro}
          />
        ) : resultado && desfecho === "recusado" ? (
          <Recusado resultado={resultado} onFechar={fechar} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display">
                <Storefront className="h-5 w-5 text-primary" /> Check-in de hoje
              </DialogTitle>
              <DialogDescription>Para usar o CRM hoje, diga onde você está.</DialogDescription>
            </DialogHeader>
            <OpcoesCheckin p={p} escolha={escolha} disabled={ocupado} onEscolher={escolher} />
            <RegraDasVendas p={p} />
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPinSimpleArea className="mt-0.5 h-4 w-4 shrink-0" />
              {avisoLocalizacao(p.exige_localizacao)}
            </p>
            {erro && <ErroCheckin erro={erro} onSeguir={seguirSemCheckin} />}
            {/* Voltou do "barrado" para escolher outra filial: a saída continua aqui. */}
            {fezCheckin && !erro && (
              <Button
                type="button"
                variant="ghost"
                className="justify-self-start text-muted-foreground"
                disabled={ocupado}
                onClick={fechar}
              >
                Continuar sem receber leads
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Filial barrada pela localização: o porquê e as três saídas. */
function Barrado({
  resultado,
  escolha,
  ocupado,
  erro,
  onTentarDeNovo,
  onEmCasa,
  onOutraFilial,
  onContinuar,
}: {
  resultado: ResultadoCheckin;
  escolha: string | null;
  ocupado: boolean;
  erro: string | null;
  onTentarDeNovo: (filial: string) => void;
  onEmCasa: () => void;
  onOutraFilial: () => void;
  onContinuar: () => void;
}) {
  const c = resultado.presenca.checkin;
  const filial = c?.filial_slug ?? null;
  const titulo =
    c?.motivo === "sem_localizacao"
      ? "Sem a localização do celular"
      : `A localização não confirmou a filial ${c?.filial_nome ?? ""}`.trim();
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-display">
          <WarningCircle className="h-5 w-5 text-warning" /> {titulo}
        </DialogTitle>
        <DialogDescription className="text-foreground/90" data-testid="checkin-barrado-motivo">
          {motivoDoResultado(resultado)}
        </DialogDescription>
      </DialogHeader>
      <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        O check-in em {rotuloLocal(c?.modo ?? null, c?.filial_nome ?? null)} ficou registrado, mas
        não vale para a roleta: enquanto isso, você não recebe leads hoje. Chegou à loja depois?
        Refaça o check-in em Check-in, no menu.
      </p>
      {erro && <p className="text-sm text-destructive">Não foi possível tentar de novo: {erro}</p>}
      <DialogFooter className="gap-2 sm:flex-wrap sm:justify-between sm:space-x-0">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground"
          disabled={ocupado}
          onClick={onContinuar}
        >
          Continuar sem receber leads
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" disabled={ocupado} onClick={onEmCasa}>
            {escolha === "casa" ? (
              <CircleNotch className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <House className="mr-1.5 h-4 w-4" />
            )}
            Estou em casa
          </Button>
          <Button
            type="button"
            disabled={ocupado}
            onClick={() => (filial ? onTentarDeNovo(filial) : onOutraFilial())}
          >
            {escolha !== null && escolha !== "casa" ? (
              <CircleNotch className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ArrowCounterClockwise className="mr-1.5 h-4 w-4" />
            )}
            Tentar de novo
          </Button>
        </div>
      </DialogFooter>
      <button
        type="button"
        className="justify-self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-60"
        disabled={ocupado}
        onClick={onOutraFilial}
      >
        Escolher outra filial
      </button>
    </>
  );
}

/** Em casa abaixo do mínimo de vendas: registrado, fora da roleta, CRM liberado. */
function Recusado({ resultado, onFechar }: { resultado: ResultadoCheckin; onFechar: () => void }) {
  const c = resultado.presenca.checkin;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-display">
          <House className="h-5 w-5 text-primary" /> Check-in feito:{" "}
          {rotuloLocal(c?.modo ?? null, c?.filial_nome ?? null)}
        </DialogTitle>
        <DialogDescription className="text-foreground/90" data-testid="checkin-recusado-motivo">
          {motivoDoResultado(resultado)}
        </DialogDescription>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        Você já pode usar o CRM: o check-in de hoje está feito.
      </p>
      <DialogFooter>
        <Button type="button" onClick={onFechar}>
          Entendi
        </Button>
      </DialogFooter>
    </>
  );
}

/** O check-in deu erro técnico: tenta de novo nas opções, ou segue sem ele. */
function ErroCheckin({ erro, onSeguir }: { erro: string; onSeguir: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <span>
        Não foi possível registrar o check-in ({erro}). Tente de novo ou siga sem ele por hoje.
      </span>
      <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onSeguir}>
        Continuar sem check-in
      </Button>
    </div>
  );
}

export default CheckinObrigatorioGlobal;
