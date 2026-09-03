// Blocos visuais compartilhados do Raio-X: gráficos de evolução mensal,
// tabela mensal e o seletor de período. Extraídos de raio-x-corretor.tsx
// (sem mudança de comportamento) porque o Meu Raio-X — o BI self-serve do
// corretor — reusa exatamente estas peças; o caminho da gestão continua
// rendendo o mesmo HTML com as mesmas props.

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDots } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDuration } from "@/lib/duracao";
import { dateKey } from "@/lib/periodo";
import { mesesDesde } from "./raio-x-derive";
import type { FiltrosInteligencia, PerformanceDrillRow } from "./queries";

export const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });

export const fmtMes = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
};

/** Janela do Raio-X: últimos N meses fechando em hoje (mês-calendário LOCAL). */
function janela(meses: number): FiltrosInteligencia {
  const d = new Date();
  return {
    de: dateKey(new Date(d.getFullYear(), d.getMonth() - (meses - 1), 1)),
    ate: null,
    corretor: null,
  };
}

export const PERIODOS = [3, 6, 12] as const;
export type Periodo = (typeof PERIODOS)[number];

/**
 * Estado do filtro de período do Raio-X: presets 3/6/12 meses ou intervalo
 * personalizado. O grão da camada metrics é mensal, então datas valem pelos
 * meses que as contêm; `mesesJanela` é quantos meses o drill precisa buscar
 * para cobrir a janela (a RPC de drill ancora em now()).
 */
export function usePeriodoRaioX() {
  const [meses, setMeses] = useState<Periodo>(6);
  const [custom, setCustom] = useState<{ from?: Date; to?: Date } | null>(null);
  const janelaAtual = useMemo<FiltrosInteligencia>(() => {
    if (custom?.from) {
      return {
        de: format(custom.from, "yyyy-MM-dd"),
        ate: custom.to ? format(custom.to, "yyyy-MM-dd") : null,
        corretor: null,
      };
    }
    return janela(meses);
  }, [custom, meses]);
  const labelJanela = custom?.from
    ? `${format(custom.from, "dd/MM/yy")} – ${custom.to ? format(custom.to, "dd/MM/yy") : "hoje"}`
    : `${meses} meses`;
  const mesesJanela =
    custom?.from && janelaAtual.de ? mesesDesde(janelaAtual.de, dateKey(new Date())) : meses;
  return { meses, setMeses, custom, setCustom, janelaAtual, labelJanela, mesesJanela };
}

export type PeriodoRaioX = ReturnType<typeof usePeriodoRaioX>;

/** Presets de período + intervalo personalizado (popover com calendário). */
export function SeletorPeriodo({ periodo }: { periodo: PeriodoRaioX }) {
  const { meses, setMeses, custom, setCustom } = periodo;
  return (
    <div className="inline-flex rounded-md border bg-card p-0.5">
      {PERIODOS.map((p) => (
        <Button
          key={p}
          size="sm"
          variant={!custom?.from && meses === p ? "default" : "ghost"}
          onClick={() => {
            setCustom(null);
            setMeses(p);
          }}
        >
          {p} meses
        </Button>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant={custom?.from ? "default" : "ghost"}>
            <CalendarDots className="mr-1 h-4 w-4" />
            {custom?.from
              ? `${format(custom.from, "dd/MM/yy")}${custom.to ? ` – ${format(custom.to, "dd/MM/yy")}` : ""}`
              : "Personalizado"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarComponent
            initialFocus
            mode="range"
            defaultMonth={custom?.from}
            selected={{ from: custom?.from, to: custom?.to }}
            onSelect={(r) => setCustom(r?.from ? { from: r.from, to: r.to } : null)}
            numberOfMonths={2}
            locale={ptBR}
          />
          <p className="max-w-[280px] border-t px-3 py-2 text-[11px] text-muted-foreground sm:max-w-none">
            A análise agrega meses-calendário: as datas valem pelos meses que as contêm.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gráficos de evolução (recharts — as duas telas carregam esta região em lazy)
// ---------------------------------------------------------------------------

/** Vendas (barras) + VGV (linha) por mês. */
export function ResultadoMensalChart({ serie }: { serie: PerformanceDrillRow[] }) {
  const data = serie.map((m) => ({
    label: fmtMes(m.mes),
    vendas: m.vendas,
    vgv: Number(m.vgv) || 0,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="vendas" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis
          yAxisId="vgv"
          orientation="right"
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) =>
            v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })
          }
        />
        <Tooltip
          formatter={(value: number, name: string) =>
            name === "VGV"
              ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : value
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          yAxisId="vendas"
          dataKey="vendas"
          name="Vendas"
          fill="var(--chart-2)"
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="vgv"
          type="monotone"
          dataKey="vgv"
          name="VGV"
          stroke="var(--success)"
          strokeWidth={2}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Esforço mensal: leads recebidos, contatos e visitas realizadas. */
export function EsforcoMensalChart({ serie }: { serie: PerformanceDrillRow[] }) {
  const data = serie.map((m) => ({
    label: fmtMes(m.mes),
    leads: m.leads_recebidos,
    contatos: m.contatos,
    visitas: m.visitas_realizadas,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="leads"
          name="Leads"
          stroke="var(--chart-3)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="contatos"
          name="Contatos"
          stroke="var(--chart-2)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="visitas"
          name="Visitas"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Tabela mês a mês da série do drill (esforço + resultado + 1ª resposta). */
export function TabelaMensal({ serie }: { serie: PerformanceDrillRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2 font-medium">Mês</th>
            <th className="py-2 pr-2 text-right font-medium">Leads</th>
            <th className="py-2 pr-2 text-right font-medium">Contatos</th>
            <th className="py-2 pr-2 text-right font-medium">Visitas</th>
            <th className="py-2 pr-2 text-right font-medium">Análises</th>
            <th className="py-2 pr-2 text-right font-medium">Vendas</th>
            <th className="py-2 pr-2 text-right font-medium">VGV</th>
            <th className="py-2 text-right font-medium">1ª resp.</th>
          </tr>
        </thead>
        <tbody>
          {serie.map((m) => (
            <tr key={m.mes} className="border-b border-border-subtle last:border-0">
              <td className="py-2 pr-2 font-medium">{fmtMes(m.mes)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{m.leads_recebidos}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{m.contatos}</td>
              <td className="py-2 pr-2 text-right tabular-nums">
                {m.visitas_realizadas}
                {m.no_shows > 0 && (
                  <span className="ml-1 text-xs text-destructive">({m.no_shows}ns)</span>
                )}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{m.analises}</td>
              <td className="py-2 pr-2 text-right font-semibold tabular-nums text-success">
                {m.vendas}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">
                {Number(m.vgv) > 0 ? fmtBRL(Number(m.vgv)) : "—"}
              </td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">
                {formatDuration(m.primeira_resposta_p50_min)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
