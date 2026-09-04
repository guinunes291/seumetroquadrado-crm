import { Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ArrowRight, MagnifyingGlass, SignOut } from "@phosphor-icons/react";
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
  badgeDoSistema,
  homeDoSistema,
  sistemasVisiveis,
  type PapelCtx,
  type Sistema,
} from "@/features/nav/sistemas";
import { CLASSES_MODULO } from "@/features/nav/cores-modulo";

// O hub vive fora do shell /_authenticated, então os hosts globais de lá
// (⌘K, Novo lead, Registrar venda) não existem aqui — sem estas cópias os
// atalhos ficariam mortos na primeira tela após o login. Todos só dependem
// de providers do __root (auth/queryClient), por isso funcionam fora do shell.
const CommandPalette = lazy(() =>
  import("@/components/command-palette").then(({ CommandPalette }) => ({
    default: CommandPalette,
  })),
);
const RegistrarVendaDialog = lazy(() =>
  import("@/components/registrar-venda-dialog").then(({ RegistrarVendaDialog }) => ({
    default: RegistrarVendaDialog,
  })),
);
const NovoLeadDialogHost = lazy(() =>
  import("@/features/leads/novo-lead-dialog").then(({ NovoLeadDialogHost }) => ({
    default: NovoLeadDialogHost,
  })),
);
// Agenda acionável do dia (decisão 2026-09-04): o corretor vê e resolve o
// próprio dia — confirmar, validar visita, remarcar — na primeira tela após o
// login, sem trocar de aba. Lazy: o hub continua leve para quem só passa.
const AgendaDoDiaCard = lazy(() =>
  import("@/features/agenda/agenda-do-dia-card").then(({ AgendaDoDiaCard }) => ({
    default: AgendaDoDiaCard,
  })),
);
// O popup de metas do dia precisa aparecer JÁ no hub: é a primeira tela após
// o login, e o corretor pode ir daqui direto para o Modo Visita.
const MetasDiaGlobal = lazy(() =>
  import("@/features/metas-dia/metas-dia-global").then(({ MetasDiaGlobal }) => ({
    default: MetasDiaGlobal,
  })),
);

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** "terça-feira, 2 de setembro" — a data por extenso substitui o eyebrow
 *  "CRM IMOBILIÁRIO" em caixa alta (identidade v3, decisão 12). */
function dataPorExtenso(): string {
  const s = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Quantos módulos visíveis têm pendência — a frase da faixa responde
 *  "o que me espera" antes de o corretor escolher por onde começar. */
function fraseDePendencias(n: number): string {
  if (n === 0) return "Escolha por onde você quer começar. Nada pendente por enquanto.";
  if (n === 1) return "Escolha por onde você quer começar. Um módulo tem pendências.";
  return `Escolha por onde você quer começar. ${n} módulos têm pendências.`;
}

/** Contagem 99+ para não estourar o layout. */
function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}

const GRID_CLASSES = "stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/**
 * Hub "Acesso aos Módulos": a primeira tela após o login. Vive FORA do shell
 * /_authenticated de propósito — sem sidebar, é um portal de passagem onde o
 * corretor escolhe em qual sistema vai trabalhar (a marca da sidebar traz de
 * volta para cá). Quais cards aparecem depende só do papel (registro SISTEMAS
 * em features/nav/sistemas — a mesma fonte da sidebar e do command palette).
 */
