import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  /** Instrução do que fazer a seguir — nunca deixe o usuário sem próximo passo. */
  description?: React.ReactNode;
  /** CTA opcional (ex.: botão "Novo lead" ou "Limpar filtros"). */
  action?: React.ReactNode;
  className?: string;
};

/**
 * Estado vazio padronizado: ícone + título + orientação + ação. Use no lugar
 * dos "Nenhum resultado" soltos para dar sempre um próximo passo ao usuário.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      {Icon && <Icon className="h-8 w-8 text-muted-foreground/60" />}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
