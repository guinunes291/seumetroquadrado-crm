import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, TrendingUp, CheckCircle2, Target, Trophy } from "lucide-react";
import { computeAgentMetrics, rankAgents, progressoMeta, MESES_PT } from "@/lib/metas";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Seu Metro Quadrado" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canSeeAll = isAdmin || isGestor;
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);

  const leadsQ = useQuery({
    queryKey: ["dash:leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("status, corretor_id, created_at")
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const agendamentosQ = useQuery({
    queryKey: ["dash:agendamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("status, corretor_id, data_inicio")
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const transicoesQ = useQuery({
    queryKey: ["dash:transicoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_status_transitions")
        .select("para_status, corretor_id, created_at")
        .eq("para_status", "contrato_fechado");
      if (error) throw error;
      return data ?? [];
    },
  });

  const profilesQ = useQuery({
    queryKey: ["dash:profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome");
      return data ?? [];
    },
  });

  const metasQ = useQuery({
    queryKey: ["dash:metas", ano, mes, user?.id, canSeeAll],
    enabled: !!user?.id,
    queryFn: async () => {
      const q = supabase.from("metas").select("*").eq("ano", ano).eq("mes", mes);
      if (!canSeeAll) q.eq("corretor_id", user!.id);
      const { data } = await q;
      return data ?? [];
    },
  });

  const metrics = useMemo(
    () =>
      computeAgentMetrics(
        leadsQ.data ?? [],
        agendamentosQ.data ?? [],
        ano,
        mes,
        transicoesQ.data ?? [],
      ),
    [leadsQ.data, agendamentosQ.data, transicoesQ.data, ano, mes],
  );

  const nomes = useMemo(() => {
    const m = new Map<string, string>();
    (profilesQ.data ?? []).forEach((p: any) => m.set(p.id, p.nome));
    return m;
  }, [profilesQ.data]);

  const ranking = useMemo(() => rankAgents(metrics, nomes), [metrics, nomes]);

  const minhasMetricas = user ? metrics.get(user.id) : undefined;
  const minhaMeta = (metasQ.data ?? []).find((m: any) => m.corretor_id === user?.id);
  const metaGlobal = (metasQ.data ?? []).find((m: any) => !m.corretor_id && !m.equipe_id);

  const totais = useMemo(() => {
    let leads_total = 0,
      leads_atendidos = 0,
      visitas = 0,
      vendas = 0;
    for (const m of metrics.values()) {
      leads_total += m.leads_total;
      leads_atendidos += m.leads_atendidos;
      visitas += m.visitas;
      vendas += m.vendas;
    }
    return { leads_total, leads_atendidos, visitas, vendas };
  }, [metrics]);

  const visao = canSeeAll
    ? totais
    : (minhasMetricas ?? {
        leads_total: 0,
        leads_atendidos: 0,
        visitas: 0,
        vendas: 0,
        taxa_conversao: 0,
      });
  const meta = canSeeAll ? metaGlobal : minhaMeta;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard"
        description={canSeeAll ? "Visão geral do time" : "Sua performance no mês"}
        actions={
          <div className="flex gap-2">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES_PT.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Leads recebidos"
          value={visao.leads_total}
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Atendidos"
          value={visao.leads_atendidos}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Visitas realizadas"
          value={visao.visitas}
        />
        <KpiCard icon={<Trophy className="h-5 w-5" />} label="Vendas" value={visao.vendas} accent />
      </div>

      {meta && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Meta de {MESES_PT[mes - 1]}/{ano}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-4">
            <MetaProgresso
              label="Atendimentos"
              atual={visao.leads_atendidos}
              meta={meta.meta_leads_atendidos}
            />
            <MetaProgresso label="Visitas" atual={visao.visitas} meta={meta.meta_visitas} />
            <MetaProgresso label="Vendas" atual={visao.vendas} meta={meta.meta_vendas} />
          </CardContent>
        </Card>
      )}

      {canSeeAll && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4" /> Ranking do mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <ol className="space-y-2">
                {ranking.slice(0, 10).map((r) => (
                  <li
                    key={r.corretor_id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                  >
                    <span className="w-8 text-center font-semibold text-muted-foreground">
                      {r.posicao}º
                    </span>
                    <span className="flex-1 truncate">{r.nome ?? r.corretor_id.slice(0, 8)}</span>
                    <Badge variant="outline">{r.vendas} vendas</Badge>
                    <Badge variant="secondary">{r.visitas} visitas</Badge>
                    <Badge>{r.taxa_conversao}%</Badge>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-primary" : ""}>
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={`h-10 w-10 rounded-md flex items-center justify-center ${accent ? "bg-primary text-primary-foreground" : "bg-muted"}`}
        >
          {icon}
        </div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetaProgresso({ label, atual, meta }: { label: string; atual: number; meta: number }) {
  const p = progressoMeta(atual, meta);
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {atual} / {meta}
        </span>
      </div>
      <Progress value={p} />
      <div className="text-xs text-muted-foreground mt-1">{p}% atingido</div>
    </div>
  );
}
