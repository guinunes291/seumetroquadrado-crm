import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  Trello,
  CalendarClock,
  ListTodo,
  Target,
  Trophy,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

type Item = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: ("admin" | "gestor" | "corretor")[];
  comingSoon?: boolean;
};

type Section = { title: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    title: "Operação",
    items: [
      { to: "/", label: "Painel", icon: LayoutDashboard },
      { to: "/leads", label: "Leads", icon: Users },
      { to: "/kanban", label: "Kanban", icon: Trello },
      { to: "/distribuicao", label: "Distribuição", icon: Shuffle, roles: ["admin", "gestor"] },
      { to: "/agendamentos", label: "Agendamentos", icon: CalendarClock, comingSoon: true },
      { to: "/tarefas", label: "Tarefas do dia", icon: ListTodo, comingSoon: true },
    ],
  },
  {
    title: "Performance",
    items: [
      { to: "/metas", label: "Metas", icon: Target, comingSoon: true },
      { to: "/conquistas", label: "Conquistas", icon: Trophy, comingSoon: true },
      { to: "/ranking", label: "Ranking TV", icon: Trophy, comingSoon: true },
    ],
  },
  {
    title: "Negócios",
    items: [
      { to: "/projetos", label: "Empreendimentos", icon: Building2, comingSoon: true },
      { to: "/oferta-ativa", label: "Oferta Ativa", icon: Megaphone, comingSoon: true },
      { to: "/carteira", label: "Carteira Ativa", icon: Wallet, comingSoon: true },
      { to: "/comissoes", label: "Comissões", icon: FileText, comingSoon: true },
      { to: "/scripts", label: "Scripts & FAQ", icon: Library, comingSoon: true },
    ],
  },
  {
    title: "Gestão",
    items: [
      { to: "/corretores", label: "Corretores", icon: Users, roles: ["admin", "gestor"] },
      { to: "/equipes", label: "Equipes", icon: UsersRound, roles: ["admin", "gestor"] },
      { to: "/comunicacao", label: "Comunicação", icon: MessageSquare, comingSoon: true, roles: ["admin", "gestor"] },
      { to: "/integracoes", label: "Integrações", icon: Plug, comingSoon: true, roles: ["admin"] },
      { to: "/configuracoes", label: "Configurações", icon: Settings, comingSoon: true, roles: ["admin"] },
    ],
  },
];

export function AppSidebar() {
  const { roles, isAdmin, isGestor } = useUserRoles();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const canSee = (it: Item) => {
    if (!it.roles) return true;
    if (isAdmin) return true;
    return it.roles.some((r) => (r === "admin" && isAdmin) || (r === "gestor" && isGestor) || roles.includes(r as never));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
        <div className="h-8 w-8 rounded-md bg-gold text-navy flex items-center justify-center font-bold">m²</div>
        <div className="leading-tight">
          <div className="font-semibold text-sm">Seu Metro Quadrado</div>
          <div className="text-[11px] text-sidebar-foreground/60">CRM Imobiliário</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {SECTIONS.map((section) => {
          const visible = section.items.filter(canSee);
          if (visible.length === 0) return null;
          return (
            <div key={section.title}>
              <div className="px-3 text-[10px] uppercase tracking-wider text-sidebar-foreground/50 font-medium mb-1">
                {section.title}
              </div>
              <ul className="space-y-0.5">
                {visible.map((it) => {
                  const Icon = it.icon;
                  const active = pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
                  return (
                    <li key={it.to}>
                      <Link
                        to={it.to}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{it.label}</span>
                        {it.comingSoon && (
                          <span className="text-[9px] uppercase tracking-wider text-sidebar-foreground/40">
                            em breve
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2 space-y-1">
        <Link
          to="/meu-perfil"
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
    </aside>
  );
}
