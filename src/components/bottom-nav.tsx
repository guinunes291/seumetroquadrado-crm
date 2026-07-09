import { Link, useRouterState } from "@tanstack/react-router";
import { Sun, Users, Search, CalendarClock, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Slot = {
  to: string;
  label: string;
  icon: typeof Sun;
};

// Os 4 destinos de polegar do corretor. O slot central (dourado) abre a busca
// global até a Fase do SamiQ, quando passa a invocar o copiloto.
const LEFT: Slot[] = [
  { to: "/hoje", label: "Início", icon: Sun },
  { to: "/leads", label: "Leads", icon: Users },
];
const RIGHT: Slot[] = [
  { to: "/agendamentos", label: "Agenda", icon: CalendarClock },
  { to: "/projetos", label: "Projetos", icon: Building2 },
];

function isActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(to + "/");
}

function NavSlot({ slot, active }: { slot: Slot; active: boolean }) {
  const Icon = slot.icon;
  return (
    <Link
      to={slot.to}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="truncate">{slot.label}</span>
    </Link>
  );
}

/**
 * Navegação mobile fixa (glass) com FAB central dourado. Desktop usa a sidebar.
 * O wrapper de conteúdo do shell reserva o espaço com pb (ver route.tsx).
 */
export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Navegação principal"
      className="glass-panel fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch">
        {LEFT.map((s) => (
          <NavSlot key={s.to} slot={s} active={isActive(pathname, s.to)} />
        ))}
        <button
          type="button"
          aria-label="Buscar"
          onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
          className="relative -top-3 mx-1 flex h-12 w-12 shrink-0 items-center justify-center self-start rounded-full bg-gradient-gold text-navy-900 shadow-glow-gold transition-transform active:scale-95"
        >
          <Search className="h-5 w-5" />
        </button>
        {RIGHT.map((s) => (
          <NavSlot key={s.to} slot={s} active={isActive(pathname, s.to)} />
        ))}
      </div>
    </nav>
  );
}
