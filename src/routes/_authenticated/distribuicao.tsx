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
//
// Roletas por filial (12/10/2026): as seis roletas zona-* ficaram inativas e
// o link antigo abre a roleta da filial que herdou a zona (Oeste, Norte e Sul
// → Barra Funda; Centro e Leste → Liberdade; Grande SP → Belém). A Leste é
// atendida por duas lojas; o link cai na Liberdade, a primeira da ordem.
//
// Roletas simples (13/10/2026): Plantão, Landing e Base saíram — o link antigo
// abre a aba Roletas no grupo padrão (Campanhas).
const TAB_LEGADO: Record<string, string | undefined> = {
  zonas: undefined,
  origem: undefined,
  plantao: undefined,
  marquinhos: "marquinhos",
  landing: undefined,
  base: undefined,
  "zona-norte": "filial-barra-funda",
  "zona-sul": "filial-barra-funda",
  "zona-oeste": "filial-barra-funda",
  "zona-centro": "filial-liberdade",
  "zona-leste": "filial-liberdade",
  "zona-grande-sp": "filial-belem",
  "filial-barra-funda": "filial-barra-funda",
  "filial-liberdade": "filial-liberdade",
  "filial-belem": "filial-belem",
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
