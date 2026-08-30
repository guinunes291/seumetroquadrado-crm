import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { useUserRoles } from "@/hooks/use-auth";
import { INTENT_BADGE } from "@/lib/status-tones";
import { GoogleCalendarCard } from "@/components/google-calendar-card";
import { GestaoConfigCard } from "@/features/gestao/gestao-config-card";
import { CorretoresPage } from "@/features/gestao/corretores-page";
import { EquipesPage } from "@/features/gestao/equipes-page";
import { TemplatesPage } from "@/features/gestao/templates-page";
import { DuplicatasPage } from "@/features/gestao/duplicatas-page";
import { LixeiraPage } from "@/features/gestao/lixeira-page";
import { EstoquePage } from "@/features/gestao/estoque-page";
import { CampanhasPage } from "@/features/gestao/campanhas-page";
import { Webhook, MessageCircle, Lock, User as UserIcon, BellRing } from "lucide-react";

// Configuração e cadastro do CRM (admin-only). O bloco administrativo que
// morava em /painel-gestor (Pessoas, Estoque, Campanhas, Comunicação,
// Qualidade) vive aqui desde a auditoria ux-ia-2026-08 (item 2.1): cadastro
// não é gestão de operação. Deep-links antigos ?tab= do painel redirecionam.
const CONFIG_TABS = [
  "integracoes",
  "gestao",
  // "follow-up" segue na whitelist SÓ para o redirect de deep-links antigos —
  // o editor da régua mudou para /follow-up?tab=config (auditoria 2026-08-27).
  "follow-up",
  "pessoas",
  "estoque",
  "campanhas",
  "comunicacao",
  "qualidade",
  "preferencias",
] as const;
type ConfigTab = (typeof CONFIG_TABS)[number];

export const Route = createFileRoute("/_authenticated/configuracoes")({
  validateSearch: (search: Record<string, unknown>): { tab?: ConfigTab } => ({
    tab:
      CONFIG_TABS.includes(search.tab as ConfigTab) && search.tab !== "integracoes"
        ? (search.tab as ConfigTab)
        : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.tab === "follow-up") {
      throw redirect({ to: "/follow-up", search: { tab: "config" }, replace: true });
    }
  },
  head: () => ({ meta: [{ title: "Configurações — Seu Metro Quadrado" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: ConfigTab = tab ?? "integracoes";
  const onTabChange = (v: string) =>
    navigate({
      search: {
        tab:
          CONFIG_TABS.includes(v as ConfigTab) && v !== "integracoes"
            ? (v as ConfigTab)
            : undefined,
      },
    });

  // Espera os papéis carregarem para não piscar "Acesso restrito" para o admin.
  if (rolesLoading) {
    return (
      <div
        className="space-y-6"
        role="status"
        aria-busy="true"
        aria-label="Carregando configurações"
      >
        <Skeleton className="h-14 w-full max-w-md rounded-md" />
        <Skeleton className="h-10 w-64 rounded-md" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      </div>
    );
  }

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
        description="Integrações, cadastros e preferências do CRM — a estrutura que sustenta a operação."
      />
      <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
          <TabsTrigger value="gestao">Gestão</TabsTrigger>
          {/* Bloco de cadastro/administração — veio do hub de Operação (2.1). */}
          <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
          <TabsTrigger value="comunicacao">Comunicação</TabsTrigger>
          <TabsTrigger value="qualidade">Qualidade</TabsTrigger>
          <TabsTrigger value="preferencias">Preferências</TabsTrigger>
        </TabsList>

        <TabsContent value="integracoes" className="grid gap-4 md:grid-cols-2">
          <GoogleCalendarCard />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Webhook className="h-4 w-4 text-info" /> API pública & Webhooks
                <Badge className={INTENT_BADGE.success}>Ativo</Badge>
              </CardTitle>
              <CardDescription>
                Captação de leads via webhook por projeto (token dedicado), webhook de landing pages
                e API de leitura (leads, corretores, vendas, comissões, projetos e métricas) sob{" "}
                <code>/api/public</code>.
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
                Notificações automáticas ao corretor no recebimento e na transferência de leads. Os
                envios manuais usam links wa.me com mensagem pré-preenchida e registram a interação
                na timeline do lead.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>

        <TabsContent value="gestao" className="grid gap-4 md:grid-cols-2">
          <GestaoConfigCard />
        </TabsContent>

        <TabsContent value="pessoas" className="space-y-10">
          <CorretoresPage />
          <EquipesPage />
        </TabsContent>
        <TabsContent value="estoque">
          <EstoquePage />
        </TabsContent>
        <TabsContent value="campanhas">
          <CampanhasPage />
        </TabsContent>
        <TabsContent value="comunicacao">
          <TemplatesPage />
        </TabsContent>
        <TabsContent value="qualidade" className="space-y-10">
          <DuplicatasPage />
          <LixeiraPage />
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
                Alertas de SLA, leads parados e lembretes de visita são gerados automaticamente e
                aparecem no sino do topo. Push no celular é ativado por usuário no perfil.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
