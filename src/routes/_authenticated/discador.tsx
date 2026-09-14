// /discador — central de telefonia (3C Plus): conexão do agente, sessão de
// discagem sobre o Bolsão, aba Atendidos (quem atendeu, sem posse), KPIs do
// dia, histórico de chamadas e rediscagem. O conteúdo vive em
// features/telefonia.
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AtendidosDiscador } from "@/features/telefonia/atendidos-discador";
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
      {/* Atendidos: quem atendeu o discador (sem posse — segue no Bolsão até
          avançar de fase). Histórico: todas as chamadas. */}
      <Tabs defaultValue="atendidos">
        <TabsList>
          <TabsTrigger value="atendidos">Atendidos</TabsTrigger>
          <TabsTrigger value="historico">Histórico de chamadas</TabsTrigger>
        </TabsList>
        <TabsContent value="atendidos" className="pt-3">
          <AtendidosDiscador />
        </TabsContent>
        <TabsContent value="historico" className="pt-3">
          <DiscadorCentral />
        </TabsContent>
      </Tabs>
    </div>
  );
}
