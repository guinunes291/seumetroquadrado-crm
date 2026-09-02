import type { ReactNode } from "react";

/**
 * Cabeçalho de página: título em Sora, descrição (texto ou nó com metadados)
 * e ações à direita. `titleAddon` encosta chips no título (temperatura,
 * etapa) — o dossiê usa para dizer quem é o lead numa linha só.
 */
export function PageHeader({
  title,
  titleAddon,
  description,
  actions,
}: {
  title: string;
  titleAddon?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between mb-6">
      <div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {titleAddon}
        </div>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
