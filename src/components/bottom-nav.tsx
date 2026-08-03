import { Link, useRouterState } from "@tanstack/react-router";
import { Headset, Plus, Sparkles, Sun, Trello, UserPlus, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { abrirNovoLead } from "@/features/leads/novo-lead-dialog";
import { cn } from "@/lib/utils";

type Slot = {
  to: string;
  label: string;
  icon: typeof Sun;
};

// Os 4 destinos de polegar do corretor. O slot central (dourado) é o botão de
// AÇÃO: um toque abre o que o corretor cria/dispara em campo.
const LEFT: Slot[] = [
  { to: "/hoje", label: "Início", icon: Sun },
  { to: "/leads", label: "Leads", icon: Users },
];
const RIGHT: Slot[] = [
  { to: "/atendimento", label: "Atender", icon: Headset },
  { to: "/pipeline", label: "Pipeline", icon: Trello },
];

function isActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(to + "/");
}

function NavSlot({ slot, active }: { slot: Slot; active: boolean }) {
  const Icon = slot.icon;
  return (
    <Link
      to={slot.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Ações rápidas"
              className="relative -top-3 mx-1 flex h-12 w-12 shrink-0 items-center justify-center self-start rounded-full bg-gradient-gold text-navy-900 shadow-glow-gold transition-transform active:scale-95"
            >
              <Plus className="h-6 w-6" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" sideOffset={12} className="min-w-52">
            <DropdownMenuItem onSelect={() => abrirNovoLead()}>
              <UserPlus className="h-4 w-4" />
              Novo lead
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event("open-samiq"))}>
              <Sparkles className="h-4 w-4" />
              SamiQ
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {RIGHT.map((s) => (
          <NavSlot key={s.to} slot={s} active={isActive(pathname, s.to)} />
        ))}
      </div>
    </nav>
  );
}
