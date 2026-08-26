import { Link } from "@tanstack/react-router";
import { ArrowRight, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useNavBadges } from "@/features/nav/use-nav-badges";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  MODULOS,
  badgeDoModulo,
  modulosVisiveis,
  type Modulo,
  type PapelCtx,
} from "@/features/inicio/modulos";

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Contagem 99+ para não estourar o layout. */
function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}

const GRID_CLASSES = "stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/**
 * Hub "Acesso aos Módulos": a primeira tela após o login. Vive FORA do shell
 * /_authenticated de propósito — sem sidebar, é um portal de passagem onde o
 * corretor escolhe em qual módulo vai trabalhar (a marca da sidebar traz de
 * volta para cá). Quais cards aparecem depende só do papel (MODULOS).
 */
export function InicioPage() {
  const { user } = useAuth();
  const { roles, isAdmin, loading } = useUserRoles();
  const badges = useNavBadges();

  const primeiroNome =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    (user?.user_metadata?.nome as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "corretor";

  const ctx: PapelCtx = { roles, isAdmin };
  const visiveis = modulosVisiveis(MODULOS, ctx);
  const operacao = visiveis.filter((m) => m.grupo === "operacao");
  const gestao = visiveis.filter((m) => m.grupo === "gestao");

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen bg-background bg-ambient">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 md:px-8">
          <div className="flex items-center gap-3">
            <img
              src="/icons/icon-192.png"
              alt="Seu Metro Quadrado"
              className="h-9 w-9 shrink-0 rounded-md bg-white object-contain shadow-elev-1"
            />
            <div className="leading-tight">
              <div className="font-display text-sm font-semibold">Seu Metro Quadrado</div>
              <div className="text-[11px] tracking-wide text-gold-600 dark:text-gold-300">
                Acesso aos Módulos
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
            <Button variant="ghost" onClick={handleSignOut} className="text-muted-foreground">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8 md:py-8">
        <section className="relative overflow-hidden rounded-xl bg-gradient-command p-6 text-white shadow-elev-2 md:p-8">
          {/* luz ambiente estática (pintada 1x), como no painel do /auth */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(720px 420px at 78% -8%, oklch(0.77 0.11 85 / 0.1), transparent 65%)",
            }}
          />
          <div className="relative space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold-300">
              CRM Imobiliário
            </p>
            <h1 className="font-display text-2xl font-semibold leading-tight md:text-3xl">
              {saudacao()}, {primeiroNome}
            </h1>
            <p className="text-sm text-white/80">Escolha por onde você quer começar.</p>
          </div>
        </section>

        {loading ? (
          // Papéis ainda carregando: sem grade parcial, para os cards de gestão
          // não "pipocarem" depois (nem piscarem para quem não vai vê-los).
          <div className={GRID_CLASSES} aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className={cn("h-44 rounded-xl", i === 0 && "sm:col-span-2")} />
            ))}
          </div>
        ) : (
          <>
            <div className={GRID_CLASSES}>
              {operacao.map((m) => (
                <ModuloCard key={m.id} modulo={m} badge={badgeDoModulo(m, badges, ctx)} />
              ))}
            </div>

            {gestao.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Gestão
                </h2>
                <div className={GRID_CLASSES}>
                  {gestao.map((m) => (
                    <ModuloCard key={m.id} modulo={m} badge={badgeDoModulo(m, badges, ctx)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <Toaster richColors closeButton />
    </div>
  );
}

function ModuloCard({ modulo, badge }: { modulo: Modulo; badge: number }) {
  const Icon = modulo.icon;
  return (
    <Link
      to={modulo.to}
      search={modulo.search}
      className={cn(
        "group flex min-h-44 flex-col rounded-xl border border-border-subtle bg-card p-5 shadow-elev-1 hover-lift press-scale hover:border-primary/40",
        modulo.destaque && "sm:col-span-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            modulo.destaque
              ? "bg-gold-500/15 text-gold-600 dark:text-gold-300"
              : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        {badge > 0 && (
          <span className="rounded-full bg-gold-500/15 px-2 py-0.5 text-xs font-medium tabular-nums text-gold-600 dark:text-gold-300">
            {badgeText(badge)}
          </span>
        )}
      </div>
      <h3 className="mt-4 font-display font-semibold">{modulo.titulo}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{modulo.descricao}</p>
      <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-medium text-primary">
        Acessar
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
