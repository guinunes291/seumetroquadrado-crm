// Check-in obrigatório (decisão do dono, 12/10/2026: "checkin obrigatório").
//
// O corretor só usa o CRM depois de dizer onde está hoje: Barra Funda,
// Liberdade, Belém ou Em casa. Montado no shell /_authenticated, carregado
// sob demanda, entre o onboarding e o estudo do funil — ordem da abertura:
// onboarding → CHECK-IN → estudo do funil (quinta) → metas do dia.
//
// Quando abre: papel corretor (inclusive quem também é gestor), nenhum
// check-in hoje (aberto, encerrado ou barrado — "Encerrar presença" não reabre
// o bloqueio; fica a faixa do topo), treino do onboarding fora da tela e rota
// que não seja /presenca, /meu-perfil (já têm o card) nem a tela cheia de
// campo (/modo-visita). Gestão sem papel corretor nunca. Leitura carregando:
// nada abre (sem piscar). Leitura com erro: libera — falha técnica nunca
// prende ninguém.
//
// Com a exigência de localização ligada, tocar numa filial pede confirmação
// ("Você está dentro da loja X agora?"): um toque "para ver" fora da loja
// vira check-in barrado e tira das roletas e do reforço no dia.
//
// Enquanto está na tela, relê a presença (15 s e ao voltar para a janela): o
// check-in feito no celular, o "Confirmar no plantão" da gestão ou o
// interruptor fecham o diálogo com o verde. E antes de QUALQUER check-in
// daqui, relê na hora: se o check-in de hoje já liberou a roleta, fecha sem
// chamar a RPC — nunca rebaixa uma confirmação.
//
// Depois do check-in:
// - liberou a roleta → fecha (toast verde);
// - em casa abaixo do mínimo de vendas → mostra o motivo e libera o CRM (ele
//   disse a verdade; só não entra na roleta);
// - filial barrada pela localização (fora do raio ou sem localização) →
//   continua aberto com o porquê e as saídas: tentar de novo, "Estou em casa"
//   ou continuar fora das roletas. Sem armadilha.

import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  AVISO_COMPUTADOR,
  BotoesConfirmarFilial,
  OpcoesCheckin,
  RegraDasVendas,
} from "./checkin-card";
import { desfechoCheckin, rotaSemCheckinObrigatorio } from "./checkin-obrigatorio";
import {
  avisarNaRoletaDeFora,
  ehComputador,
  motivoDoResultado,
  useBuscarPresencaFresca,
  useCheckin,
  type ResultadoCheckin,
} from "./presenca-client";
import {
  AVISO_FORA_DO_REFORCO,
  avisoLocalizacao,
  checkinAptoAberto,
  DICA_FORA_DA_FILIAL,
  perguntaConfirmarFilial,
  precisaoAproximada,
  rotuloLocal,
  type CheckinAtual,
  type FilialOpcao,
} from "./presenca-derive";
import {
  liberarCheckinPorFalha,
  publicarDialogoCheckin,
  useCheckinObrigatorio,
} from "./use-checkin-obrigatorio";

type Tela = "opcoes" | "confirmar" | "barrado" | "recusado";

