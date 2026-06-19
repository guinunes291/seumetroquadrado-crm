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
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/leads", label: "Leads", icon: Users },
      { to: "/kanban", label: "Kanban", icon: Trello },
      { to: "/blitz", label: "Modo Blitz", icon: Zap },
      { to: "/distribuicao", label: "Distribuição", icon: Shuffle, roles: ["admin", "gestor"] },
      { to: "/agendamentos", label: "Agendamentos", icon: CalendarClock },
      { to: "/tarefas", label: "Tarefas do dia", icon: ListTodo },
    ],
  },
  {
    title: "Performance",
    items: [
      { to: "/meu-painel", label: "Meu Dia", icon: Gauge },
      { to: "/metas", label: "Metas", icon: Target },
      { to: "/ranking", label: "Ranking", icon: Trophy },
      { to: "/copa", label: "Copa SMQ", icon: Swords },
      { to: "/conquistas", label: "Conquistas", icon: Trophy },
    ],
  },
  {
    title: "Negócios",
    items: [
      { to: "/projetos", label: "Empreendimentos", icon: Building2 },
      { to: "/match", label: "Match", icon: Sparkles },
      { to: "/oferta-ativa", label: "Oferta Ativa", icon: Megaphone },
      { to: "/carteira", label: "Carteira Ativa", icon: Wallet, comingSoon: true },
      { to: "/comissoes", label: "Comissões", icon: FileText },
      { to: "/scripts", label: "Scripts & FAQ", icon: Library, comingSoon: true },
    ],
  },
  {
    title: "Gestão",
    items: [
      { to: "/corretores", label: "Corretores", icon: Users, roles: ["admin", "gestor"] },
      { to: "/leads-por-corretor", label: "Leads por Corretor", icon: Shuffle, roles: ["admin", "gestor"] },
      { to: "/equipes", label: "Equipes", icon: UsersRound, roles: ["admin", "gestor"] },
      { to: "/templates", label: "Templates", icon: MessageSquare, roles: ["admin", "gestor"] },
      { to: "/duplicatas", label: "Duplicatas", icon: Merge, roles: ["admin", "gestor"] },
      { to: "/lixeira", label: "Lixeira", icon: Trash2, roles: ["admin"] },
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
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
                  const active =
                    pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
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
                  return (
                    <li key={it.to}>
                      {it.comingSoon ? (
                        // Itens "em breve" não têm rota: não navegáveis (evita tela de erro).
                        <div
                          aria-disabled="true"
                          title="Em breve"
                          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/40 cursor-not-allowed"
                        >
                          {inner}
                        </div>
                      ) : (
                        <Link
                          to={it.to}
                          onClick={onNavigate}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                            active
                              ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          )}
                        >
                          {inner}
                        </Link>
                      )}
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
