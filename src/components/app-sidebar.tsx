import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import logoM2 from "@/assets/logo-m2.png.asset.json";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  Trello,
  CalendarClock,
  ListTodo,
  Zap,
  Target,
  Trophy,
  Gauge,
  Swords,
  Building2,
  Megaphone,
  Wallet,
  FileText,
  Library,
  MessageSquare,
  Plug,
  Settings,
  LogOut,
  Shuffle,
  User as UserIcon,
  Trash2,
  Merge,
  Sparkles,
  Link2,
  Activity,
  ChevronRight,
  ShieldCheck,
  Crosshair,
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

type Section = { title: string; items: Item[] };

// Navegação por INTENÇÃO (não por entidade): menos itens de topo, com as visões
// redundantes agrupadas como subitens. Nenhuma rota foi removida — tudo continua
// acessível, só melhor organizado.
const SECTIONS: Section[] = [
  {
    title: "Início",
    items: [
      { to: "/hoje", label: "Hoje", icon: Gauge },
      { to: "/relatorios", label: "Relatórios", icon: LayoutDashboard },
    ],
  },
  {
    title: "Trabalhar",
    items: [
      {
        to: "/leads",
        label: "Leads",
        icon: Users,
        children: [
          { to: "/kanban", label: "Kanban", icon: Trello },
          { to: "/blitz", label: "Modo Blitz", icon: Zap },
          {
            to: "/leads-landing",
            label: "Leads Landing",
            icon: Megaphone,
            roles: ["admin", "gestor"],
          },
        ],
      },
      { to: "/tarefas", label: "Tarefas", icon: ListTodo },
      { to: "/agendamentos", label: "Agenda & Visitas", icon: CalendarClock },
    ],
  },
  {
    title: "Negócios",
    items: [
      { to: "/projetos", label: "Empreendimentos", icon: Building2 },
      { to: "/match", label: "Match IA", icon: Sparkles },
      { to: "/radar", label: "Radar de fechamento", icon: Crosshair },
      { to: "/oferta-ativa", label: "Oferta Ativa", icon: Megaphone },
      { to: "/comissoes", label: "Comissões", icon: FileText },
      { to: "/links-uteis", label: "Links Úteis", icon: Link2 },
      { to: "/carteira", label: "Carteira Ativa", icon: Wallet, comingSoon: true },
      { to: "/scripts", label: "Scripts & FAQ", icon: Library, comingSoon: true },
    ],
  },
  {
    title: "Desempenho",
    items: [
      { to: "/metas", label: "Metas", icon: Target },
      {
        to: "/ranking",
        label: "Ranking & Copa",
        icon: Trophy,
        children: [
          { to: "/copa", label: "Copa SMQ", icon: Swords },
          { to: "/conquistas", label: "Conquistas", icon: Trophy },
        ],
      },
    ],
  },
  {
    title: "Gestão",
    items: [
      {
        to: "/painel-gestor",
        label: "Painel do Gestor",
        icon: Activity,
        roles: ["admin", "gestor"],
      },
      { to: "/distribuicao", label: "Distribuição", icon: Shuffle, roles: ["admin", "gestor"] },
      {
        to: "/corretores",
        label: "Corretores & Equipes",
        icon: Users,
        roles: ["admin", "gestor"],
        children: [
          { to: "/equipes", label: "Equipes", icon: UsersRound, roles: ["admin", "gestor"] },
          {
            to: "/leads-por-corretor",
            label: "Leads por Corretor",
            icon: Shuffle,
            roles: ["admin", "gestor"],
          },
        ],
      },
      { to: "/templates", label: "Templates", icon: MessageSquare, roles: ["admin", "gestor"] },
      {
        label: "Qualidade de dados",
        icon: ShieldCheck,
        roles: ["admin", "gestor"],
        children: [
          { to: "/duplicatas", label: "Duplicatas", icon: Merge, roles: ["admin", "gestor"] },
          { to: "/lixeira", label: "Lixeira", icon: Trash2, roles: ["admin"] },
        ],
      },
      { to: "/integracoes", label: "Integrações", icon: Plug, comingSoon: true, roles: ["admin"] },
      {
        to: "/configuracoes",
        label: "Configurações",
        icon: Settings,
        comingSoon: true,
        roles: ["admin"],
      },
    ],
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

  const leafClasses = (active: boolean) =>
    cn(
      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
      active
        ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
        <img
          src={logoM2.url}
          alt="Seu Metro Quadrado"
          className="h-9 w-9 rounded-md object-contain bg-white"
        />
        <div className="leading-tight">
          <div className="font-semibold text-sm">Seu Metro Quadrado</div>
          <div className="text-[11px] text-sidebar-foreground/60">CRM Imobiliário</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {SECTIONS.map((section) => {
          const visible = section.items.filter(itemVisible);
          if (visible.length === 0) return null;
          return (
            <div key={section.title}>
              <div className="px-3 text-[10px] uppercase tracking-wider text-sidebar-foreground/50 font-medium mb-1">
                {section.title}
              </div>
              <ul className="space-y-0.5">
                {visible.map((it) =>
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
            </div>
          );
        })}
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
      <ChevronRight
        className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")}
      />
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
