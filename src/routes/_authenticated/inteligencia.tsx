import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { RequireRole } from "@/components/require-role";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InsightsPanel } from "@/features/inteligencia/insights-panel";
import { ORIGEM_OPTIONS } from "@/features/leads/novo-lead-dialog";
import type { FiltrosInteligencia } from "@/features/inteligencia/queries";

// Recharts (~105KB gz) só desce quando esta tela abre — cada aba hidrata sob
// demanda; os insights (topo da aba Relatórios) pintam primeiro (P3-13).
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

type IntelTab = "relatorios" | "funil" | "gargalos" | "performance";
const INTEL_TABS: IntelTab[] = ["relatorios", "funil", "gargalos", "performance"];

const isData = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Inteligência: hub analítico da gestão — Relatórios (o que está acontecendo),
// Funil (coorte × snapshot), Gargalos (ranking por impacto R$) e Performance
// (time). Filtros persistem na URL para compartilhar leituras por link.
// Superfície org-wide → só gestão (RequireRole); corretor não vê o funil da
// empresa. /relatorios, /dashboard e /hoje?tab=analytics redirecionam para cá.
export const Route = createFileRoute("/_authenticated/inteligencia")({
  head: () => ({ meta: [{ title: "Inteligência — Seu Metro Quadrado" }] }),
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    tab?: IntelTab;
    de?: string;
    ate?: string;
    corretor?: string;
    origem?: string;
  } => ({
    tab: INTEL_TABS.includes(search.tab as IntelTab) ? (search.tab as IntelTab) : undefined,
    de: isData(search.de) ? search.de : undefined,
    ate: isData(search.ate) ? search.ate : undefined,
    corretor: typeof search.corretor === "string" && search.corretor ? search.corretor : undefined,
    origem: typeof search.origem === "string" && search.origem ? search.origem : undefined,
  }),
  component: InteligenciaPage,
});

function ChartsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando relatórios">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

/** Início padrão: 1º dia do mês, 2 meses atrás (3 meses de janela). */
function defaultDe(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 2, 1).toISOString().slice(0, 10);
}

function InteligenciaPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: IntelTab = search.tab ?? "relatorios";

  const setSearch = (patch: Record<string, string | undefined>) =>
    navigate({
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev, ...patch };
        for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
        return next;
      },
    });

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

  const mostraFiltros = tab === "funil" || tab === "gargalos";

  return (
    <RequireRole allow={["admin", "gestor", "superintendente"]}>
      <div className="space-y-6">
        <PageHeader
          title="Inteligência"
          description="O que está funcionando, onde o funil vaza e para onde o mês caminha — com a evidência logo abaixo."
        />

        <Tabs value={tab} onValueChange={(v) => setSearch({ tab: v === "relatorios" ? undefined : v })}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
            <TabsTrigger value="funil">Funil</TabsTrigger>
            <TabsTrigger value="gargalos">Gargalos</TabsTrigger>
            <TabsTrigger value="performance">Time</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filtros persistentes na URL (compartilháveis por link) */}
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
            {tab === "funil" && (
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
                      {o.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {tab === "relatorios" && (
          <>
            <InsightsPanel />
            <Suspense fallback={<ChartsSkeleton />}>
              <RelatoriosView />
            </Suspense>
          </>
        )}
        {tab === "funil" && (
          <Suspense fallback={<ChartsSkeleton />}>
            <FunilView filtros={filtros} origem={search.origem ?? null} />
          </Suspense>
        )}
        {tab === "gargalos" && (
          <Suspense fallback={<ChartsSkeleton />}>
            <GargalosView filtros={filtros} />
          </Suspense>
        )}
        {tab === "performance" && (
          <Suspense fallback={<ChartsSkeleton />}>
            <PerformanceView
              corretorDrill={search.corretor ?? null}
              onDrillChange={(id) => setSearch({ corretor: id ?? undefined })}
            />
          </Suspense>
        )}
      </div>
    </RequireRole>
  );
}
