import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowsClockwise,
  CalendarDots,
  Fire,
  ListChecks,
  MagnifyingGlass,
  UsersThree,
} from "@phosphor-icons/react";
import { SamiMark } from "@/components/ui/sami-mark";
import { abrirSamiQ } from "@/components/samiq/abrir-samiq";
import { useUserRoles } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type Slot = {
  to: string;
  /** Aba interna (?tab=) — o slot só acende com o param presente. */
  search?: Record<string, string>;
  label: string;
  icon: typeof ListChecks;
};

// Os 4 destinos de polegar do corretor, na ordem do mockup aprovado
// (2026-09-12): Fila, Leads, [Sami], Agenda, Buscar. O slot central é a SAMI:
// "a Sami fica no meio da barra" — um toque abre o copiloto com o lead em
// contexto; ditar o desfecho, registrar, perguntar. Novo lead e Projetos
// continuam na Leads, na bancada e no ⌘K.
//
// A FILA ÚNICA é o 1º slot: a página Hoje foi retirada e a fila é a porta da
// Central de Comando — é onde o corretor passa o dia entre visitas. Atender
// continua no menu lateral e no ⌘K. A AGENDA volta ao polegar porque visita e
// tarefa do dia são o segundo gesto mais repetido.
//
// O 4º slot é a BUSCA, não o Pipeline: achar um lead pelo telefone é o gesto
// mais repetido do dia e vivia só na lupa do header — alvo pequeno, no topo,
// longe do polegar. O kanban é revisão de desktop; no celular o avanço de
// etapa acontece pela ficha do lead. Pipeline continua no menu lateral.
const LEFT: Slot[] = [
  { to: "/fila", label: "Fila", icon: ListChecks },
  { to: "/leads", label: "Leads", icon: UsersThree },
];
const RIGHT: Slot[] = [{ to: "/agendamentos", label: "Agenda", icon: CalendarDots }];

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
        <button
          type="button"
          aria-label="Abrir a Sami"
          onClick={() => abrirSamiQ({ origem: "bottom-nav" })}
          className="relative -top-3 mx-1 flex h-12 w-12 shrink-0 items-center justify-center self-start rounded-full border border-gold-500/60 bg-navy-900 text-gold-500 shadow-elev-3 ring-4 ring-gold-500/15 transition-transform active:scale-95"
        >
          <SamiMark className="h-7 w-7" />
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-gold-500 shadow-[0_0_8px_var(--color-gold-500)]"
          />
        </button>
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
