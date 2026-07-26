// Matemática pura do pacing (Tela 5 — Meta e Ritmo).
// A RPC gestao_pacing entrega metas, realizado, dias úteis e taxas; aqui
// ficam projeção, cálculo reverso e semáforo — testáveis sem banco.

export type PacingDiasUteis = { total: number; passados: number; restantes: number };

export type PacingTotais = {
  meta_vendas: number;
  meta_gmv: number;
  meta_visitas: number;
  vendas: number;
  vgv: number;
  visitas: number;
};

export type PacingTrimestre = {
  inicio: string | null;
  meta_vendas: number;
  meta_gmv: number;
  vendas: number;
  vgv: number;
};

export type Taxas90d = {
  venda_por_visita: number | null;
  venda_por_analise: number | null;
  venda_por_lead: number | null;
};

export type PacingCorretor = {
  corretor_id: string;
  nome: string;
  meta_vendas: number;
  meta_gmv: number;
  meta_visitas: number;
  vendas: number;
  vgv: number;
  visitas: number;
};

export type Pacing = {
  ano: number;
  mes: number;
  dias_uteis: PacingDiasUteis;
  mes_atual: PacingTotais;
  trimestre: PacingTrimestre;
  taxas_90d: Taxas90d;
  mes_anterior_mesmo_dia_util: { vendas: number; vgv: number; ate_dia: string | null } | null;
  por_corretor: PacingCorretor[];
  atualizado_em: string | null;
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const taxa = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Normaliza o jsonb da RPC gestao_pacing; null quando o shape não é o esperado. */
export function normalizarPacing(raw: unknown): Pacing | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const mesAtual = r.mes_atual as Record<string, unknown> | undefined;
  const diasUteis = r.dias_uteis as Record<string, unknown> | undefined;
  if (!mesAtual || !diasUteis) return null;
  const tri = (r.trimestre ?? {}) as Record<string, unknown>;
  const taxas = (r.taxas_90d ?? {}) as Record<string, unknown>;
  const ritmoAnt = r.mes_anterior_mesmo_dia_util as Record<string, unknown> | null;
  return {
    ano: num(r.ano),
    mes: num(r.mes),
    dias_uteis: {
      total: num(diasUteis.total),
      passados: num(diasUteis.passados),
      restantes: num(diasUteis.restantes),
    },
    mes_atual: {
      meta_vendas: num(mesAtual.meta_vendas),
      meta_gmv: num(mesAtual.meta_gmv),
      meta_visitas: num(mesAtual.meta_visitas),
      vendas: num(mesAtual.vendas),
      vgv: num(mesAtual.vgv),
      visitas: num(mesAtual.visitas),
    },
    trimestre: {
      inicio: typeof tri.inicio === "string" ? tri.inicio : null,
      meta_vendas: num(tri.meta_vendas),
      meta_gmv: num(tri.meta_gmv),
      vendas: num(tri.vendas),
      vgv: num(tri.vgv),
    },
    taxas_90d: {
      venda_por_visita: taxa(taxas.venda_por_visita),
      venda_por_analise: taxa(taxas.venda_por_analise),
      venda_por_lead: taxa(taxas.venda_por_lead),
    },
    mes_anterior_mesmo_dia_util: ritmoAnt
      ? {
          vendas: num(ritmoAnt.vendas),
          vgv: num(ritmoAnt.vgv),
          ate_dia: typeof ritmoAnt.ate_dia === "string" ? ritmoAnt.ate_dia : null,
        }
      : null,
    por_corretor: Array.isArray(r.por_corretor)
      ? (r.por_corretor as Array<Record<string, unknown>>)
          .filter((c) => typeof c?.corretor_id === "string")
          .map((c) => ({
            corretor_id: c.corretor_id as string,
            nome: typeof c.nome === "string" ? c.nome : "—",
            meta_vendas: num(c.meta_vendas),
            meta_gmv: num(c.meta_gmv),
            meta_visitas: num(c.meta_visitas),
            vendas: num(c.vendas),
            vgv: num(c.vgv),
            visitas: num(c.visitas),
          }))
      : [],
    atualizado_em: typeof r.atualizado_em === "string" ? r.atualizado_em : null,
  };
}

/**
 * Projeção linear por dias úteis: realizado ÷ dias passados × dias totais.
 * null sem dias úteis passados (início de mês) — a UI mostra "sem ritmo ainda",
 * nunca 0 falso.
 */
export function projecaoLinear(
  realizado: number,
  diasPassados: number,
  diasTotais: number,
): number | null {
  if (diasPassados <= 0 || diasTotais <= 0) return null;
  return Math.round((realizado / diasPassados) * diasTotais * 100) / 100;
}

/**
 * Cálculo reverso: com as taxas vigentes, quantas visitas/análises/leads
 * ainda são necessárias para as vendas que faltam. null quando a taxa não é
 * calculável (sem histórico) — a UI diz "sem dado suficiente".
 */
export function calculoReverso(
  vendasFaltantes: number,
  taxas: Taxas90d,
): { visitas: number | null; analises: number | null; leads: number | null } {
  const need = (t: number | null) =>
    vendasFaltantes <= 0 ? 0 : t === null ? null : Math.ceil(vendasFaltantes / t);
  return {
    visitas: need(taxas.venda_por_visita),
    analises: need(taxas.venda_por_analise),
    leads: need(taxas.venda_por_lead),
  };
}

export type Semaforo = "verde" | "ambar" | "vermelho" | "neutro";

/** Semáforo de risco: projeção vs meta (>=100% verde; >=80% âmbar; abaixo vermelho). */
export function semaforo(projecao: number | null, meta: number): Semaforo {
  if (meta <= 0 || projecao === null) return "neutro";
  const razao = projecao / meta;
  if (razao >= 1) return "verde";
  if (razao >= 0.8) return "ambar";
  return "vermelho";
}

/** Variação % do ritmo atual vs o mesmo dia útil do mês anterior (null sem base). */
export function ritmoVsMesAnterior(
  realizadoAtual: number,
  realizadoAnterior: number,
): number | null {
  if (realizadoAnterior <= 0) return null;
  return Math.round(((realizadoAtual - realizadoAnterior) / realizadoAnterior) * 100);
}
