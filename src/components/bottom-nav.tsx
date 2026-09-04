import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowsClockwise,
  Buildings,
  CalendarDots,
  Fire,
  Headset,
  MagnifyingGlass,
  Plus,
  SunHorizon,
  UserPlus,
  UsersThree,
} from "@phosphor-icons/react";
import { SamiMark } from "@/components/ui/sami-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { abrirNovoLead } from "@/features/leads/novo-lead-dialog";
import { useUserRoles } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type Slot = {
  to: string;
  /** Aba interna (?tab=) — o slot só acende com o param presente. */
  search?: Record<string, string>;
  label: string;
  icon: typeof SunHorizon;
};

// Os 4 destinos de polegar do corretor. O slot central (dourado) é o botão de
// AÇÃO: um toque abre o que o corretor cria/dispara em campo.
//
// O 4º slot é a BUSCA, não o Pipeline: achar um lead pelo telefone é o gesto
// mais repetido do dia e vivia só na lupa do header — alvo pequeno, no topo,
// longe do polegar. O kanban é revisão de desktop; no celular o avanço de
// etapa acontece pela ficha do lead. Pipeline continua no menu lateral.
const LEFT: Slot[] = [
  { to: "/hoje", label: "Início", icon: SunHorizon },
  { to: "/leads", label: "Leads", icon: UsersThree },
];
const RIGHT: Slot[] = [{ to: "/atendimento", label: "Atender", icon: Headset }];

// SDR (2026-09-04): o dia dele é base → reaquecer → visitas. Mesma barra,
// destinos do hub próprio.
const LEFT_SDR: Slot[] = [
  { to: "/sdr", label: "Base", icon: Fire },
  { to: "/sdr", search: { tab: "reaquecer" }, label: "Reaquecer", icon: ArrowsClockwise },
];
const RIGHT_SDR: Slot[] = [
  { to: "/sdr", search: { tab: "agenda" }, label: "Visitas", icon: CalendarDots },
];

function isActive(loc: { pathname: string; search: Record<string, unknown> }, slot: Slot) {
  const pathOk = loc.pathname === slot.to || loc.pathname.startsWith(slot.to + "/");
  if (!pathOk) return false;
  if (slot.search) {
    return Object.entries(slot.search).every(([k, v]) => String(loc.search[k]) === v);
  }
  // Slot sem aba: só acende quando nenhuma aba conhecida está aberta.
  return typeof loc.search.tab !== "string";
}

function NavSlot({ slot, active }: { slot: Slot; active: boolean }) {
  const Icon = slot.icon;
  return (
    <Link
      to={slot.to}
      search={slot.search}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-5 w-5" weight={active ? "fill" : "duotone"} />
      <span className="truncate">{slot.label}</span>
    </Link>
  );
}

/**
 * Navegação mobile fixa (glass) com FAB central dourado sólido (o único acento
 * dourado da tela — regra do dourado raro, identidade v3). Desktop usa a sidebar.
 * O wrapper de conteúdo do shell reserva o espaço com pb (ver route.tsx).
 */
export function BottomNav() {
  const loc = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      search: s.location.search as Record<string, unknown>,
    }),
  });
  const { isSdr, isAdmin } = useUserRoles();
  const modoSdr = isSdr && !isAdmin;
  const left = modoSdr ? LEFT_SDR : LEFT;
  const right = modoSdr ? RIGHT_SDR : RIGHT;

  return (
    <nav
      aria-label="Navegação principal"
      className="glass-panel fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch">
        {left.map((s) => (
          <NavSlot key={s.label} slot={s} active={isActive(loc, s)} />
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Ações rápidas"
              className="relative -top-3 mx-1 flex h-12 w-12 shrink-0 items-center justify-center self-start rounded-full bg-gold-500 text-navy-900 shadow-elev-3 transition-transform active:scale-95"
            >
              <Plus className="h-6 w-6" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" sideOffset={12} className="min-w-52">
            <DropdownMenuItem onSelect={() => abrirNovoLead()}>
              <UserPlus className="h-4 w-4" />
              Novo lead
            </DropdownMenuItem>
            {/* Consulta de preço com o cliente na frente: sem isto, Projetos
                custa hambúrguer > Projetos > card > tabela (4 toques). Aponta
                para a bancada — lá book e tabela abrem direto da lista. */}
            <DropdownMenuItem asChild>
              <Link to="/projetos-foco">
                <Buildings className="h-4 w-4" />
                Projetos e preços
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event("open-samiq"))}>
              <SamiMark className="h-4 w-4" />
              Falar com a Sami
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {right.map((s) => (
          <NavSlot key={s.label} slot={s} active={isActive(loc, s)} />
        ))}
        <button
          type="button"
          aria-label="Buscar lead, projeto ou tarefa"
          onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
          className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <MagnifyingGlass className="h-5 w-5" />
          <span className="truncate">Buscar</span>
        </button>
      </div>
    </nav>
  );
}
