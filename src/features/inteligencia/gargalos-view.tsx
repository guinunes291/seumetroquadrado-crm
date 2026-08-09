import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowDownRight, Clock3, Info, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/ui/query-error-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { leadStatusLabel, MOTIVO_PERDA_LABEL } from "@/lib/leads";
import { formatDurationHoras } from "@/lib/duracao";
import { AtualizadoEm } from "./atualizado-em";
import { HeatmapMatriz } from "./heatmap-matriz";
import {
  useGargalos,
  useHeatmap,
  useMotivosPerdaGestao,
  type FiltrosInteligencia,
  type GargaloProblema,
} from "./queries";

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });

const METRICAS_HEATMAP = [
  {
    value: "conversao",
    label: "Conversão de passagem (%)",
    maiorMelhor: true,
    formato: (v: number) => `${v}%`,
  },
  {
    value: "quantidade",
    label: "Estoque atual",
    maiorMelhor: true,
    formato: (v: number) => String(v),
  },
  {
    value: "parados",
    label: "Parados agora",
    maiorMelhor: false,
    formato: (v: number) => String(v),
  },
  { value: "vgv", label: "VGV potencial", maiorMelhor: true, formato: fmtBRL },
  {
    value: "dias_medio",
    label: "Dias médios na etapa",
    maiorMelhor: false,
    formato: (v: number) => `${v}d`,
  },
] as const;

function tituloDoProblema(p: GargaloProblema): string {
  if (p.tipo === "queda_conversao") {
    return `Passagem para ${leadStatusLabel(p.etapa ?? "")} caiu: ${p.taxa_atual_pct}% vs ${p.taxa_baseline_pct}% do baseline`;
  }
  if (p.tipo === "motivo_perda") {
    return `Perdas por "${MOTIVO_PERDA_LABEL[p.categoria as keyof typeof MOTIVO_PERDA_LABEL] ?? p.categoria}"`;
  }
  return `Etapa lenta: ${leadStatusLabel(p.etapa ?? "")} (média ${formatDurationHoras(p.horas_media)})`;
}

const ICONE_PROBLEMA = {
  queda_conversao: ArrowDownRight,
  motivo_perda: XCircle,
  etapa_lenta: Clock3,
} as const;

/**
 * Tela 3 — Diagnóstico de Gargalo: não é dashboard, é um RANKING de problemas
 * por impacto estimado em R$, com o heatmap corretor × etapa como peça
 * central (processo × pessoa) e os motivos de perda estruturados.
 */
export function GargalosView({ filtros }: { filtros: FiltrosInteligencia }) {
  const gargalosQ = useGargalos(filtros);
  const [metrica, setMetrica] = useState<(typeof METRICAS_HEATMAP)[number]["value"]>("conversao");
  const heatmapQ = useHeatmap(metrica, filtros);
  const motivosQ = useMotivosPerdaGestao(filtros);

  const metricaMeta = METRICAS_HEATMAP.find((m) => m.value === metrica)!;
  const gargalos = gargalosQ.data ?? null;

  return (
    <div className="space-y-4">
      {/* Ranking de problemas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" /> Onde está travando (por impacto estimado)
            <AtualizadoEm quando={gargalosQ.data?.atualizado_em} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {gargalosQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : gargalosQ.isError ? (
            <QueryErrorState
              title="Não foi possível carregar os gargalos."
              error={gargalosQ.error}
              onRetry={() => gargalosQ.refetch()}
            />
          ) : gargalos === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" />
              Sem dado suficiente: o ranking depende da camada metrics (migrations da Fase A) ainda
              não aplicada neste ambiente.
            </p>
          ) : gargalos.problemas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum gargalo relevante detectado no período (quedas de passagem exigem baseline com
              amostra mínima de 20 leads).
            </p>
          ) : (
            <>
              <ol className="space-y-2">
                {gargalos!.problemas.map((p, i) => {
                  const Icone = ICONE_PROBLEMA[p.tipo] ?? AlertTriangle;
                  return (
                    <li
                      key={`${p.tipo}:${p.etapa ?? p.categoria ?? i}`}
                      className="flex items-start gap-3 rounded-lg border border-border-subtle bg-card p-3"
                    >
                      <span className="font-display mt-0.5 w-6 shrink-0 text-center text-lg font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      <Icone className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{tituloDoProblema(p)}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {p.leads_afetados > 0 && <>{p.leads_afetados} leads afetados · </>}
                          {p.impacto_reais != null && p.impacto_reais > 0 ? (
                            <span title="Estimativa: leads que deixaram de passar × vendas por passante × ticket médio de 6 meses">
                              impacto estimado {fmtBRL(p.impacto_reais)}/período
                            </span>
                          ) : (
                            "sem estimativa de R$ (etapa lenta prioriza tempo, não valor)"
                          )}
                        </div>
                      </div>
                      {p.drill && (
                        <Button asChild size="sm" variant="outline" className="shrink-0">
                          <Link to="/leads" search={p.drill}>
                            Ver leads
                          </Link>
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ol>
              <p className="text-[11px] text-muted-foreground">
                Baseline = 3 meses anteriores ao período. Ticket médio (6m):{" "}
                {fmtBRL(gargalos!.ticket_medio)}. Todo R$ é estimativa — rotulada como tal.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Heatmap corretor × etapa */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>Heatmap corretor × etapa</span>
            <Select value={metrica} onValueChange={(v) => setMetrica(v as typeof metrica)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRICAS_HEATMAP.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {heatmapQ.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : heatmapQ.data === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" />
              Sem dado suficiente: o heatmap depende da camada metrics ainda não aplicada.
            </p>
          ) : (heatmapQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados no período para esta métrica.</p>
          ) : (
            <HeatmapMatriz
              rows={heatmapQ.data ?? []}
              formatoValor={metricaMeta.formato}
              maiorMelhor={metricaMeta.maiorMelhor}
            />
          )}
        </CardContent>
      </Card>

      {/* Motivos de perda com R$ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <XCircle className="h-4 w-4" /> Motivos de perda
            {motivosQ.data?.degradado && (
              <span className="text-xs font-normal text-warning">modo degradado (sem R$)</span>
            )}
            <AtualizadoEm quando={motivosQ.data?.rows?.[0]?.atualizado_em} />
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {motivosQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (motivosQ.data?.rows ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem perdas registradas no período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">VGV estimado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(motivosQ.data?.rows ?? []).map((r) => (
                  <TableRow key={r.categoria}>
                    <TableCell className="font-medium">
                      {MOTIVO_PERDA_LABEL[r.categoria as keyof typeof MOTIVO_PERDA_LABEL] ??
                        r.categoria}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.quantidade}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.vgv_estimado != null ? (
                        <span title="Estimativa pelo preço 'a partir de' dos projetos dos leads perdidos">
                          ~{fmtBRL(Number(r.vgv_estimado))}
                        </span>
                      ) : (
                        <Badge variant="outline" className="font-normal text-muted-foreground">
                          sem dado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/leads" search={{ status: "perdido" }}>
                          Ver
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
