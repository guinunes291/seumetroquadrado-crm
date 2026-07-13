import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { DollarSign, Star, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { cn } from "@/lib/utils";
import {
  buildAtividadeCards,
  intervalo,
  somarAtividades,
  useAtividadesDiarias,
  useConquistas,
  useMetaDiariaAgregada,
} from "./use-home-data";
import type { WidgetProps } from "@/features/command-center/widget-registry";

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Widget de produtividade: KPIs do período (pontuação, VGV, conquistas,
 * atividades) + cards de atividade × meta. O seletor de período fica no
 * cabeçalho da seção e é estado da rota — o widget de metas usa o mesmo.
 */
export function ProdutividadeWidget(props: WidgetProps) {
  const { escopo, periodo, onPeriodoChange } = props;
  const { di, df } = useMemo(() => intervalo(periodo), [periodo]);

  const atividadesQ = useAtividadesDiarias(props, di, df);
  const metaQ = useMetaDiariaAgregada(props);
  const conquistasQ = useConquistas(props);

  const totais = useMemo(() => somarAtividades(atividadesQ.data), [atividadesQ.data]);
  const cards = buildAtividadeCards(totais, metaQ.data);

  // Metas são diárias: só mostramos progresso de meta no período "hoje".
  const mostrarMeta = periodo === "hoje" && !!metaQ.data;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Desempenho"
        title={escopo === "operacao" ? "Produtividade da operação" : "Minha produtividade"}
        action={
          <div className="inline-flex rounded-md border bg-card p-0.5">
            {(["hoje", "semana", "mes"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={periodo === p ? "default" : "ghost"}
                onClick={() => onPeriodoChange(p)}
                className="capitalize"
              >
                {p === "mes" ? "Mês" : p}
              </Button>
            ))}
          </div>
        }
        className="pt-2"
      />

      <AsyncBoundary
        isLoading={atividadesQ.isLoading || metaQ.isLoading || conquistasQ.isLoading}
        isError={atividadesQ.isError || metaQ.isError || conquistasQ.isError}
        error={atividadesQ.error ?? metaQ.error ?? conquistasQ.error}
        errorTitle="Não foi possível carregar a produtividade."
        onRetry={() => {
          void atividadesQ.refetch();
          void metaQ.refetch();
          void conquistasQ.refetch();
        }}
        loadingFallback={
          <div className="space-y-6">
            <StatGrid className="lg:grid-cols-4 xl:grid-cols-4">
              <StatTile
                title="Pontuação"
                icon={Star}
                intent="warning"
                loading
                value={0}
                className="bg-gradient-to-br from-primary/10 to-transparent"
              />
              <StatTile title="VGV" icon={DollarSign} intent="success" loading value={0} />
              <StatTile title="Conquistas" icon={Trophy} loading value={0} />
              <StatTile title="Atividades" loading value={0} />
            </StatGrid>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {["ligacoes", "whatsapps", "agendamentos", "visitas", "documentacoes", "vendas"].map(
                (k) => (
                  <Skeleton key={k} className="h-[104px] w-full rounded-xl" />
                ),
              )}
            </div>
          </div>
        }
      >
        <StatGrid className="lg:grid-cols-4 xl:grid-cols-4">
          <StatTile
            title="Pontuação"
            icon={Star}
            intent="warning"
            value={totais.pontos}
            formatValue={(n) => Math.round(n).toLocaleString("pt-BR")}
            hint="pontos no período"
            className="bg-gradient-to-br from-primary/10 to-transparent"
          />
          <StatTile
            title="VGV"
            icon={DollarSign}
            intent="success"
            value={totais.vgv}
            formatValue={fmtBRL}
            hint={`${totais.vendas} venda(s)`}
          />
          <StatTile
            title="Conquistas"
            icon={Trophy}
            value={
              <>
                {conquistasQ.data?.ganhas ?? 0}
                <span className="text-base text-muted-foreground">
                  /{conquistasQ.data?.total ?? 0}
                </span>
              </>
            }
            hint={
              <Link
                to="/ranking"
                search={{ tab: "conquistas" }}
                className="text-primary hover:underline"
              >
                ver medalhas
              </Link>
            }
          />
          <StatTile
            title="Atividades"
            value={totais.ligacoes + totais.whatsapps + totais.agendamentos + totais.visitas}
            hint="contatos + agendas + visitas"
          />
        </StatGrid>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const Icon = c.icon;
            const pct =
              mostrarMeta && c.meta ? Math.min(100, Math.round((c.value / c.meta) * 100)) : null;
            return (
              <Card key={c.key}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Icon className="h-4 w-4" /> {c.label}
                    </div>
                    {pct !== null && (
                      <Badge
                        variant="secondary"
                        className={cn(pct >= 100 && "bg-success/15 text-success")}
                      >
                        {pct}% da meta
                      </Badge>
                    )}
                  </div>
                  <div className="font-display mt-1 text-2xl font-bold tabular-nums">
                    {c.value}
                    {mostrarMeta && c.meta ? (
                      <span className="text-sm font-normal text-muted-foreground"> / {c.meta}</span>
                    ) : null}
                  </div>
                  {pct !== null && (
                    <div
                      className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label={`${c.label}: ${pct}% da meta`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                    >
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          pct >= 100 ? "bg-success" : "bg-primary",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {escopo === "minha" && !metaQ.data && (
          <p className="text-sm text-muted-foreground">
            Defina suas metas diárias para acompanhar o progresso (peça ao gestor em “Metas”).
          </p>
        )}
      </AsyncBoundary>
    </div>
  );
}
