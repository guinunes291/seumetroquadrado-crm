import { createFileRoute, useRouter } from "@tanstack/react-router";
import { OfertaAtivaPage } from "@/features/projetos/oferta-ativa-page";
import { ofertasAtivasQueryOptions } from "@/lib/oferta-ativa";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";

// Oferta Ativa é prospecção de base (listas segmentadas para campanha) — vive
// no mundo de Leads, com página própria. A antiga aba de /projetos redireciona
// para cá.
export const Route = createFileRoute("/_authenticated/oferta-ativa/")({
  head: () => ({ meta: [
    { title: "Oferta Ativa — Seu Metro Quadrado" },
    { name: "description", content: "Listas e progresso das campanhas de prospecção no CRM Seu Metro Quadrado." },
    { property: "og:title", content: "Oferta Ativa — Seu Metro Quadrado" },
    { property: "og:description", content: "Acompanhe contatos e avanços das listas de prospecção." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ofertasAtivasQueryOptions),
  pendingComponent: () => <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>,
  errorComponent: OfertaError,
  notFoundComponent: () => <p>Nenhuma lista encontrada.</p>,
  component: OfertaAtivaPage,
});

function OfertaError({ error }: { error: unknown }) {
  const router = useRouter();
  return <QueryErrorState title="Não foi possível carregar as listas ativas." error={error} onRetry={() => router.invalidate()} />;
}
