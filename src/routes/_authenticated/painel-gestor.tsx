import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PainelDiaView } from "@/features/gestao/painel-dia/painel-dia-view";
import { InsightsPanel } from "@/features/inteligencia/insights-panel";
import { LeadsPorCorretorPage } from "@/features/gestao/leads-por-corretor-page";
import { MetasPage } from "@/routes/_authenticated/metas";
import { ORIGEM_OPTIONS } from "@/features/leads/novo-lead-dialog";
import type { FiltrosInteligencia } from "@/features/inteligencia/queries";
import { origemLabel } from "@/lib/origem";

// Recharts (~105KB gz) só desce quando uma aba analítica abre — mesmo padrão
// que a antiga /inteligencia usava.
const RelatoriosView = lazy(() =>
  import("@/features/dashboard/relatorios-view").then(({ RelatoriosView }) => ({
    default: RelatoriosView,
  })),
);
const FunilView = lazy(() =>
  import("@/features/inteligencia/funil-view").then(({ FunilView }) => ({ default: FunilView })),
);
const GargalosView = lazy(() =>
  import("@/features/inteligencia/gargalos-view").then(({ GargalosView }) => ({
    default: GargalosView,
  })),
);
const PerformanceView = lazy(() =>
  import("@/features/inteligencia/performance-view").then(({ PerformanceView }) => ({
    default: PerformanceView,
  })),
);

type GestaoTab = "dia" | "relatorios" | "funil" | "gargalos" | "time" | "metas" | "leads-corretor";
const GESTAO_TABS: GestaoTab[] = [
  "dia",
  "relatorios",
  "funil",
  "gargalos",
  "time",
  "metas",
  "leads-corretor",
];

// Bloco administrativo mudou de casa (auditoria ux-ia-2026-08, item 2.1):
// cadastro e configuração são /configuracoes, não gestão de operação. Os
// deep-links antigos ?tab=pessoas|estoque|… redirecionam no beforeLoad.
const TABS_ADMIN_MOVIDAS = ["pessoas", "estoque", "campanhas", "comunicacao", "qualidade"] as const;
type TabAdminMovida = (typeof TABS_ADMIN_MOVIDAS)[number];

// Deep-links antigos continuam funcionando: abas aposentadas/renomeadas e a
// antiga /inteligencia mapeiam para as abas novas.
const TAB_LEGADO: Record<string, GestaoTab> = {
  visao: "dia",
  saude: "time",
  performance: "time",
};

const isData = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// HUB DE OPERAÇÃO: consolida o antigo trio Gestão + Inteligência + Metas
// (Desempenho) em um só lugar — Dia, Relatórios, Funil, Gargalos, Time,
// Metas e Leads por corretor. O bloco administrativo (Pessoas, Estoque,
// Campanhas, Comunicação, Qualidade) mudou para /configuracoes (item 2.1);
// /inteligencia e /metas redirecionam para cá.
export const Route = createFileRoute("/_authenticated/painel-gestor")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    tab?: GestaoTab | "distribuicao" | TabAdminMovida;
    de?: string;
    ate?: string;
    corretor?: string;
    origem?: string;
  } => ({
    // "distribuicao" e as abas admin movidas passam CRUAS de propósito: o
    // beforeLoad precisa lê-las para redirecionar o deep-link antigo — se o
    // validateSearch as apagasse, o link cairia mudo na aba Dia.
    tab:
      search.tab === "distribuicao"
        ? "distribuicao"
        : TABS_ADMIN_MOVIDAS.includes(search.tab as TabAdminMovida)
          ? (search.tab as TabAdminMovida)
          : GESTAO_TABS.includes(search.tab as GestaoTab)
            ? (search.tab as GestaoTab)
            : TAB_LEGADO[search.tab as string],
    de: isData(search.de) ? search.de : undefined,
    ate: isData(search.ate) ? search.ate : undefined,
    corretor: typeof search.corretor === "string" && search.corretor ? search.corretor : undefined,
    origem: typeof search.origem === "string" && search.origem ? search.origem : undefined,
  }),
  beforeLoad: ({ search }) => {
    // A antiga aba "distribuicao" virou a página /distribuicao.
    if (search.tab === "distribuicao") {
      throw redirect({ to: "/distribuicao", search: {} });
    }
    // O bloco admin virou abas de /configuracoes (item 2.1) — deep-link antigo
    // continua abrindo a MESMA tela, só que na casa nova.
    if (TABS_ADMIN_MOVIDAS.includes(search.tab as TabAdminMovida)) {
      throw redirect({ to: "/configuracoes", search: { tab: search.tab as TabAdminMovida } });
    }
  },
  head: () => ({ meta: [{ title: "Operação — Seu Metro Quadrado" }] }),
  component: PainelGestorPage,
});

function AbaSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** Início padrão dos filtros analíticos: 1º dia do mês, 2 meses atrás. */
function defaultDe(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 2, 1).toISOString().slice(0, 10);
}

function PainelGestorPage() {
  const { isAdmin, isGestor, isSuperintendente, loading } = useUserRoles();
  const podeVer = isAdmin || isGestor || isSuperintendente;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  // "distribuicao" e abas admin movidas nunca chegam aqui (redirect no
  // beforeLoad) — o narrowing é só para o TypeScript.
  const activeTab: GestaoTab =
    search.tab && GESTAO_TABS.includes(search.tab as GestaoTab) ? (search.tab as GestaoTab) : "dia";

  const setSearch = (patch: Record<string, string | undefined>) =>
    navigate({
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev, ...patch };
        for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
        return next;
      },
    });
  const onTabChange = (v: string) => setSearch({ tab: v === "dia" ? undefined : v });

  const filtros: FiltrosInteligencia = useMemo(
    () => ({
      de: search.de ?? defaultDe(),
      ate: search.ate ?? null,
      corretor: search.corretor ?? null,
    }),
    [search.de, search.ate, search.corretor],
  );

  const { data: corretores } = useQuery({
    queryKey: ["corretores-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Guarda real: corretor não acessa o hub de Gestão. Enquanto os papéis
  // carregam, evita o flash redirecionando só depois.
  if (!loading && !podeVer) {
    throw redirect({ to: "/" });
  }
  if (loading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const mostraFiltros = activeTab === "funil" || activeTab === "gargalos";

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="dia">Dia</TabsTrigger>
        <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
        <TabsTrigger value="funil">Funil</TabsTrigger>
        <TabsTrigger value="gargalos">Gargalos</TabsTrigger>
        <TabsTrigger value="time">Time</TabsTrigger>
        <TabsTrigger value="metas">Metas & Ritmo</TabsTrigger>
        <TabsTrigger value="leads-corretor">Leads por Corretor</TabsTrigger>
      </TabsList>

      {/* Filtros persistentes na URL das abas analíticas (compartilháveis) */}
      {mostraFiltros && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={filtros.de ?? ""}
            onChange={(e) => setSearch({ de: e.target.value || undefined })}
            className="w-40"
            aria-label="De"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            value={search.ate ?? ""}
            onChange={(e) => setSearch({ ate: e.target.value || undefined })}
            className="w-40"
            aria-label="Até (vazio = hoje)"
          />
          <Select
            value={search.corretor ?? "all"}
            onValueChange={(v) => setSearch({ corretor: v === "all" ? undefined : v })}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Corretor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os corretores</SelectItem>
              {(corretores ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeTab === "funil" && (
            <Select
              value={search.origem ?? "all"}
              onValueChange={(v) => setSearch({ origem: v === "all" ? undefined : v })}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                {ORIGEM_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {origemLabel(o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <TabsContent value="dia">
        <PainelDiaView />
      </TabsContent>
      <TabsContent value="relatorios" className="space-y-6">
        <InsightsPanel />
        <Suspense fallback={<AbaSkeleton />}>
          <RelatoriosView />
        </Suspense>
      </TabsContent>
      <TabsContent value="funil">
        <Suspense fallback={<AbaSkeleton />}>
          <FunilView filtros={filtros} origem={search.origem ?? null} />
        </Suspense>
      </TabsContent>
      <TabsContent value="gargalos">
        <Suspense fallback={<AbaSkeleton />}>
          <GargalosView filtros={filtros} />
        </Suspense>
      </TabsContent>
      <TabsContent value="time">
        <Suspense fallback={<AbaSkeleton />}>
          <PerformanceView
            corretorDrill={search.corretor ?? null}
            onDrillChange={(id) => setSearch({ corretor: id ?? undefined })}
          />
        </Suspense>
      </TabsContent>
      <TabsContent value="metas">
        <MetasPage />
      </TabsContent>
      <TabsContent value="leads-corretor">
        <LeadsPorCorretorPage />
      </TabsContent>
    </Tabs>
  );
}
