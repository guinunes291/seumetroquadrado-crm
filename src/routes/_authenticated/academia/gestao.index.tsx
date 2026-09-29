import { createFileRoute } from "@tanstack/react-router";
import { AcademiaGestaoGuard } from "@/features/academia/gestao/guard-gestao";
import { ABAS_GESTAO, type AbaGestao } from "@/features/academia/gestao/abas";
import { GestaoPage } from "@/features/academia/gestao/gestao-page";

export const Route = createFileRoute("/_authenticated/academia/gestao/")({
  validateSearch: (search: Record<string, unknown>): { tab?: AbaGestao } => ({
    tab: ABAS_GESTAO.find((a) => a === search.tab),
  }),
  head: () => ({ meta: [{ title: "Gestão da Academia · Seu Metro Quadrado" }] }),
  component: GestaoRota,
});

function GestaoRota() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AcademiaGestaoGuard>
      <GestaoPage aba={tab} onAbaChange={(aba) => void navigate({ search: { tab: aba } })} />
    </AcademiaGestaoGuard>
  );
}
