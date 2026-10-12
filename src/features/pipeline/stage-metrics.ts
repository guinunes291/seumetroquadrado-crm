// Economia do funil por etapa — lógica PURA sobre o snapshot do pipeline.
// A % de conversão entre etapas é o funil acumulado por posição ATUAL:
// conv(etapa i) = leads em i-ou-além ÷ leads em (i-1)-ou-além. Não requer
// histórico de transições — mede onde o funil está afunilando HOJE.

export type StageSnapshotRow = {
  etapa: string;
  quantidade: number;
  vgv?: number | null;
};

export type StageMetrics = {
  etapa: string;
  count: number;
  /** VGV potencial da etapa (null quando o snapshot não fornece — v2). */
  vgv: number | null;
  /** Leads nesta etapa ou além (funil acumulado). */
  acumulado: number;
  /** % vs. etapa anterior (0–100); null na primeira etapa ou sem base. */
  conversaoPct: number | null;
};

/**
 * @param rows linhas do snapshot (v2 ou v3) — etapas fora de `order` (perdido,
 *   pos_venda…) são ignoradas no funil.
 * @param order ordem das etapas ativas do funil (FUNNEL_STAGES).
 */
export function computeStageMetrics(
  rows: StageSnapshotRow[],
  order: readonly string[],
): Map<string, StageMetrics> {
  const byEtapa = new Map(rows.map((r) => [r.etapa, r]));
  const counts = order.map((etapa) => byEtapa.get(etapa)?.quantidade ?? 0);

  // acumulado[i] = soma das quantidades de i até o fim do funil
  const acumulado: number[] = new Array(order.length).fill(0);
  for (let i = order.length - 1; i >= 0; i--) {
    acumulado[i] = counts[i] + (acumulado[i + 1] ?? 0);
  }

  const out = new Map<string, StageMetrics>();
  order.forEach((etapa, i) => {
    const row = byEtapa.get(etapa);
    const base = i > 0 ? acumulado[i - 1] : null;
    out.set(etapa, {
      etapa,
      count: counts[i],
      vgv: row?.vgv ?? null,
      acumulado: acumulado[i],
      conversaoPct: base != null && base > 0 ? Math.round((acumulado[i] / base) * 1000) / 10 : null,
    });
  });
  return out;
}

/** Formata VGV compacto para o header da coluna (R$ 1,2 mi / R$ 850 mil). */
export function formatVgvCompact(vgv: number | null): string | null {
  if (vgv == null || vgv <= 0) return null;
  if (vgv >= 1_000_000) {
    return `R$ ${(vgv / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  }
  if (vgv >= 1_000) {
    return `R$ ${Math.round(vgv / 1_000).toLocaleString("pt-BR")} mil`;
  }
  return `R$ ${Math.round(vgv).toLocaleString("pt-BR")}`;
}

export type SinaisSnapshotRow = {
  etapa: string;
  quantidade: number | string;
  followups_vencidos?: number | string | null;
  sem_proxima_acao?: number | string | null;
  parados_ha_7_dias?: number | string | null;
};

/** Um sinal do funil somado nas colunas: o total e a etapa que mais o tem. */
export type SinalDoFunil = {
  total: number;
  /** Etapa com mais leads nesse sinal (null quando zerado). */
  maiorEtapa: string | null;
  /** Quantos estão nessa etapa. */
  naMaiorEtapa: number;
};

export type SinaisDoFunil = {
  /** Leads nas colunas somadas. */
  leads: number;
  vencidos: SinalDoFunil;
  semAcao: SinalDoFunil;
  parados: SinalDoFunil;
};

/**
 * Os números do topo do Kanban: soma dos sinais que o snapshot já traz por
 * etapa (follow-ups vencidos, sem próxima ação, parados 7+ dias) — os mesmos
 * da linha de cada coluna, sem consulta nova. `rows` são só as colunas
 * visíveis (a fase recorta o topo como recorta o quadro).
 */
export function somarSinaisDoFunil(rows: readonly SinaisSnapshotRow[]): SinaisDoFunil {
  const sinal = (campo: "followups_vencidos" | "sem_proxima_acao" | "parados_ha_7_dias") => {
    let total = 0;
    let maiorEtapa: string | null = null;
    let naMaiorEtapa = 0;
    rows.forEach((row) => {
      const n = Number(row[campo] ?? 0) || 0;
      total += n;
      if (n > naMaiorEtapa) {
        naMaiorEtapa = n;
        maiorEtapa = row.etapa;
      }
    });
    return { total, maiorEtapa, naMaiorEtapa };
  };
  return {
    leads: rows.reduce((soma, row) => soma + (Number(row.quantidade) || 0), 0),
    vencidos: sinal("followups_vencidos"),
    semAcao: sinal("sem_proxima_acao"),
    parados: sinal("parados_ha_7_dias"),
  };
}
