import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  INTENT_BADGE,
  INTENT_BADGE_BORDERED,
  HUE_BADGE,
  type Intent,
  type Hue,
} from "@/lib/status-tones";

type StatusBadgeProps = {
  /** Significado semântico (success/warning/danger/info/neutral). */
  intent?: Intent;
  /** Cor nominal para categorias sem juízo de valor (etapas, tipos). */
  hue?: Hue;
  /** Adiciona borda no tom (só com `intent`). */
  bordered?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Badge de status padronizado do CRM. Use `intent` para estados semânticos
 * (SLA, tarefas, prioridade) e `hue` para categorias (etapa do funil, tipo de
 * interação). Nunca passe cores hardcoded — se faltar um tom, adicione em
 * lib/status-tones.ts.
 */
export function StatusBadge({ intent, hue, bordered, className, children }: StatusBadgeProps) {
  const tone = hue
    ? HUE_BADGE[hue]
    : intent
      ? bordered
        ? INTENT_BADGE_BORDERED[intent]
        : INTENT_BADGE[intent]
      : INTENT_BADGE.neutral;
  return (
    <Badge variant={bordered ? "outline" : "secondary"} className={cn(tone, className)}>
      {children}
    </Badge>
  );
}
