import { Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useNavBadges } from "@/features/nav/use-nav-badges";
import { Skeleton } from "@/components/ui/skeleton";
import {
  badgeDoSistema,
  homeDoSistema,
  sistemasVisiveis,
  SISTEMAS_NAV,
  type PapelCtx,
  type Sistema,
} from "@/features/nav/sistemas";
import { useFlagsNav } from "@/features/academia/use-flags-nav";
import { CardProximaAula } from "@/features/academia/card-proxima-aula";

// Agenda acionável do dia (decisão 2026-09-04): o corretor vê e resolve o
// próprio dia — confirmar, validar visita, remarcar — na primeira tela após o
// login, sem trocar de aba. Lazy: o hub continua leve para quem só passa.
const AgendaDoDiaCard = lazy(() =>
  import("@/features/agenda/agenda-do-dia-card").then(({ AgendaDoDiaCard }) => ({
    default: AgendaDoDiaCard,
  })),
);

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** "terça-feira, 2 de setembro" — vira o eyebrow dourado em caixa alta. */
function dataPorExtenso(): string {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Quantos módulos visíveis têm pendência — a frase responde "o que me
 *  espera" antes de o corretor escolher por onde começar. */
function fraseDePendencias(n: number): string {
  if (n === 0) return "Escolha por onde começar. Nada pendente por enquanto.";
  if (n === 1) return "Escolha por onde começar. Um módulo tem pendências.";
  return `Escolha por onde começar. ${n} módulos têm pendências.`;
}

/** Contagem 99+ para não estourar o layout. */
function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}

// Cinco colunas no desktop largo, como no vídeo: com a ordem do registro
// (o dia primeiro, a consulta depois), a primeira linha É o dia do corretor —
// Central, Prospecção, Carteira, Visita e Follow-Up — sem precisar de título
// de grupo.
const GRID_CLASSES = "stagger-children grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";

const ORDEM_GRUPO: Record<Sistema["grupo"], number> = { operacao: 0, consulta: 1, gestao: 2 };

/**
 * Hub "Acesso aos Módulos": a primeira tela após o login. Desde a identidade
 * Lançamento (2026-10) mora dentro do shell — a sidebar já lista os módulos,
 * e aqui eles aparecem como cards com a descrição e a pendência de cada um.
 * Quais cards aparecem depende só do papel (registro SISTEMAS em
 * features/nav/sistemas — a mesma fonte da sidebar e do command palette).
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

  const flagsLigadas = useFlagsNav();
  const ctx: PapelCtx = { roles, isAdmin, flagsLigadas };
  // Papéis da OPERAÇÃO de venda (mesma lista de OPERACAO em nav/sistemas). O
  // escopo do card segue o papel (corretor: a própria; gestor: a equipe;
  // admin/superintendente: a operação). O SDR confirma visitas no hub /sdr.
  const temAgenda = isAdmin || isGestor || isCorretor || isSuperintendente;
  // Portal por FREQUÊNCIA (decisão 2026-08-30): o dia primeiro, a consulta
  // depois. A ordenação é estável — dentro do grupo vale a ordem do registro.
  // Configurações não vira card: não é módulo de trabalho e já mora no rodapé
  // da sidebar (como no vídeo).
  const visiveis = sistemasVisiveis(ctx, SISTEMAS_NAV)
    .filter((s) => s.id !== "configuracoes")
    .sort((a, b) => ORDEM_GRUPO[a.grupo] - ORDEM_GRUPO[b.grupo]);
  const comPendencia = visiveis.filter((s) => badgeDoSistema(s, badges, ctx) > 0).length;

  return (
    <div className="space-y-8">
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-700 dark:text-gold-400">
          {dataPorExtenso()}
        </p>
        <h1 className="font-display text-3xl font-bold leading-tight tracking-tight md:text-[2.75rem]">
          {saudacao()}, {primeiroNome}.
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          {loading ? "Escolha por onde começar." : fraseDePendencias(comPendencia)}
        </p>
      </section>

      {loading ? (
        // Papéis ainda carregando: sem grade parcial, para os cards de gestão
        // não "pipocarem" depois (nem piscarem para quem não vai vê-los).
        // 5 células = a primeira linha de qualquer papel, sem pulo vertical
        // quando o conteúdo resolve.
        <div className={GRID_CLASSES} aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : (
        <nav aria-label="Módulos">
          <ul className={GRID_CLASSES}>
            {visiveis.map((s) => (
              <li key={s.id} className="flex">
                <SistemaCard sistema={s} badge={badgeDoSistema(s, badges, ctx)} ctx={ctx} />
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Atrás da flag academia_card_inicio E da participação ativa: sem as
          duas, o componente devolve null. */}
      {!loading && <CardProximaAula />}

      {/* A agenda do dia desceu para baixo da grade (o vídeo abre direto nos
          módulos), mas continua na primeira tela após o login. */}
      {!loading && temAgenda && (
        <Suspense fallback={<Skeleton className="h-40 rounded-xl" aria-busy="true" />}>
          <AgendaDoDiaCard />
        </Suspense>
      )}
    </div>
  );
}

function SistemaCard({ sistema, badge, ctx }: { sistema: Sistema; badge: number; ctx: PapelCtx }) {
  const Icon = sistema.icon;
  return (
    // homeDoSistema resolve o destino (to + search) pelo papel — o BI, por
    // exemplo, leva o corretor ao /meu-raio-x e a gestão ao /painel-gestor.
    //
    // Monocromático (identidade Lançamento): ícone navy num quadrado claro,
    // pendência num ponto vermelho e o dourado só no contorno do hover. A
    // cor por módulo da v3 saiu da tela — o nome e o ícone já identificam.
    <Link
      {...homeDoSistema(sistema, ctx)}
      className="group flex min-h-48 w-full flex-col rounded-xl border border-border-subtle bg-card p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-gold-500/70 hover:shadow-elev-2 focus-visible:border-gold-500 press-scale motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-primary dark:text-foreground">
          <Icon className="h-5 w-5" weight="regular" />
        </span>
        {badge > 0 && (
          <span
            aria-label={`${badge} pendências`}
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold tabular-nums text-destructive-foreground"
          >
            {badgeText(badge)}
          </span>
        )}
      </div>
      <h2 className="mt-4 font-display text-base font-bold leading-snug">{sistema.titulo}</h2>
      <p className="mt-1 line-clamp-3 flex-1 text-[13px] leading-relaxed text-muted-foreground">
        {sistema.descricao}
      </p>
      <span className="mt-3 flex items-center gap-1 text-[13px] font-semibold text-primary dark:text-foreground">
        Acessar
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