export function InicioPage() {
  const { user } = useAuth();
  const { roles, isAdmin, isGestor, isCorretor, isSuperintendente, loading } = useUserRoles();
  const badges = useNavBadges();

  const primeiroNome =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    (user?.user_metadata?.nome as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "corretor";

  const ctx: PapelCtx = { roles, isAdmin };
  // Papéis da OPERAÇÃO de venda (mesma lista de OPERACAO em nav/sistemas). O
  // escopo do card segue o papel (corretor: a própria; gestor: a equipe;
  // admin/superintendente: a operação). O SDR confirma visitas no hub /sdr.
  const temAgenda = isAdmin || isGestor || isCorretor || isSuperintendente;
  const visiveis = sistemasVisiveis(ctx);
  // Portal por FREQUÊNCIA (decisão 2026-08-30): a primeira dobra é "Seu dia"
  // — os 5 hubs do fluxo diário, na ordem do fluxo — e o que é referência
  // ocasional desce para "Consulta". A decisão "onde eu clico agora?" cai de
  // 8 opções iguais para 5 ordenadas.
  const comPendencia = visiveis.filter((s) => badgeDoSistema(s, badges, ctx) > 0).length;
  const operacao = visiveis.filter((s) => s.grupo === "operacao");
  const consulta = visiveis.filter((s) => s.grupo === "consulta");
  const gestao = visiveis.filter((s) => s.grupo === "gestao");

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
              <div className="text-xs text-muted-foreground">Acesso aos Módulos</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground gap-2"
              aria-label="Abrir busca global"
              onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
            >
              <MagnifyingGlass className="h-4 w-4" />
              <span className="hidden sm:inline">Buscar</span>
              <kbd className="hidden md:inline pointer-events-none rounded border bg-muted px-1.5 text-[10px] font-medium">
                ⌘K
              </kbd>
            </Button>
            <Suspense fallback={null}>
              <RegistrarVendaDialog />
            </Suspense>
            <ThemeToggle />
            <NotificationBell />
            <Button variant="ghost" onClick={handleSignOut} className="text-muted-foreground">
              <SignOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>
      {/* Mobile: tira das metas do dia, grudada sob o header (o card flutuante
          é só desktop). */}
      <div id="metas-dia-slot" className="sticky top-16 z-10 md:hidden" />

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
            <p className="text-sm text-white/75">{dataPorExtenso()}</p>
            <h1 className="font-display text-2xl font-semibold leading-tight md:text-3xl">
              {saudacao()}, {primeiroNome}
            </h1>
            <p className="text-sm text-white/80">
              {loading ? "Escolha por onde você quer começar." : fraseDePendencias(comPendencia)}
            </p>
          </div>
        </section>

        {!loading && temAgenda && (
          <Suspense fallback={<Skeleton className="h-40 rounded-xl" aria-busy="true" />}>
            <AgendaDoDiaCard />
          </Suspense>
        )}

        {loading ? (
          // Papéis ainda carregando: sem grade parcial, para os cards de gestão
          // não "pipocarem" depois (nem piscarem para quem não vai vê-los).
          // 5 células + o slot do cabeçalho = a primeira dobra ("Seu dia") de
          // qualquer papel, sem pulo vertical quando o conteúdo resolve.
          <section className="space-y-3" aria-busy="true">
            <Skeleton className="h-4 w-20" />
            <div className={GRID_CLASSES}>
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-44 rounded-xl" />
              ))}
            </div>
          </section>
        ) : (
          <>
            <GrupoDeSistemas titulo="Seu dia" sistemas={operacao} badges={badges} ctx={ctx} />
            <GrupoDeSistemas titulo="Consulta" sistemas={consulta} badges={badges} ctx={ctx} />
            <GrupoDeSistemas titulo="Gestão" sistemas={gestao} badges={badges} ctx={ctx} />
          </>
        )}
      </main>

      <Suspense fallback={null}>
        <CommandPalette />
        <NovoLeadDialogHost />
        <MetasDiaGlobal />
      </Suspense>
      <Toaster richColors closeButton />
    </div>
  );
}

function GrupoDeSistemas({
  titulo,
  sistemas,
  badges,
  ctx,
}: {
  titulo: string;
  sistemas: Sistema[];
  badges: ReturnType<typeof useNavBadges>;
  ctx: PapelCtx;
}) {
  if (sistemas.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-muted-foreground">{titulo}</h2>
      <div className={GRID_CLASSES}>
        {sistemas.map((s) => (
          <SistemaCard key={s.id} sistema={s} badge={badgeDoSistema(s, badges, ctx)} ctx={ctx} />
        ))}
      </div>
    </section>
  );
}

function SistemaCard({ sistema, badge, ctx }: { sistema: Sistema; badge: number; ctx: PapelCtx }) {
  const Icon = sistema.icon;
  // Cor fixa do módulo (identidade v3): o tile e a pílula de pendência leem
  // do registro — o corretor aprende "terracota = Follow-up" em um dia.
  const cor = CLASSES_MODULO[sistema.cor];
  return (
    // homeDoSistema resolve o destino (to + search) pelo papel — o BI, por
    // exemplo, leva o corretor ao /meu-raio-x e a gestão ao /painel-gestor.
    <Link
      {...homeDoSistema(sistema, ctx)}
      // TODOS os cards têm o mesmo tamanho (decisão 2026-08-30): o destaque
      // vive só no acento dourado do ícone — nada de col-span, que fazia a
      // Central de Comando ocupar duas células e quebrava o ritmo da grade.
      className="group flex min-h-44 flex-col rounded-xl border border-border-subtle bg-card p-5 shadow-elev-1 hover-lift press-scale hover:border-primary/40 hover:shadow-elev-2"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", cor.tile)}>
          <Icon className="h-5 w-5" />
        </span>
        {badge > 0 && (
          <span
            className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", cor.pill)}
          >
            {badgeText(badge)}
          </span>
        )}
      </div>
      <h3 className="mt-4 truncate font-display font-semibold">{sistema.titulo}</h3>
      {/* Espaço FIXO de 2 linhas: descrição curta ou longa, o card não muda
          de altura entre linhas da grade. */}
      <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
        {sistema.descricao}
      </p>
      <span className={cn("mt-auto flex items-center gap-1 pt-4 text-sm font-semibold", cor.text)}>
        Acessar
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
