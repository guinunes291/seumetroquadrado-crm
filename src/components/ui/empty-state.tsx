import { cn } from "@/lib/utils";
import type { Icon as IconComponent } from "@phosphor-icons/react";

type EmptyStateProps = {
  icon?: IconComponent;
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
 *
 * Identidade v3 (decisão 19): o ícone é o mesmo Phosphor duotone do resto da
 * interface, em navy com a área interna dourada — coerente com a sidebar e
 * sem ilustração de banco de imagens. Sempre que houver o que fazer, passe
 * `action` (Importar leads, Criar tarefa…): vazio sem próximo passo parece
 * tela quebrada.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="icon-duo mb-1 text-primary [--icon-duo:var(--color-gold)] [--icon-duo-opacity:0.35]">
          <Icon className="h-11 w-11" aria-hidden="true" />
        </span>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
