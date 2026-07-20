// Central de Distribuição — página /distribuicao (distribuição v3).
// Dashboard de saúde + 8 abas: visão geral, 3 roletas, exceções, histórico,
// configurações (admin) e auditoria.

import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlarmClock,
  AlertTriangle,
  Bot,
  CalendarClock,
  Globe,
  Inbox,
  Percent,
  Play,
  ShieldAlert,
  Users,
  Webhook,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRoles } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { syncMetricWebhookTokenFn } from "@/lib/metric-webhook.functions";
import { DISTRIBUICAO_KEYS, useDistribuicaoResumo, useRodarDistribuicao } from "./queries";
import { TabVisaoGeral } from "./tab-visao-geral";
import { RoletaTab } from "./roleta-tab";
import { TabExcecoes } from "./tab-excecoes";
import { TabHistorico } from "./tab-historico";
import { TabConfiguracoes } from "./tab-configuracoes";
import { TabAuditoria } from "./tab-auditoria";

export type DistribuicaoTab =
  | "visao"
  | "plantao"
  | "marquinhos"
  | "landing"
  | "excecoes"
  | "historico"
  | "config"
  | "auditoria";

export const DISTRIBUICAO_TABS: DistribuicaoTab[] = [
  "visao",
  "plantao",
  "marquinhos",
  "landing",
  "excecoes",
  "historico",
  "config",
  "auditoria",
];

