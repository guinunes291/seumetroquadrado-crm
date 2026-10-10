// Gráficos da planilha de amortização. ESTE arquivo importa recharts e por
// isso só entra via lazy() (mesma regra de followup/kpis-view): nada fora dele
// pode importá-lo de forma estática.

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ResultadoSimulacao } from "@/lib/amortizacao";

const COR = { SAC: "var(--chart-1)", PRICE: "var(--chart-2)" } as const;

const brlCurto = (v: number) =>
  v >= 1000
    ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: v >= 10_000 ? 0 : 1 })} mil`
    : `R$ ${v.toFixed(0)}`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Serie = Partial<Record<"SAC" | "PRICE", ResultadoSimulacao>>;

/** Junta as duas planilhas mês a mês (amostrando para não pesar o SVG). */
function montar(resultados: Serie, campo: "encargoTotal" | "saldoFinal") {
  const total = Math.max(resultados.SAC?.linhas.length ?? 0, resultados.PRICE?.linhas.length ?? 0);
  const passo = total > 180 ? 3 : 1;
  const pontos: Record<string, number>[] = [];
  for (let k = 0; k < total; k += passo) {
    const p: Record<string, number> = { mes: k + 1 };
    const sac = resultados.SAC?.linhas[k];
    const price = resultados.PRICE?.linhas[k];
    if (sac) p.SAC = sac[campo];
    if (price) p.PRICE = price[campo];
    pontos.push(p);
  }
  return pontos;
}

/** Um rótulo a cada 5 anos (meses 1, 61, 121...), que a amostragem sempre inclui. */
function ticksAnuais(dados: Record<string, number>[]): number[] {
  const ultimo = dados[dados.length - 1]?.mes ?? 1;
  const passo = ultimo > 240 ? 60 : ultimo > 60 ? 12 : 6;
  const out: number[] = [];
  for (let m = 1; m <= ultimo; m += passo) out.push(m);
  return out;
}

function Grafico({
  dados,
  sistemas,
}: {
  dados: Record<string, number>[];
  sistemas: ("SAC" | "PRICE")[];
}) {
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="mes"
            type="number"
            domain={[1, "dataMax"]}
            ticks={ticksAnuais(dados)}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => (v === 1 ? "início" : `${Math.round((v - 1) / 12)} anos`)}
          />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={brlCurto} width={72} />
          <Tooltip
            labelFormatter={(v) => `Mês ${v}`}
            formatter={(value: number, name: string) => [brl(value), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {sistemas.map((s) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              name={s}
              stroke={COR[s]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficosAmortizacao({ resultados }: { resultados: Serie }) {
  const sistemas = (["SAC", "PRICE"] as const).filter((s) => resultados[s]);
  const parcelas = useMemo(() => montar(resultados, "encargoTotal"), [resultados]);
  const saldos = useMemo(() => montar(resultados, "saldoFinal"), [resultados]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <div className="mb-1 text-sm font-medium">Parcela mensal (encargo total)</div>
        <Grafico dados={parcelas} sistemas={[...sistemas]} />
      </div>
      <div>
        <div className="mb-1 text-sm font-medium">Saldo devedor</div>
        <Grafico dados={saldos} sistemas={[...sistemas]} />
      </div>
    </div>
  );
}