export function CheckinObrigatorioGlobal() {
  // Uma vez aberto, só fecha por decisão daqui: o check-in barrado já conta
  // como "fez check-in hoje", mas o diálogo precisa ficar para explicar.
  const [ativo, setAtivo] = useState(false);
  // A presença lida pelo hook traz as filiais e a régua das vendas. Com o
  // diálogo na tela, ela é relida (check-in vindo de fora fecha o diálogo).
  const { pendente, dia, uid, presenca } = useCheckinObrigatorio({ releitura: ativo });
  const treino = useEstadoTreino();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // O motivo e o erro aparecem aqui dentro: nada de toast amarelo ou vermelho repetindo.
  const checkin = useCheckin({ avisarRecusa: false, avisarErro: false });
  const buscarPresencaFresca = useBuscarPresencaFresca();
  const computador = ehComputador();

  const deveAbrir =
    pendente === true &&
    treino.decidido &&
    !treino.aberto &&
    !rotaSemCheckinObrigatorio(pathname) &&
    !!presenca;

  // O último check-in daqui que NÃO liberou a roleta (motivo na tela).
  const [resultado, setResultado] = useState<ResultadoCheckin | null>(null);
  // Filial tocada esperando o "Estou na loja".
  const [confirmar, setConfirmar] = useState<FilialOpcao | null>(null);
  // Qual opção está em andamento (relendo a presença, o GPS, a RPC).
  const [escolha, setEscolha] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Já houve check-in por este diálogo (barrado volta às opções sem fechar).
  const [fezCheckin, setFezCheckin] = useState(false);
  // A localização barrou um check-in daqui: o reforço não volta com "Em casa".
  const [houveBarrado, setHouveBarrado] = useState(false);
  // O verde do check-in vindo de fora sai uma vez só por check-in.
  const avisado = useRef<string | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (deveAbrir) setAtivo(true);
  }, [deveAbrir]);

  const fechar = useCallback(() => {
    setAtivo(false);
    setResultado(null);
    setConfirmar(null);
    setErro(null);
    setFezCheckin(false);
    setHouveBarrado(false);
    setEscolha(null);
  }, []);

  /** O check-in de hoje que liberou a roleta chegou de fora: verde e fecha. */
  const fecharPorCheckinDeFora = useCallback(
    (c: CheckinAtual) => {
      if (avisado.current !== c.id) {
        avisado.current = c.id;
        avisarNaRoletaDeFora(c);
      }
      fechar();
    },
    [fechar],
  );

  const ocupado = escolha !== null || checkin.isPending;
  const p = resultado?.presenca ?? presenca;
  const aberto = (deveAbrir || ativo) && !!p;

  // A presença relida mudou enquanto o diálogo está na tela.
  useEffect(() => {
    if (!ativo || ocupado) return;
    const c = presenca?.checkin ?? null;
    if (!fezCheckin) {
      // Só as opções (ou a confirmação) na tela: o check-in de hoje feito em
      // outro lugar fecha — com o verde, se liberou a roleta; senão, a faixa
      // do topo continua avisando.
      if (pendente !== false) return;
      if (c && checkinAptoAberto(presenca)) fecharPorCheckinDeFora(c);
      else fechar();
      return;
    }
    // Depois de um check-in daqui que não liberou: outro check-in de hoje que
    // liberou (o celular, a gestão confirmando no plantão, o interruptor).
    if (c && c.id !== resultado?.presenca.checkin?.id && checkinAptoAberto(presenca)) {
      fecharPorCheckinDeFora(c);
    }
  }, [ativo, ocupado, presenca, pendente, fezCheckin, resultado, fechar, fecharPorCheckinDeFora]);

  const escolher = async (
    modo: "loja" | "casa",
    filial?: string,
    { novaLeitura = false }: { novaLeitura?: boolean } = {},
  ) => {
    setEscolha(filial ?? modo);
    setErro(null);
    // Antes de qualquer check-in, a presença de agora: se o de hoje já
    // liberou a roleta (feito no celular, confirmado pela gestão), fecha sem
    // chamar a RPC — refazer aqui encerraria a confirmação.
    const fresca = await buscarPresencaFresca().catch(() => null);
    if (fresca?.checkin && checkinAptoAberto(fresca)) {
      fecharPorCheckinDeFora(fresca.checkin);
      return;
    }
    checkin.mutate(
      { modo, filial, novaLeitura, barradoHoje: houveBarrado },
      {
        onSuccess: (r) => {
          if (desfechoCheckin(r.presenca) === "na_roleta") return fechar();
          setFezCheckin(true);
          setResultado(r);
          if (desfechoCheckin(r.presenca) === "barrado") setHouveBarrado(true);
        },
        onError: (e) => setErro(mensagemDeErro(e) ?? "sem detalhe do servidor"),
        onSettled: () => {
          setEscolha(null);
          setConfirmar(null);
        },
      },
    );
  };

  // Filial: com a exigência ligada, primeiro a confirmação.
  const tocarOpcao = (modo: "loja" | "casa", slug?: string) => {
    const f = modo === "loja" ? p?.filiais.find((x) => x.slug === slug) : undefined;
    if (f && p?.exige_localizacao) return setConfirmar(f);
    void escolher(modo, slug);
  };

  const seguirSemCheckin = () => {
    liberarCheckinPorFalha(uid, dia);
    fechar();
  };

  const desfecho = resultado ? desfechoCheckin(resultado.presenca) : null;
  const tela: Tela = confirmar
    ? "confirmar"
    : resultado && desfecho === "barrado"
      ? "barrado"
      : resultado && desfecho === "recusado"
        ? "recusado"
        : "opcoes";

  // O estudo do funil e as metas do dia esperam o diálogo fechar.
  useEffect(() => {
    publicarDialogoCheckin(aberto);
  }, [aberto]);
  useEffect(() => () => publicarDialogoCheckin(false), []);

  // Cada tela nova: o foco vai para o título (o leitor de tela lê a mudança;
  // nada de Enter solto num botão de filial).
  useEffect(() => {
    if (aberto) tituloRef.current?.focus();
  }, [aberto, tela]);

  if (!aberto || !p) return null;

  const bloqueante = tela !== "recusado";

  return (
    <Dialog open onOpenChange={(o) => !o && !bloqueante && fechar()}>
      <DialogContent
        className={cn(
          "max-h-[92vh] max-w-xl overflow-y-auto",
          bloqueante && "[&>button.absolute]:hidden",
        )}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          tituloRef.current?.focus();
        }}
        onEscapeKeyDown={(e) => bloqueante && e.preventDefault()}
        onPointerDownOutside={(e) => bloqueante && e.preventDefault()}
        onInteractOutside={(e) => bloqueante && e.preventDefault()}
        data-testid="checkin-obrigatorio-dialog"
      >
        {tela === "confirmar" && confirmar ? (
          <ConfirmarNaLoja
            tituloRef={tituloRef}
            filial={confirmar}
            computador={computador}
            carregando={escolha === confirmar.slug}
            ocupado={ocupado}
            // Depois de um barrado, a posição é lida na hora (nada da de 1 min atrás).
            onConfirmar={() => void escolher("loja", confirmar.slug, { novaLeitura: houveBarrado })}
            onVoltar={() => setConfirmar(null)}
          />
        ) : tela === "barrado" && resultado ? (
          <Barrado
            tituloRef={tituloRef}
            resultado={resultado}
            computador={computador}
            escolha={escolha}
            ocupado={ocupado}
            erro={erro}
            onTentarDeNovo={(filial) => void escolher("loja", filial, { novaLeitura: true })}
            onEmCasa={() => void escolher("casa")}
            onOutraFilial={() => setResultado(null)}
            onContinuar={fechar}
          />
        ) : tela === "recusado" && resultado ? (
          <Recusado
            tituloRef={tituloRef}
            resultado={resultado}
            houveBarrado={houveBarrado}
            onFechar={fechar}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle
                ref={tituloRef}
                tabIndex={-1}
                className="flex items-center gap-2 font-display outline-none"
              >
                <Storefront className="h-5 w-5 text-primary" /> Check-in de hoje
              </DialogTitle>
              <DialogDescription>Para usar o CRM hoje, diga onde você está.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <OpcoesCheckin p={p} escolha={escolha} disabled={ocupado} onEscolher={tocarOpcao} />
              <p className="text-xs text-muted-foreground">{DICA_FORA_DA_FILIAL}</p>
            </div>
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
                Continuar fora das roletas
              </Button>
            )}
          </>
        )}
        {ocupado && (
          <p
            role="status"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            data-testid="checkin-status"
          >
            <CircleNotch className="h-4 w-4 animate-spin" />
            {escolha === "casa" ? "Registrando o check-in…" : "Conferindo a localização…"}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

type TituloRef = React.RefObject<HTMLHeadingElement | null>;

/** "Você está dentro da loja X agora?" — antes do check-in na filial. */
function ConfirmarNaLoja({
  tituloRef,
  filial,
  computador,
  carregando,
  ocupado,
  onConfirmar,
  onVoltar,
}: {
  tituloRef: TituloRef;
  filial: FilialOpcao;
  computador: boolean;
  carregando: boolean;
  ocupado: boolean;
  onConfirmar: () => void;
  onVoltar: () => void;
}) {
  const pergunta = perguntaConfirmarFilial(filial.nome);
  return (
    <>
      <DialogHeader>
        <DialogTitle
          ref={tituloRef}
          tabIndex={-1}
          className="flex items-center gap-2 font-display leading-snug outline-none"
        >
          <Storefront className="h-5 w-5 shrink-0 text-primary" /> {pergunta.titulo}
        </DialogTitle>
        <DialogDescription className="text-foreground/90">{pergunta.detalhe}</DialogDescription>
      </DialogHeader>
      {computador && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <MapPinSimpleArea className="mt-0.5 h-4 w-4 shrink-0" />
          {AVISO_COMPUTADOR}
        </p>
      )}
      <BotoesConfirmarFilial
        carregando={carregando}
        disabled={ocupado}
        onConfirmar={onConfirmar}
        onVoltar={onVoltar}
      />
    </>
  );
}

/** Filial barrada pela localização: o porquê e as saídas. */
function Barrado({
  tituloRef,
  resultado,
  computador,
  escolha,
  ocupado,
  erro,
  onTentarDeNovo,
  onEmCasa,
  onOutraFilial,
  onContinuar,
}: {
  tituloRef: TituloRef;
  resultado: ResultadoCheckin;
  computador: boolean;
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
      ? computador
        ? "Sem a localização deste computador"
        : "Sem a localização do celular"
      : precisaoAproximada(c?.precisao_m)
        ? "A localização deste aparelho é aproximada"
        : `A localização não confirmou a filial ${c?.filial_nome ?? ""}`.trim();
  return (
    <>
      <DialogHeader>
        <DialogTitle
          ref={tituloRef}
          tabIndex={-1}
          className="flex items-center gap-2 font-display leading-snug outline-none"
        >
          <WarningCircle className="h-5 w-5 shrink-0 text-warning" /> {titulo}
        </DialogTitle>
        <DialogDescription
          className="text-foreground/90"
          aria-live="polite"
          data-testid="checkin-barrado-motivo"
        >
          {motivoDoResultado(resultado, { computador })}
        </DialogDescription>
      </DialogHeader>
      <div
        className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        data-testid="checkin-barrado-efeito"
      >
        <p>
          Seu check-in em {rotuloLocal(c?.modo ?? null, c?.filial_nome ?? null)} ficou registrado,
          mas não vale para as roletas nem para o reforço de hoje. Visitas marcadas pelo SDR
          continuam chegando.
        </p>
        <p className="text-foreground/80">
          Chegou à loja depois? Refaça o check-in pela faixa no topo do CRM.
        </p>
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível tentar de novo: {erro}
        </p>
      )}
      <DialogFooter className="gap-2 sm:flex-wrap sm:justify-between sm:space-x-0">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground"
          disabled={ocupado}
          onClick={onContinuar}
        >
          Continuar fora das roletas
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
function Recusado({
  tituloRef,
  resultado,
  houveBarrado,
  onFechar,
}: {
  tituloRef: TituloRef;
  resultado: ResultadoCheckin;
  houveBarrado: boolean;
  onFechar: () => void;
}) {
  const c = resultado.presenca.checkin;
  return (
    <>
      <DialogHeader>
        <DialogTitle
          ref={tituloRef}
          tabIndex={-1}
          className="flex items-center gap-2 font-display outline-none"
        >
          <House className="h-5 w-5 text-primary" /> Check-in feito:{" "}
          {rotuloLocal(c?.modo ?? null, c?.filial_nome ?? null)}
        </DialogTitle>
        <DialogDescription
          className="text-foreground/90"
          aria-live="polite"
          data-testid="checkin-recusado-motivo"
        >
          {motivoDoResultado(resultado)}
        </DialogDescription>
      </DialogHeader>
      {houveBarrado && (
        <p
          className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
          data-testid="checkin-recusado-reforco"
        >
          {AVISO_FORA_DO_REFORCO}
        </p>
      )}
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