export function DistribuicaoCommandCenter({ tab }: { tab?: DistribuicaoTab }) {
  const { isAdmin } = useUserRoles();
  // Distribuição é operação org-wide: só admin opera. Gestor e superintendente
  // enxergam em modo leitura (decisão de produto — sem recorte por equipe).
  const somenteLeitura = !isAdmin;
  const navigate = useNavigate();
  const activeTab: DistribuicaoTab = tab ?? "visao";
  const setTab = (v: string) =>
    navigate({
      to: "/distribuicao",
      search: { tab: v === "visao" ? undefined : (v as DistribuicaoTab) },
    });

  const resumoQ = useDistribuicaoResumo();
  const rodar = useRodarDistribuicao();

  const syncToken = useServerFn(syncMetricWebhookTokenFn);
  const syncTokenMut = useMutation({
    mutationFn: async () => await syncToken(),
    onSuccess: () => toast.success("Token do webhook n8n sincronizado."),
    onError: (e: Error) => toast.error(`Falha ao sincronizar token: ${e.message}`),
  });

  // Push em vez de polling: eventos das tabelas da distribuição (publicadas
  // no realtime pela migration 20260709120600) invalidam as queries da
  // central. A tabela `leads` fica de fora de propósito: cada drag/edição de
  // lead org-wide re-executaria o resumo pesado — o distribution_log já
  // captura toda transição relevante para esta página.
  useRealtimeInvalidate(
    ["distribution_log", "distribuicao_excecoes", "roleta_participantes"],
    DISTRIBUICAO_KEYS.map((k) => [...k]),
  );

  const r = resumoQ.data;
  const loading = resumoQ.isLoading;

  return (
    <div>
      <PageHeader
        title="Central de Distribuição"
        description="As 3 roletas (Plantão · Marquinhos · Landing Page), fila de exceções, histórico e regras — tudo auditável."
        actions={
          somenteLeitura ? undefined : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncTokenMut.mutate()}
                disabled={syncTokenMut.isPending}
              >
                <Webhook className="mr-1.5 h-4 w-4" />
                Sincronizar token n8n
              </Button>
              <Button size="sm" onClick={() => rodar.mutate()} disabled={rodar.isPending}>
                <Play className="mr-1.5 h-4 w-4" />
                {rodar.isPending ? "Rodando…" : "Rodar agora"}
              </Button>
            </>
          )
        }
      />

      {/* Dashboard de saúde da distribuição */}
      <StatGrid className="mb-6 xl:grid-cols-5">
        <StatTile
          title="Distribuídos hoje"
          value={r?.distribuidos_hoje ?? "—"}
          icon={Zap}
          intent="success"
          loading={loading}
        />
        <StatTile
          title="Aguardando distribuição"
          value={r?.aguardando_distribuicao ?? "—"}
          icon={Inbox}
          intent={(r?.aguardando_distribuicao ?? 0) > 0 ? "warning" : "neutral"}
          loading={loading}
          hint="sem corretor na base"
        />
        <StatTile
          title="Fila de exceções"
          value={r?.excecoes_pendentes ?? "—"}
          icon={ShieldAlert}
          intent={(r?.excecoes_pendentes ?? 0) > 0 ? "danger" : "success"}
          loading={loading}
          onClick={() => setTab("excecoes")}
          hint={(r?.excecoes_pendentes ?? 0) > 0 ? "exige ação da gestão" : "nenhum lead preso"}
        />
        <StatTile
          title="Sem atendimento"
          value={r?.sem_atendimento ?? "—"}
          icon={AlarmClock}
          intent={(r?.sem_atendimento ?? 0) > 0 ? "warning" : "neutral"}
          loading={loading}
          hint="acima do tempo máximo"
        />
        <StatTile
          title="Erros 24h"
          value={r?.erros_24h ?? "—"}
          icon={AlertTriangle}
          intent={(r?.erros_24h ?? 0) > 0 ? "danger" : "success"}
          loading={loading}
          onClick={() => setTab("historico")}
        />
        <StatTile
          title="Aptos · Plantão"
          value={r?.aptos_plantao ?? "—"}
          icon={Users}
          intent={(r?.aptos_plantao ?? 0) === 0 ? "danger" : "info"}
          loading={loading}
          onClick={() => setTab("plantao")}
        />
        <StatTile
          title="Aptos · Marquinhos"
          value={r?.aptos_marquinhos ?? "—"}
          icon={Bot}
          intent={(r?.aptos_marquinhos ?? 0) === 0 ? "danger" : "info"}
          loading={loading}
          onClick={() => setTab("marquinhos")}
        />
        <StatTile
          title="Aptos · Landing"
          value={r?.aptos_landing ?? "—"}
          icon={Globe}
          intent={(r?.aptos_landing ?? 0) === 0 ? "danger" : "info"}
          loading={loading}
          onClick={() => setTab("landing")}
        />
        <StatTile
          title="Parados (régua de horas)"
          value={r?.parados_timeout ?? "—"}
          icon={CalendarClock}
          intent={(r?.parados_timeout ?? 0) > 0 ? "warning" : "neutral"}
          loading={loading}
          hint="aguardando além do timeout"
        />
        <StatTile
          title="% médio trabalhado"
          value={r ? `${r.pct_medio_trabalhado}%` : "—"}
          icon={Percent}
          intent={(r?.pct_medio_trabalhado ?? 100) < 90 ? "warning" : "success"}
          loading={loading}
          hint="participantes do plantão"
        />
      </StatGrid>

      <Tabs value={activeTab} onValueChange={setTab} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="visao">Visão Geral</TabsTrigger>
          <TabsTrigger value="plantao">Roleta Plantão</TabsTrigger>
          <TabsTrigger value="marquinhos">Roleta Marquinhos</TabsTrigger>
          <TabsTrigger value="landing">Roleta Landing</TabsTrigger>
          <TabsTrigger value="excecoes">
            Exceções
            {(r?.excecoes_pendentes ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 text-[11px] font-semibold text-destructive tabular-nums">
                {r?.excecoes_pendentes}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          {isAdmin && <TabsTrigger value="config">Configurações</TabsTrigger>}
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="visao">
          <TabVisaoGeral onVerExcecoes={() => setTab("excecoes")} />
        </TabsContent>
        <TabsContent value="plantao">
          <RoletaTab slug="plantao" somenteLeitura={somenteLeitura} />
        </TabsContent>
        <TabsContent value="marquinhos">
          <RoletaTab slug="marquinhos" somenteLeitura={somenteLeitura} />
        </TabsContent>
        <TabsContent value="landing">
          <RoletaTab slug="landing" somenteLeitura={somenteLeitura} />
        </TabsContent>
        <TabsContent value="excecoes">
          <TabExcecoes somenteLeitura={somenteLeitura} />
        </TabsContent>
        <TabsContent value="historico">
          <TabHistorico />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="config">
            <TabConfiguracoes />
          </TabsContent>
        )}
        <TabsContent value="auditoria">
          <TabAuditoria />
        </TabsContent>
      </Tabs>

      {somenteLeitura && (
        <p className="mt-4 text-xs text-muted-foreground">
          Acesso somente leitura — as ações de distribuição são exclusivas de administradores.
        </p>
      )}
    </div>
  );
}
