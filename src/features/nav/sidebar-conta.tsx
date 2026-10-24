// Barra lateral — o menu da conta no rodapé: iniciais, nome, papel, perfil,
// "Como usar o CRM" (corretor), tema e Sair.
// Recortado de src/components/app-sidebar.tsx sem mudança de comportamento.

import { Link } from "@tanstack/react-router";
import { CaretUpDown, Lifebuoy, SignOut, User as UserIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeMenuItems } from "@/components/theme-toggle";

const PAPEL_LABEL: [AppRole, string][] = [
  ["admin", "Administrador"],
  ["superintendente", "Superintendente"],
  ["gestor", "Gestor"],
  ["corretor", "Corretor"],
  ["sdr", "Pré-venda (SDR)"],
];

function papelPrincipal(roles: AppRole[]): string {
  return PAPEL_LABEL.find(([r]) => roles.includes(r))?.[1] ?? "";
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const letras = (partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "");
  return letras.toUpperCase() || "?";
}

export function MenuDaPessoa({
  collapsed,
  nome,
  email,
  roles,
  isCorretor,
  onNavigate,
  abrirOnboarding,
  handleSignOut,
}: {
  collapsed: boolean;
  nome: string;
  email: string | undefined;
  roles: AppRole[];
  isCorretor: boolean;
  onNavigate?: () => void;
  abrirOnboarding: () => void;
  handleSignOut: () => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu da conta"
          className={cn(
            "flex min-h-11 items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-claro/[0.05]",
            collapsed ? "mx-auto w-11 justify-center" : "min-w-0 flex-1 px-2",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-claro/10 text-xs font-semibold text-claro">
            {iniciais(nome)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-medium text-claro">{nome}</span>
                <span className="block truncate text-[11px] text-sidebar-foreground/55">
                  {papelPrincipal(roles)}
                </span>
              </span>
              <CaretUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/50" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? "right" : "top"} align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{nome}</span>
          {email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2">
          <Link to="/meu-perfil" onClick={onNavigate}>
            <UserIcon className="h-4 w-4" />
            Meu perfil
          </Link>
        </DropdownMenuItem>
        {isCorretor && (
          <DropdownMenuItem onClick={abrirOnboarding} className="gap-2">
            <Lifebuoy className="h-4 w-4" />
            Como usar o CRM
          </DropdownMenuItem>
        )}
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="gap-2">
          <SignOut className="h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
