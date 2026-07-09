import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDashboardLeadsUrgentes,
  useDashboardPorCorretor,
  useTempoPrimeiraResposta,
} from "@/features/dashboard/queries";
import { quemPrecisaDeAjuda, resumoOperacao } from "@/features/gestao/derive";
import { AlertTriangle, LifeBuoy, TrendingUp, Users, Trophy, Timer } from "lucide-react";

type Periodo = "hoje" | "semana" | "mes";
const toDate = (d: Date) => d.toISOString().slice(0, 10);
function intervalo(p: Periodo): { di: string; df: string } {
  const now = new Date();
  if (p === "hoje") return { di: toDate(now), df: toDate(now) };
  if (p === "semana") {
    const s = new Date(now);
    s.setDate(now.getDate() - 6);
    return { di: toDate(s), df: toDate(now) };
  }
  return { di: toDate(new Date(now.getFullYear(), now.getMonth(), 1)), df: toDate(now) };
}

/**
 * Cockpit do gestor — a primeira aba da Gestão responde "onde eu intervenho
 * hoje?": placar da operação + corretores ranqueados por sinais de risco,
 * cada um com o caminho de ação a 1 clique.
 */
export function VisaoGeralPanel() {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const range = useMemo(() => intervalo(periodo), [periodo]);

  const porCorretorQ = useDashboardPorCorretor(range);
  const urgentesQ = useDashboardLeadsUrgentes(null);
  const tempoQ = useTempoPrimeiraResposta(range);

  const carregando = porCorretorQ.isLoading || urgentesQ.isLoading;

  const resumo = useMemo(
    () => resumoOperacao(porCorretorQ.data ?? [], urgentesQ.data ?? []),
    [porCorretorQ.data, urgentesQ.data],
  );
  const emRisco = useMemo(
    () =>
      quemPrecisaDeAjuda({
        porCorretor: porCorretorQ.data ?? [],
        urgentes: urgentesQ.data ?? [],
        tempoResposta: tempoQ.data ?? [],
      }),
    [porCorretorQ.data, urgentesQ.data, tempoQ.data],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <div className="inline-flex rounded-md border bg-card p-0.5">
          {(["hoje", "semana", "mes"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={periodo === p ? "default" : "ghost"}
              onClick={() => setPeriodo(p)}
              className="capitalize"
            >
              {p === "mes" ? "Mês" : p}
            </Button>
          ))}
        </div>
      </div>

      {/* Placar da operação */}
      <StatGrid>
        <StatTile
          title="Leads no período"
          icon={Users}
          intent="info"
          loading={carregando}
          value={resumo.leads.toLocaleString("pt-BR")}
          hint={`${resumo.corretoresAtivos} corretor(es) com leads`}
        />
        <StatTile
          title="Vendas"
          icon={Trophy}
          intent="success"
          loading={carregando}
          value={resumo.vendas.toLocaleString("pt-BR")}
        />
        <StatTile
          title="Conversão"
          icon={TrendingUp}
          intent={resumo.conversaoMedia >= 5 ? "success" : "warning"}
          loading={carregando}
          value={`${resumo.conversaoMedia.toFixed(1)}%`}
          hint="leads → vendas no período"
        />
        <StatTile
          title="Parados agora"
          icon={Timer}
          intent={resumo.paradosAgora > 0 ? "danger" : "success"}
          loading={carregando}
          value={resumo.paradosAgora}
          hint="sem 1º atendimento há 30min+"
        />
      </StatGrid>

      {/* Quem precisa de ajuda */}
      <Card className={emRisco.length > 0 ? "border-warning/30" : undefined}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <LifeBuoy className="h-4 w-4 text-warning" /> Quem precisa de ajuda
            {emRisco.length > 0 && <Badge variant="secondary">{emRisco.length}</Badge>}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              sinais combinados: leads parados, conversão e tempo de resposta
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {carregando ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : emRisco.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum corretor com sinal de risco agora. 👏
            </p>
          ) : (
            emRisco.map((c) => (
              <div
                key={c.corretorId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      className={
                        c.risco >= 50 ? "h-4 w-4 text-destructive" : "h-4 w-4 text-warning"
                      }
                    />
                    <span className="truncate text-sm font-medium">{c.nome}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.motivos.map((m, i) => (
                      <Badge key={i} variant="secondary" className="bg-warning/10 text-xs">
                        {m}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/painel-gestor" search={{ tab: "leads-corretor" }}>
                    Ver carteira
                  </Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <GlassCard className="p-4 text-sm text-muted-foreground">
        As demais lentes — saúde detalhada por corretor, distribuição, pessoas, comunicação e
        qualidade de dados — seguem nas abas acima. Este painel é o ponto de partida do dia.
      </GlassCard>
    </div>
  );
}
