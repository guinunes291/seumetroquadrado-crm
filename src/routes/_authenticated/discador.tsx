// /discador — central de telefonia (3C Plus): conexão do agente, sessão de
// discagem, KPIs do dia, histórico de chamadas (click-to-call, receptivo e
// campanhas) e rediscagem. O conteúdo vive em features/telefonia.
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { ConectarTcplus } from "@/features/telefonia/conectar-tcplus";
import { DiscadorCentral } from "@/features/telefonia/discador-page";
import { SessaoDiscagem } from "@/features/telefonia/sessao-discagem";

export const Route = createFileRoute("/_authenticated/discador")({
  head: () => ({ meta: [{ title: "Discador — Seu Metro Quadrado" }] }),
  component: DiscadorPage,
});

function DiscadorPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Discador"
        description="Suas ligações do 3C Plus num lugar só: o que você discou, o que tocou e o que ficou sem atender — com rediscagem em um clique."
      />
      {/* Conexão do agente (token) e a sessão funcionam mesmo antes da
          migration de `chamadas` (cada disco degrada para tel:), por isso
          vivem fora do gate da DiscadorCentral. */}
      <ConectarTcplus />
      <SessaoDiscagem />
      <DiscadorCentral />
    </div>
  );
}
