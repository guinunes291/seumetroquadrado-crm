// Bloco de check-in no rodapé da barra lateral (pedido do dono, 13/10/2026):
// onde e como o corretor está hoje ("Barra Funda · 09:31 — Nas roletas"), com
// a ação do momento (Fazer check-in, Trocar, Refazer check-in, Incluir
// localização). Na barra recolhida, um ícone com a bolinha da cor do estado
// (tons claros sobre o navy) e, além da cor, a forma (losango, quadrado).
//
// É painel de ESTADO, não seção nem módulo: fica fora da regra dos 2 menus.
// E não faz check-in nenhum — toda ação PEDE (pedirCheckinNoToque) e quem
// atende é o diálogo (em qualquer tela) ou o card (em /presenca e
// /meu-perfil). Assim um toque no ícone nunca grava nada, e a regra de "nunca
// rebaixar a gestão" continua num lugar só. "Incluir localização" lê o GPS no
// toque e manda a leitura junto no pedido (o navegador só mostra o pedido de
// permissão de dentro do gesto); nas telas do card, não lê (o card só rola).
//
// Mora no chunk do shell (/_authenticated), presente em toda tela: importa só
// o pequeno — a leitura da presença que o shell já faz (useCheckinObrigatorio,
// sem releitura: nenhuma consulta nova, nem por intervalo nem por foco; o
// único intervalo é o relógio do dia de useDiaSaoPaulo, de 60 s e sem rede,
// que vira o dia à meia-noite) e as funções puras de presenca-derive. Nada do
// card, da prévia da localização nem do Dialog.
//
// Sem aria-live: o toast e a região única do diálogo já anunciam o que muda.
// O estado é sempre TEXTO (a cor da bolinha nunca é a única pista). Os ids
// vêm de useId: no celular, o aside escondido continua montado junto com o
// Sheet, e dois blocos na página não podem repetir id.

import { useId } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { MapPinSimpleArea } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUserRoles } from "@/hooks/use-auth";
import { INTENT_DOT_NAVY, type Intent } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { useEstadoTreino } from "@/features/onboarding/treino-estado";
import { blocoCheckinLateral, type AcaoPedidoCheckin } from "./presenca-derive";
import { pedirCheckinNoToque, useCheckinObrigatorio } from "./use-checkin-obrigatorio";

// Fundo navy da barra: sem dourado (o dourado é raro, só no item ativo).
const CLASSES_BOTAO =
  "mt-2 w-full min-h-11 md:min-h-8 border-claro/15 bg-transparent text-claro shadow-none hover:bg-claro/[0.06] hover:text-claro";

/**
 * No trilho recolhido, a bolinha está sozinha (sem o texto ao lado): além da
 * cor, a forma — losango no barrado, quadrado no "fora das roletas".
 */
const FORMA_NO_TRILHO: Record<Intent, string> = {
  danger: "rotate-45 rounded-[2px]",
  warning: "rounded-[2px]",
  success: "rounded-full",
  info: "rounded-full",
  neutral: "rounded-full",
};

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
    // "Incluir localização" lê o GPS aqui, no toque (menos em /presenca e
    // /meu-perfil, onde o card atende e só rola até ele).
    pedirCheckinNoToque(a, "lateral", pathname);
  };

  // Sobre o navy: os tons claros (a cor do tema claro some no fundo escuro).
  const bolinha = (classe: string, forma = "rounded-full") => (
    <span
      aria-hidden="true"
      data-intent={b.intent}
      className={cn(forma, classe, INTENT_DOT_NAVY[b.intent])}
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
        {bolinha(
          "absolute right-1.5 top-1.5 h-2.5 w-2.5 ring-2 ring-sidebar",
          FORMA_NO_TRILHO[b.intent],
        )}
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

  // Lendo: o lugar da linha e do botão fica reservado (invisível), com as
  // mesmas classes do bloco pronto — o rodapé não pula quando a presença chega.
  const lendo = b.chave === "carregando";
  return (
    <section
      aria-labelledby={idTitulo}
      data-testid="checkin-lateral"
      data-chave={b.chave}
      className="rounded-lg border border-claro/10 bg-claro/[0.04] px-3 py-2.5"
    >
      <h2
        id={idTitulo}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/55"
      >
        <MapPinSimpleArea className="h-3.5 w-3.5 shrink-0" weight="regular" aria-hidden="true" />
        Check-in
      </h2>
      {b.linha ? (
        <p className="mt-1.5 truncate text-[13px] text-claro" title={b.linha}>
          {b.linha}
        </p>
      ) : (
        lendo && (
          <p
            aria-hidden="true"
            className="invisible mt-1.5 truncate text-[13px]"
            data-testid="checkin-lateral-reserva"
          >
            {"\u00a0"}
          </p>
        )
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
      {lendo && (
        <span
          aria-hidden="true"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            CLASSES_BOTAO,
            "invisible",
          )}
          data-testid="checkin-lateral-reserva"
        />
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
