// Regras PURAS do painel de qualidade da Sami (decisão D17): período padrão,
// contrato do JSON de samiq_metricas_periodo e os indicadores derivados que
// os tiles mostram (percentuais, latência, custo em reais). Sem React nem
// Supabase — testável em tests/samiq-qualidade.test.ts.

import { z } from "zod";

export const MetricasSamiQSchema = z
  .object({
    de: z.string(),
    ate: z.string(),
    escopo: z.enum(["operacao", "equipe"]),
    execucoes: z.number().int().nonnegative(),
    concluidas: z.number().int().nonnegative(),
    falhas: z.number().int().nonnegative(),
    fallbacks: z.number().int().nonnegative(),
    usuarios_ativos: z.number().int().nonnegative(),
    conversas: z.number().int().nonnegative(),
    tool_calls: z.number().int().nonnegative(),
    tool_errors: z.number().int().nonnegative(),
    tokens: z.number().nonnegative(),
    custo_micros: z.number().nonnegative(),
    latencia_p50_ms: z.number().nullable(),
    latencia_p95_ms: z.number().nullable(),
    avaliacoes_positivas: z.number().int().nonnegative(),
    avaliacoes_negativas: z.number().int().nonnegative(),
    por_acao: z.array(z.object({ action: z.string(), total: z.number().int() })).default([]),
    por_dia: z
      .array(
        z.object({
          dia: z.string(),
          execucoes: z.number().int(),
          fallbacks: z.number().int(),
          usuarios: z.number().int(),
        }),
      )
      .default([]),
  })
  .passthrough();

export type MetricasSamiQ = z.infer<typeof MetricasSamiQSchema>;

function isoDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Janela [hoje − dias + 1, hoje] em AAAA-MM-DD (o banco corta no fuso de SP). */
export function periodoUltimosDias(
  dias: number,
  hoje: Date = new Date(),
): { _de: string; _ate: string } {
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  const inicio = new Date(fim.getTime() - (Math.max(1, dias) - 1) * 24 * 60 * 60 * 1000);
  return { _de: isoDia(inicio), _ate: isoDia(fim) };
}

export type IndicadoresSamiQ = {
  /** % de execuções concluídas sem resposta útil (meta da Elô: < 1%). */
  fallbackPct: number | null;
  /** % de 👍 entre as respostas avaliadas; null sem avaliação. */
  aprovacaoPct: number | null;
  totalAvaliacoes: number;
  /** % de chamadas de ferramenta que falharam; null sem chamadas. */
  erroFerramentaPct: number | null;
  /** Custo em reais quando a versão tem pricing; null = sem pricing (mostra tokens). */
  custoReais: number | null;
  /** Série diária de execuções para o sparkline. */
  sparkExecucoes: number[];
};

function pct(parte: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((parte / total) * 1000) / 10;
}

export function derivarIndicadoresSamiQ(m: MetricasSamiQ): IndicadoresSamiQ {
  const avaliacoes = m.avaliacoes_positivas + m.avaliacoes_negativas;
  return {
    fallbackPct: pct(m.fallbacks, m.concluidas),
    aprovacaoPct: pct(m.avaliacoes_positivas, avaliacoes),
    totalAvaliacoes: avaliacoes,
    erroFerramentaPct: pct(m.tool_errors, m.tool_calls),
    custoReais: m.custo_micros > 0 ? m.custo_micros / 1_000_000 : null,
    sparkExecucoes: m.por_dia.map((d) => d.execucoes),
  };
}

export function formatarPct(valor: number | null): string {
  if (valor === null) return "—";
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function formatarMs(valor: number | null): string {
  if (valor === null) return "—";
  if (valor >= 1000)
    return `${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
  return `${Math.round(valor)} ms`;
}
