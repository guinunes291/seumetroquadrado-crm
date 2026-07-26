import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Gauge, Target, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatGrid, StatTile } from "@/components/ui/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  calculoReverso,
  normalizarPacing,
  projecaoLinear,
  ritmoVsMesAnterior,
  semaforo,
  type Pacing,
  type Semaforo,
} from "./pacing";

const rpc = (name: string, args: Record<string, unknown>) => (supabase as any).rpc(name, args);

export function usePacing(ano: number, mes: number) {
  return useQuery({
    queryKey: ["gestao:pacing", ano, mes],
    staleTime: 60_000,
    queryFn: async (): Promise<Pacing | null> =>
      rpcWithFallback(
        async () => {
          const { data, error } = await rpc("gestao_pacing", { _ano: ano, _mes: mes });
          if (error) throw error;
          return normalizarPacing(data);
        },
        // Sem a migration aplicada o painel simplesmente não aparece — a
        // MetasPage abaixo continua funcionando como antes.
        () => null,
      ),
  });
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });

const SEMAFORO_META: Record<Semaforo, { dot: string; label: string }> = {
  verde: { dot: "bg-success", label: "no ritmo" },
  ambar: { dot: "bg-warning", label: "atenção" },
  vermelho: { dot: "bg-destructive", label: "risco" },
  neutro: { dot: "bg-muted-foreground/40", label: "sem base" },
};

function SemaforoDot({ s }: { s: Semaforo }) {
  const meta = SEMAFORO_META[s];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-2.5 w-2.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}

/**
 * Tela 5 — Meta e Ritmo: projeção por dias úteis, cálculo reverso e gap por
 * corretor. Montado no topo da aba Metas; some silenciosamente se a RPC
 * gestao_pacing ainda não existe no banco.
 */
export function PacingPanel({ ano, mes }: { ano: number; mes: number }) {
  const q = usePacing(ano, mes);

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError || !q.data) return null;

  const p = q.data;
  const { dias_uteis: du, mes_atual: m, trimestre: tri } = p;

  const projVgv = projecaoLinear(m.vgv, du.passados, du.total);
  const projVendas = projecaoLinear(m.vendas, du.passados, du.total);
  const farolVgv = semaforo(projVgv, m.meta_gmv);
  const vendasFaltam = Math.max(0, m.meta_vendas - m.vendas);
  const reverso = calculoReverso(vendasFaltam, p.taxas_90d);
  const ritmoAnt = p.mes_anterior_mesmo_dia_util;
  const deltaRitmo = ritmoAnt ? ritmoVsMesAnterior(m.vendas, ritmoAnt.vendas) : null;

  const temMeta = m.meta_gmv > 0 || m.meta_vendas > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Gauge className="h-4 w-4" /> Ritmo do mês
          <span className="text-xs font-normal text-muted-foreground">
            {du.restantes} {du.restantes === 1 ? "dia útil restante" : "dias úteis restantes"} (
            {du.passados}/{du.total})
          </span>
          {deltaRitmo !== null && (
            <Badge variant={deltaRitmo >= 0 ? "default" : "destructive"} className="font-normal">
              {deltaRitmo >= 0 ? "+" : ""}
              {deltaRitmo}% vs mesmo dia útil do mês anterior
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!temMeta ? (
          <p className="text-sm text-muted-foreground">
            Sem meta cadastrada para este mês — cadastre abaixo para ver projeção, gap e cálculo
            reverso.
          </p>
        ) : (
          <>
            <StatGrid>
              <StatTile
                title="Meta do mês (VGV)"
                value={m.meta_gmv}
                formatValue={fmtBRL}
                icon={Target}
                hint={`${m.meta_vendas} vendas · ${m.meta_visitas} visitas`}
              />
              <StatTile
                title="Realizado"
                value={m.vgv}
                formatValue={fmtBRL}
                icon={TrendingUp}
                hint={`${m.vendas} vendas · ${m.visitas} visitas`}
              />
              <StatTile
                title="Projeção (ritmo atual)"
                value={projVgv === null ? "—" : fmtBRL(projVgv)}
                icon={CalendarClock}
                intent={farolVgv === "verde" ? "success" : farolVgv === "ambar" ? "warning" : farolVgv === "vermelho" ? "danger" : "neutral"}
                hint={
                  projVgv === null ? (
                    "sem ritmo ainda (nenhum dia útil passado)"
                  ) : (
                    <SemaforoDot s={farolVgv} />
                  )
                }
              />
              <StatTile
                title="Trimestre (Σ meses)"
                value={tri.vgv}
                formatValue={fmtBRL}
                icon={Target}
                hint={
                  tri.meta_gmv > 0
                    ? `meta ${fmtBRL(tri.meta_gmv)} · ${tri.vendas}/${tri.meta_vendas} vendas`
                    : "sem metas cadastradas no trimestre"
                }
              />
            </StatGrid>

            {/* Cálculo reverso */}
            <div className="rounded-lg border border-border-subtle bg-muted/30 p-3 text-sm">
              {vendasFaltam === 0 ? (
                <span className="font-medium text-success">Meta de vendas do mês batida. 🎉</span>
              ) : (
                <>
                  <span className="font-medium">
                    Faltam {vendasFaltam} venda{vendasFaltam === 1 ? "" : "s"}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    ≈{" "}
                    {reverso.analises === null ? "análises: sem dado" : `${reverso.analises} análises`}
                    {" · "}
                    {reverso.visitas === null ? "visitas: sem dado" : `${reverso.visitas} visitas`}
                    {" · "}
                    {reverso.leads === null ? "leads: sem dado" : `${reverso.leads} leads`}
                    {" "}(taxas dos últimos 90 dias{p.taxas_90d.venda_por_visita === null ? " — histórico insuficiente" : ""})
                  </span>
                </>
              )}
            </div>
          </>
        )}

        {/* Gap por corretor */}
        {p.por_corretor.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Corretor</TableHead>
                  <TableHead className="text-right">Meta VGV</TableHead>
                  <TableHead className="text-right">Realizado</TableHead>
                  <TableHead className="text-right">Projeção</TableHead>
                  <TableHead className="text-right">Gap</TableHead>
                  <TableHead>Risco</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.por_corretor.map((c) => {
                  const proj = projecaoLinear(c.vgv, du.passados, du.total);
                  const farol = semaforo(proj, c.meta_gmv);
                  const gap = Math.max(0, c.meta_gmv - (proj ?? c.vgv));
                  return (
                    <TableRow key={c.corretor_id}>
                      <TableCell className="max-w-[200px] truncate font-medium">
                        <Link
                          to="/leads"
                          search={{ corretor: c.corretor_id }}
                          className="hover:underline"
                          title="Ver leads do corretor"
                        >
                          {c.nome}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.meta_gmv > 0 ? fmtBRL(c.meta_gmv) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(c.vgv)}
                        <span className="ml-1 text-xs text-muted-foreground">({c.vendas}v)</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {proj === null ? "—" : fmtBRL(proj)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.meta_gmv > 0 ? (gap > 0 ? fmtBRL(gap) : "0") : "—"}
                      </TableCell>
                      <TableCell>
                        <SemaforoDot s={c.meta_gmv > 0 ? farol : "neutro"} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
