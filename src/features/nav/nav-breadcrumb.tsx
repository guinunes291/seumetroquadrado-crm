import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { secaoAtiva, sistemaAtivoContextual, SISTEMAS_NAV } from "@/features/nav/sistemas";
import { useFaseDaJornada } from "@/features/nav/contexto-jornada";

/** Páginas fora de módulo que ainda merecem nome na trilha. */
const PAGINAS_SOLTAS: Record<string, string> = {
  "/inicio": "Início",
  "/meu-perfil": "Meu perfil",
};

function Barra() {
  return (
    <span aria-hidden="true" className="text-muted-foreground/50">
      /
    </span>
  );
}

/**
 * Trilha "Módulos / Módulo / Página" no header do shell (identidade
 * Lançamento, 2026-10 — texto puro com barras, como no vídeo; a v3 levava o
 * ícone na cor do módulo). Resolve o sistema e a seção pela MESMA regra da
 * sidebar (sistemaAtivoContextual + secaoAtiva, incluindo a fase da jornada
 * publicada pela ficha do lead), por isso nunca discorda dela. O último elo é
 * o lugar atual, em negrito.
 */
export function NavBreadcrumb({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const faseJornada = useFaseDaJornada();
  const sistema = sistemaAtivoContextual({ pathname, search }, faseJornada, SISTEMAS_NAV);
  const secao = sistema ? secaoAtiva(sistema, { pathname, search }) : null;
  // Módulo de página única (Modo Visita): a seção repete o título — some.
  const mostraSecao = !!secao && secao.label !== sistema?.titulo;
  const solta = sistema ? null : PAGINAS_SOLTAS[pathname];

  return (
    <nav
      aria-label="Trilha de navegação"
      className={cn("flex min-w-0 items-center gap-2 text-sm", className)}
    >
      <Link
        to="/inicio"
        className="shrink-0 rounded-md text-muted-foreground transition-colors hover:text-foreground"
      >
        Módulos
      </Link>
      {sistema && (
        <>
          <Barra />
          <Link
            to={sistema.home.to}
            search={sistema.home.search}
            aria-current={mostraSecao ? undefined : "page"}
            className={cn(
              "truncate rounded-md transition-colors",
              mostraSecao
                ? "text-muted-foreground hover:text-foreground"
                : "font-semibold text-foreground",
            )}
          >
            {sistema.titulo}
          </Link>
        </>
      )}
      {secao && mostraSecao && (
        <>
          <Barra />
          <span className="truncate font-semibold text-foreground" aria-current="page">
            {secao.label}
          </span>
        </>
      )}
      {solta && (
        <>
          <Barra />
          <span className="truncate font-semibold text-foreground" aria-current="page">
            {solta}
          </span>
        </>
      )}
    </nav>
  );
}
