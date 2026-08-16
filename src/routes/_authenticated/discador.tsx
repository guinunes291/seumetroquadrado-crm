// /discador — central de telefonia (Sonax PABX): KPIs do dia, histórico de
// chamadas (click-to-call, receptivo e campanhas) e rediscagem. O conteúdo
// vive em features/telefonia.
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { DiscadorCentral } from "@/features/telefonia/discador-page";

export const Route = createFileRoute("/_authenticated/discador")({
  head: () => ({ meta: [{ title: "Discador — Seu Metro Quadrado" }] }),
  component: DiscadorPage,
});

function DiscadorPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Discador"
        description="Suas ligações do PABX num lugar só: o que você discou, o que tocou e o que ficou sem atender — com rediscagem em um clique."
      />
      <DiscadorCentral />
    </div>
  );
}
