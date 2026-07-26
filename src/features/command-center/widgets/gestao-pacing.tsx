// Widget da visão Operação: ritmo do mês (meta × realizado × projeção) em
// versão compacta, com atalho para a tela completa de Metas & Ritmo.

import { Link } from "@tanstack/react-router";
import { ArrowRight, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { usePacing } from "@/features/metas/pacing-panel";
import { projecaoLinear, semaforo } from "@/features/metas/pacing";
import type { WidgetProps } from "@/features/command-center/widget-registry";

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });

const FAROL_TEXTO: Record<string, string> = {
  verde: "text-success",
  ambar: "text-warning",
  vermelho: "text-destructive",
  neutro: "text-muted-foreground",
};

export function GestaoPacingWidget(_props: WidgetProps) {
  const hoje = new Date();
  const q = usePacing(hoje.getFullYear(), hoje.getMonth() + 1);

  if (q.isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4" /> Ritmo do mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const p = q.data;
  const m = p?.mes_atual;
  const temMeta = !!m && (m.meta_gmv > 0 || m.meta_vendas > 0);
  const proj = p && m ? projecaoLinear(m.vgv, p.dias_uteis.passados, p.dias_uteis.total) : null;
  const farol = m ? semaforo(proj, m.meta_gmv) : "neutro";
  const pct = m && m.meta_gmv > 0 ? Math.min(100, Math.round((m.vgv / m.meta_gmv) * 100)) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4" /> Ritmo do mês
        </CardTitle>
        <Button asChild size="sm" variant="ghost">
          <Link to="/ranking" search={{ tab: "metas" }}>
            Metas <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!p || !temMeta ? (
          <p className="text-sm text-muted-foreground">
            {p
              ? "Sem meta cadastrada para este mês — cadastre em Metas & Ritmo para ver projeção e gap."
              : "Pacing indisponível (migrations da camada de gestão ainda não aplicadas)."}
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="font-display text-2xl font-semibold tabular-nums">
                  {moeda(m!.vgv)}
                </span>
                <span className="ml-1 text-sm text-muted-foreground">
                  de {moeda(m!.meta_gmv)} ({m!.vendas}/{m!.meta_vendas} vendas)
                </span>
              </div>
            </div>
            <Progress value={pct} />
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className={cn("font-medium", FAROL_TEXTO[farol])}>
                {proj === null
                  ? "sem ritmo ainda"
                  : `projeção ${moeda(proj)} (${farol === "verde" ? "no ritmo" : farol === "ambar" ? "atenção" : farol === "vermelho" ? "risco" : "—"})`}
              </span>
              <span>
                {p.dias_uteis.restantes}{" "}
                {p.dias_uteis.restantes === 1 ? "dia útil restante" : "dias úteis restantes"}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
