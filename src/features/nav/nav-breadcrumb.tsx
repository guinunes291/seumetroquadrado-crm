import { Link, useRouterState } from "@tanstack/react-router";
import { CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { secaoAtiva, sistemaAtivoContextual } from "@/features/nav/sistemas";
import { useFaseDaJornada } from "@/features/nav/contexto-jornada";
import { CLASSES_MODULO } from "@/features/nav/cores-modulo";

/**
 * Trilha "Módulo › Seção" no header do shell (identidade v3). Resolve o
 * sistema e a seção pela MESMA regra da sidebar (sistemaAtivoContextual +
 * secaoAtiva, incluindo a fase da jornada publicada pela ficha do lead), por
 * isso nunca discorda dela. O ícone leva a cor do módulo — é o "header da
 * página" onde a cor fixa aparece (cores-modulo.ts).
 */
export function NavBreadcrumb({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const faseJornada = useFaseDaJornada();
  const sistema = sistemaAtivoContextual({ pathname, search }, faseJornada);
  if (!sistema) return null;

  const secao = secaoAtiva(sistema, { pathname, search });
  const cor = CLASSES_MODULO[sistema.cor];
  const Icon = sistema.icon;
  return (
    <nav
      aria-label="Trilha de navegação"
      className={cn("flex min-w-0 items-center gap-1.5 text-sm", className)}
    >
      <Link
        to={sistema.home.to}
        search={sistema.home.search}
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 font-medium text-foreground hover:bg-accent"
      >
        <span className={cn("icon-duo flex h-5 w-5 items-center justify-center", cor.text)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate">{sistema.titulo}</span>
      </Link>
      {secao && (
        <>
          <CaretRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" weight="bold" />
          <span className="truncate text-muted-foreground" aria-current="page">
            {secao.label}
          </span>
        </>
      )}
    </nav>
  );
}
