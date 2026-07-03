import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { useUserRoles } from "@/hooks/use-auth";
import { INTENT_BADGE } from "@/lib/status-tones";
import {
  CalendarClock,
  Webhook,
  MessageCircle,
  Lock,
  User as UserIcon,
  BellRing,
} from "lucide-react";

type ConfigTab = "integracoes" | "preferencias";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  validateSearch: (search: Record<string, unknown>): { tab?: ConfigTab } => ({
    tab: search.tab === "preferencias" ? "preferencias" : undefined,
  }),
  head: () => ({ meta: [{ title: "Configurações — Seu Metro Quadrado" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { isAdmin } = useUserRoles();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: ConfigTab = tab ?? "integracoes";
  const onTabChange = (v: string) =>
    navigate({ search: { tab: v === "preferencias" ? "preferencias" : undefined } });

  if (!isAdmin) {
    return (
      <EmptyState
        icon={Lock}
        title="Acesso restrito"
        description="As configurações do CRM são visíveis apenas para administradores."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Integrações externas e preferências do CRM."
      />
      <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
          <TabsTrigger value="preferencias">Preferências</TabsTrigger>
        </TabsList>

        <TabsContent value="integracoes" className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-info" /> Google Agenda
                <Badge className={INTENT_BADGE.success}>Link ativo</Badge>
              </CardTitle>
              <CardDescription>
                Todo agendamento já oferece "Adicionar ao Google Agenda" e download .ics
                (Apple/Outlook). A sincronização automática por corretor (OAuth) chega na
                próxima fase — exigirá credenciais do Google Cloud.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" disabled title="Requer credenciais Google Cloud">
                Conectar conta Google — em breve
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Webhook className="h-4 w-4 text-info" /> API pública & Webhooks
                <Badge className={INTENT_BADGE.success}>Ativo</Badge>
              </CardTitle>
              <CardDescription>
                Captação de leads via webhook por projeto (token dedicado), webhook de
                landing pages e API de leitura (leads, corretores, vendas, comissões,
                projetos e métricas) sob <code>/api/public</code>.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="h-4 w-4 text-info" /> WhatsApp (Z-API)
                <Badge className={INTENT_BADGE.success}>Ativo</Badge>
              </CardTitle>
              <CardDescription>
                Notificações automáticas ao corretor no recebimento e na transferência de
                leads. Os envios manuais usam links wa.me com mensagem pré-preenchida e
                registram a interação na timeline do lead.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>

        <TabsContent value="preferencias" className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserIcon className="h-4 w-4 text-info" /> Perfil e conta
              </CardTitle>
              <CardDescription>
                Nome, telefone e opt-in de notificações push ficam no seu perfil.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" asChild>
                <Link to="/meu-perfil">Abrir meu perfil</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BellRing className="h-4 w-4 text-info" /> Notificações
              </CardTitle>
              <CardDescription>
                Alertas de SLA, leads parados e lembretes de visita são gerados
                automaticamente e aparecem no sino do topo. Push no celular é ativado por
                usuário no perfil.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
