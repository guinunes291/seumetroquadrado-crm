import { createFileRoute } from "@tanstack/react-router";
import { RequireRole } from "@/components/require-role";
import { SdrPage, type SdrTab } from "@/features/sdr/sdr-page";

// Hub do SDR (pré-venda, 2026-09-04). Só o papel sdr (e o admin, que enxerga
// tudo) entra; corretor cai no /inicio. A proteção de dados é a RLS.
const TABS: SdrTab[] = ["reaquecer", "entregues", "agenda", "raio-x"];

export const Route = createFileRoute("/_authenticated/sdr")({
  head: () => ({ meta: [{ title: "Pré-venda (SDR) — Seu Metro Quadrado" }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: SdrTab } => ({
    tab: TABS.includes(search.tab as SdrTab) ? (search.tab as SdrTab) : undefined,
  }),
  component: SdrRoute,
});

function SdrRoute() {
  const { tab } = Route.useSearch();
  return (
    <RequireRole allow={["sdr", "admin"]} redirectTo="/inicio">
      <SdrPage tab={tab} />
    </RequireRole>
  );
}
