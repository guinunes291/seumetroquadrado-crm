import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import logoM2 from "@/assets/logo-m2.png.asset.json";
import {
  LayoutDashboard,
  Users,
  Trello,
  CalendarClock,
  Zap,
  Trophy,
  Sun,
  Building2,
  Map,
  Megaphone,
  Settings,
  LogOut,
  User as UserIcon,
  BarChart3,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

type Item = {
  to?: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: ("admin" | "gestor" | "corretor")[];
  comingSoon?: boolean;
  /** Subitens recolhíveis — usados para consolidar o menu sem esconder rotas. */
  children?: Item[];
};

// Navegação por INTENÇÃO com TETO DE 7 BOTÕES principais (Fase 1 da reestruturação).
// Cada botão é um "destino" que agrupa as rotas relacionadas como subitens recolhíveis.
// Nenhuma rota foi removida — tudo continua acessível, só consolidado em 7 grupos:
// corretor vê 5 botões, gestor 6, admin 7.
const NAV_ITEMS: Item[] = [
  {
    // Analytics/Relatórios é a aba interna do próprio /hoje — sem subitem duplicado.
    to: "/hoje",
    label: "Hoje",
    icon: Sun,
  },
  {
    to: "/leads",
    label: "Meus Leads",
    icon: Users,
    children: [
      { to: "/kanban", label: "Funil (Kanban)", icon: Trello },
      { to: "/blitz", label: "Modo Blitz", icon: Zap },
      {
        to: "/leads-landing",
        label: "Captação (Landing)",
        icon: Megaphone,
        roles: ["admin", "gestor"],
      },
    ],
  },
  {
    // Tarefas agora é uma aba do hub /agendamentos.
    to: "/agendamentos",
    label: "Agenda & Tarefas",
    icon: CalendarClock,
  },
  {
    // Catálogo, Oferta, Radar, Comissões e Links são abas do hub /projetos.
    // Match IA continua acessível pelo botão no hub e pela página do lead.
    to: "/projetos",
    label: "Negócios & Carteira",
    icon: Building2,
    children: [{ to: "/vitrine", label: "Vitrine (mapa)", icon: Map }],
  },
  {
    // Metas, Copa e Conquistas agora são abas internas do hub /ranking.
    to: "/ranking",
    label: "Desempenho",
    icon: Trophy,
  },
  {
    // As sub-áreas (Distribuição, Pessoas, Comunicação, Qualidade…) agora são abas
    // internas do hub /painel-gestor — por isso o item é um único botão.
    to: "/painel-gestor",
    label: "Gestão",
    icon: BarChart3,
    roles: ["admin", "gestor"],
  },
  {
    // Integrações e Preferências são abas internas de /configuracoes.
    to: "/configuracoes",
    label: "Configurações",
    icon: Settings,
    roles: ["admin"],
  },
];

// Casa a rota ativa por fronteira de segmento, evitando que "/leads" acenda em
// "/leads-landing" ou "/leads-por-corretor".
function isActivePath(pathname: string, to?: string) {
  if (!to) return false;
  return pathname === to || pathname.startsWith(to + "/");
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { roles, isAdmin, isGestor } = useUserRoles();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const canSee = (it: Item) => {
    if (!it.roles) return true;
    if (isAdmin) return true;
    return it.roles.some(
      (r) =>
        (r === "admin" && isAdmin) || (r === "gestor" && isGestor) || roles.includes(r as never),
    );
  };

  const visibleChildren = (it: Item) => (it.children ?? []).filter(canSee);

  const itemVisible = (it: Item): boolean => {
    if (it.children && it.children.length > 0) {
      return canSee(it) && (it.to != null || visibleChildren(it).length > 0);
    }
    return canSee(it);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  // Item ativo: trilho dourado à esquerda + texto/ícone dourados sobre um véu
  // sutil — o dourado é acento, não bloco (moeda rara do design system).
  const leafClasses = (active: boolean) =>
    cn(
      "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
      active
        ? "bg-white/[0.06] font-medium text-sidebar-primary before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-gradient-gold"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
    );

  const renderLeaf = (it: Item, opts?: { nested?: boolean }) => {
    const Icon = it.icon;
    const inner = (
      <>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{it.label}</span>
        {it.comingSoon && (
          <span className="text-[9px] uppercase tracking-wider text-sidebar-foreground/40">
            em breve
          </span>
        )}
      </>
    );
    if (it.comingSoon || !it.to) {
      return (
        <div
          aria-disabled="true"
          title="Em breve"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/40 cursor-not-allowed",
            opts?.nested && "pl-9",
          )}
        >
          {inner}
        </div>
      );
    }
    return (
      <Link
        to={it.to}
        onClick={onNavigate}
        className={cn(leafClasses(isActivePath(pathname, it.to)), opts?.nested && "pl-9")}
      >
        {inner}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col bg-gradient-command text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border/60">
        <img
          src={logoM2.url}
          alt="Seu Metro Quadrado"
          className="h-9 w-9 rounded-md object-contain bg-white shadow-elev-1"
        />
        <div className="leading-tight">
          <div className="font-display font-semibold text-sm">Seu Metro Quadrado</div>
          <div className="text-[11px] tracking-wide text-sidebar-primary/90">
            Central de Comando
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.filter(itemVisible).map((it) =>
            it.children && it.children.length > 0 ? (
              <NavGroup
                key={it.label}
                item={it}
                subitems={visibleChildren(it)}
                pathname={pathname}
                renderLeaf={renderLeaf}
                leafClasses={leafClasses}
                onNavigate={onNavigate}
              />
            ) : (
              <li key={it.to ?? it.label}>{renderLeaf(it)}</li>
            ),
          )}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-2 space-y-1">
        <Link
          to="/meu-perfil"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <UserIcon className="h-4 w-4" />
          Meu perfil
        </Link>
        <Button
          variant="ghost"
          onClick={handleSignOut}
          className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );
}

function NavGroup({
  item,
  subitems,
  pathname,
  renderLeaf,
  leafClasses,
  onNavigate,
}: {
  item: Item;
  subitems: Item[];
  pathname: string;
  renderLeaf: (it: Item, opts?: { nested?: boolean }) => React.ReactNode;
  leafClasses: (active: boolean) => string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const selfActive = isActivePath(pathname, item.to);
  const childActive = subitems.some((c) => isActivePath(pathname, c.to));
  const [open, setOpen] = useState(selfActive || childActive);
  // Mantém aberto enquanto um subitem estiver ativo (não esconde a página atual).
  const expanded = open || childActive;

  const chevron = (
    <button
      type="button"
      aria-label={expanded ? "Recolher" : "Expandir"}
      onClick={() => setOpen((o) => !o)}
      className="shrink-0 rounded p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
    </button>
  );

  return (
    <li>
      {item.to ? (
        // Link e chevron como IRMÃOS (botão não pode ficar dentro do <a>).
        <div className="flex items-center gap-0.5">
          <Link
            to={item.to}
            onClick={onNavigate}
            className={cn(leafClasses(selfActive), "flex-1 min-w-0")}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
          </Link>
          {chevron}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(leafClasses(false), "w-full")}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">{item.label}</span>
          <ChevronRight
            className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-90")}
          />
        </button>
      )}
      {expanded && (
        <ul className="mt-0.5 space-y-0.5">
          {subitems.map((c) => (
            <li key={c.to ?? c.label}>{renderLeaf(c, { nested: true })}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden md:flex md:w-64 md:flex-col border-r border-sidebar-border">
      <SidebarContent />
    </aside>
  );
}

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-72 bg-sidebar border-sidebar-border">
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
