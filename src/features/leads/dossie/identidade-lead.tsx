// Identidade do lead no topo do dossiê (referência de 2026-10, ficha de
// contato): as iniciais dentro do anel do score de prioridade — quem é e quão
// urgente numa peça só — e a fileira de ações redondas com o rótulo embaixo.
// Iniciais, nunca foto: lead não tem foto, e foto de terceiro não entra no CRM.

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ScoreRing } from "@/components/ui/score-ring";
import { iniciais } from "@/lib/prateleira";
import type { ScoreResult } from "@/lib/priority";
import type { Intent } from "@/lib/status-tones";
import { cn } from "@/lib/utils";

const INTENT_DO_TIER: Record<ScoreResult["tier"], Intent> = {
  alta: "danger",
  media: "warning",
  baixa: "neutral",
};

/** Iniciais no anel do score, com o número num selo no canto (o "86" da ficha). */
export function AnelDoLead({ nome, score }: { nome: string; score: ScoreResult }) {
  return (
    <span className="relative inline-flex shrink-0">
      <ScoreRing
        value={score.score}
        size={64}
        strokeWidth={4}
        intent={INTENT_DO_TIER[score.tier]}
        title={`Score de prioridade ${score.score} — ${score.motivo}`}
        centro={
          <span
            aria-hidden="true"
            className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-muted font-display text-lg font-semibold text-foreground"
          >
            {iniciais(nome)}
          </span>
        }
      />
      <span
        aria-hidden="true"
        className="absolute -right-1 -bottom-1 min-w-6 rounded-full border-2 border-background bg-foreground px-1 text-center font-display text-[11px] leading-[18px] font-semibold text-background tabular-nums"
      >
        {score.score}
      </span>
    </span>
  );
}

type AcaoRedondaProps = Omit<ComponentPropsWithoutRef<"button">, "children"> & {
  icone: ReactNode;
  rotulo: string;
  /** Destaque do canal (ex.: WhatsApp em verde); o resto é contorno neutro. */
  destaque?: boolean;
};

/** Casca do botão redondo — exportada para links (`<Link className=…>`). */
export const ACAO_REDONDA_CLASSE =
  "group inline-flex w-16 flex-col items-center gap-1 rounded-lg text-center text-[11px] leading-tight font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/** O círculo com o ícone e o rótulo embaixo, para botão ou link. */
export function AcaoRedondaConteudo({
  icone,
  rotulo,
  destaque = false,
}: {
  icone: ReactNode;
  rotulo: string;
  destaque?: boolean;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full border transition-colors [&_svg]:h-[18px] [&_svg]:w-[18px]",
          destaque
            ? "border-transparent bg-exito-600 text-claro group-hover:bg-exito-700"
            : "border-border bg-card text-foreground group-hover:bg-muted",
        )}
      >
        {icone}
      </span>
      {rotulo}
    </>
  );
}

/**
 * Botão redondo com o rótulo embaixo. O rótulo fica visível de propósito:
 * ícone sozinho obriga a decorar, e o corretor novo está no onboarding.
 * forwardRef para funcionar como gatilho de diálogo (asChild).
 */
export const AcaoRedonda = forwardRef<HTMLButtonElement, AcaoRedondaProps>(
  ({ icone, rotulo, destaque = false, className, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(ACAO_REDONDA_CLASSE, className)} {...props}>
      <AcaoRedondaConteudo icone={icone} rotulo={rotulo} destaque={destaque} />
    </button>
  ),
);
AcaoRedonda.displayName = "AcaoRedonda";
