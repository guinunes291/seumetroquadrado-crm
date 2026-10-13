// Bloco de check-in no rodapé da barra lateral (pedido do dono, 13/10/2026):
// onde e como o corretor está hoje ("Barra Funda · 09:31 — Nas roletas"), com
// a ação do momento (Fazer check-in, Trocar, Refazer check-in, Incluir
// localização). Na barra recolhida, um ícone com a bolinha da cor do estado.
//
// É painel de ESTADO, não seção nem módulo: fica fora da regra dos 2 menus.
// E não faz check-in nenhum — toda ação PEDE (pedirCheckin) e quem atende é
// o diálogo (em qualquer tela) ou o card (em /presenca e /meu-perfil). Assim
// um toque no ícone nunca grava nada, e a regra de "nunca rebaixar a gestão"
// continua num lugar só.
//
// Mora no chunk do shell (/_authenticated), presente em toda tela: importa só
// o pequeno — a leitura da presença que o shell já faz (useCheckinObrigatorio,
// sem releitura: nenhuma consulta nova, nenhum intervalo) e as funções puras
// de presenca-derive. Nada do card, da prévia da localização nem do Dialog.
//
// Sem aria-live: o toast e a região única do diálogo já anunciam o que muda.
// O estado é sempre TEXTO (a cor da bolinha nunca é a única pista). Os ids
// vêm de useId: no celular, o aside escondido continua montado junto com o
// Sheet, e dois blocos na página não podem repetir id.

import { useId } from "react";
import { Link } from "@tanstack/react-router";
import { MapPinSimpleArea } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUserRoles } from "@/hooks/use-auth";
import { INTENT_DOT } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { useEstadoTreino } from "@/features/onboarding/treino-estado";
import { blocoCheckinLateral, type AcaoPedidoCheckin } from "./presenca-derive";
import { pedirCheckinNoToque, useCheckinObrigatorio } from "./use-checkin-obrigatorio";

// Fundo navy da barra: sem dourado (o dourado é raro, só no item ativo).
const CLASSES_BOTAO =
  "mt-2 w-full min-h-11 md:min-h-8 border-claro/15 bg-transparent text-claro shadow-none hover:bg-claro/[0.06] hover:text-claro";

export function CheckinLateral({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  // Hooks antes de qualquer return.
  const { isCorretor, loading } = useUserRoles();
  const { pendente, presenca, erroLeitura } = useCheckinObrigatorio();
  const treino = useEstadoTreino();
  const idTitulo = useId();
  const idEstado = useId();

  if (loading || !isCorretor) return null;

  const b = blocoCheckinLateral({ presenca, pendente, erro: erroLeitura });
  // AGENTS.md: nada abre por cima do treino do onboarding (o pedido seria
  // descartado; desabilitado, o corretor vê que não é agora).
  const bloqueado = treino.aberto;
  const acao = b.acao;
  const pedir = (a: AcaoPedidoCheckin) => {
    // Fecha o Sheet do celular ANTES: o diálogo (ou o card) recebe o foco.
    onNavigate?.();
    pedirCheckinNoToque(a, "lateral");
  };

  const bolinha = (classe: string) => (
    <span
      aria-hidden="true"
      data-intent={b.intent}
      className={cn("rounded-full", classe, INTENT_DOT[b.intent])}
    />
  );

  if (collapsed) {
    const rotulo = b.linha
      ? `Check-in: ${b.linha}, ${b.estado}. Abrir o check-in.`
      : `Check-in: ${b.estado}. Abrir o check-in.`;
    const classes =
      "relative mx-auto flex h-11 w-11 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-claro/[0.05] hover:text-claro disabled:pointer-events-none disabled:opacity-50";
    const conteudo = (
      <>
        <MapPinSimpleArea className="h-5 w-5" weight="regular" />
        {bolinha("absolute right-1.5 top-1.5 h-2.5 w-2.5 ring-2 ring-sidebar")}
      </>
    );
    return (
      <div data-testid="checkin-lateral-trilho">
        <Tooltip>
          <TooltipTrigger asChild>
            {acao?.tipo === "link" ? (
              <Link to="/presenca" onClick={onNavigate} aria-label={rotulo} className={classes}>
                {conteudo}
              </Link>
            ) : (
              // Recolhida, o clique SEMPRE abre o diálogo (nunca refaz no
              // próprio ícone): quem decide o que fazer é a tela inteira.
              <button
                type="button"
                aria-label={rotulo}
                className={classes}
                disabled={bloqueado}
                onClick={() => pedir("abrir")}
              >
                {conteudo}
              </button>
            )}
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-64">
            <span className="block font-medium">{b.linha ?? "Check-in"}</span>
            <span className="block opacity-80">{b.estado}</span>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={idTitulo}
      data-testid="checkin-lateral"
      data-chave={b.chave}
      className={cn(
        "rounded-lg border border-claro/10 bg-claro/[0.04] px-3 py-2.5",
        // Lendo: a mesma altura do bloco pronto (o rodapé não pula).
        b.chave === "carregando" && "min-h-[92px]",
      )}
    >
      <h2
        id={idTitulo}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/55"
      >
        <MapPinSimpleArea className="h-3.5 w-3.5 shrink-0" weight="regular" aria-hidden="true" />
        Check-in
      </h2>
      {b.linha && (
        <p className="mt-1.5 truncate text-[13px] text-claro" title={b.linha}>
          {b.linha}
        </p>
      )}
      <p
        id={idEstado}
        className="mt-0.5 flex items-center gap-1.5 text-[12px] text-sidebar-foreground/80"
      >
        {bolinha("h-2 w-2 shrink-0")}
        <span className="min-w-0">{b.estado}</span>
      </p>
      {acao?.tipo === "pedido" && (
        <Button
          variant="outline"
          size="sm"
          className={CLASSES_BOTAO}
          aria-describedby={idEstado}
          disabled={bloqueado}
          onClick={() => pedir(acao.acao)}
        >
          {acao.rotulo}
        </Button>
      )}
      {acao?.tipo === "link" && (
        // A leitura falhou: o check-in fica em /presenca (o card relê).
        <Button asChild variant="outline" size="sm" className={CLASSES_BOTAO}>
          <Link to="/presenca" onClick={onNavigate} aria-describedby={idEstado}>
            {acao.rotulo}
          </Link>
        </Button>
      )}
    </section>
  );
}
