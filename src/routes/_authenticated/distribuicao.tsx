import { createFileRoute, redirect } from "@tanstack/react-router";
import { useUserRoles } from "@/hooks/use-auth";
import {
  DistribuicaoCommandCenter,
  DISTRIBUICAO_TABS,
  type DistribuicaoTab,
} from "@/features/distribuicao/command-center";

// Central de Distribuição — o lugar único de configuração da distribuição.
// `?tab=` permite deep-link direto em qualquer aba; `?fila=` abre uma fila
// específica dentro da aba Filas.
//
// Compatibilidade de links antigos: as abas "zonas" e "origem" viraram a aba
// "filas", e os alertas do banco linkam `?tab=<slug da roleta>` (padrão de
// 20260709120400) — ambos os formatos caem em Filas com a fila selecionada.
const TAB_LEGADO: Record<string, string | undefined> = {
  zonas: undefined,
  origem: undefined,
  plantao: "plantao",
  marquinhos: "marquinhos",
  landing: "landing",
  base: "base",
  "zona-norte": "zona-norte",
  "zona-sul": "zona-sul",
  "zona-leste": "zona-leste",
  "zona-oeste": "zona-oeste",
};

export const Route = createFileRoute("/_authenticated/distribuicao")({
  validateSearch: (search: Record<string, unknown>): { tab?: DistribuicaoTab; fila?: string } => {
    const tab = typeof search.tab === "string" ? search.tab : undefined;
    const fila = typeof search.fila === "string" ? search.fila : undefined;
    if (tab && DISTRIBUICAO_TABS.includes(tab as DistribuicaoTab)) {
      return { tab: tab as DistribuicaoTab, fila };
    }
    if (tab && tab in TAB_LEGADO) {
      return { tab: "filas", fila: fila ?? TAB_LEGADO[tab] };
    }
    return { fila };
  },
  head: () => ({ meta: [{ title: "Distribuição — Seu Metro Quadrado" }] }),
  component: DistribuicaoRoute,
});

function DistribuicaoRoute() {
  const { isAdmin, isGestor, isSuperintendente, loading } = useUserRoles();
  const { tab, fila } = Route.useSearch();

  // Admin/gestor operam; superintendente vê (somente leitura); corretor não
  // acessa a central — a própria elegibilidade dele aparece em Meu Perfil.
  if (!loading && !isAdmin && !isGestor && !isSuperintendente) {
    throw redirect({ to: "/" });
  }

  return <DistribuicaoCommandCenter tab={tab} fila={fila} />;
}
