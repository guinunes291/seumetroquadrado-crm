// Lógica pura do Funil (Tela 2): agregação de coortes, taxas de passagem e a
// regra de "sem dado suficiente" (cobertura de transições abaixo do limiar).

import type { FunilCoorteRow } from "./queries";

export type EtapaFunil = {
  chave: "leads" | "atingiu_atendimento" | "atingiu_agendado" | "atingiu_visita" | "atingiu_analise" | "vendas";
  label: string;
};

/** Etapas exibidas na leitura de coorte (acumulado: quem CHEGOU a cada uma). */
export const ETAPAS_COORTE: EtapaFunil[] = [
  { chave: "leads", label: "Leads criados" },
  { chave: "atingiu_atendimento", label: "Atendidos" },
  { chave: "atingiu_agendado", label: "Agendaram" },
  { chave: "atingiu_visita", label: "Visitaram" },
  { chave: "atingiu_analise", label: "Análise de crédito" },
  { chave: "vendas", label: "Vendas" },
];

export type CoorteAgregada = {
  leads: number;
  atingiu_atendimento: number;
  atingiu_agendado: number;
  atingiu_visita: number;
  atingiu_analise: number;
  vendas: number;
  perdidos: number;
  /** Cobertura ponderada pelos leads (null sem linhas). */
  cobertura_pct: number | null;
};

/** Soma as coortes mensais do período (ponderando a cobertura pelos leads). */
export function agregarCoortes(rows: FunilCoorteRow[]): CoorteAgregada | null {
  if (rows.length === 0) return null;
  const acc: CoorteAgregada = {
    leads: 0,
    atingiu_atendimento: 0,
    atingiu_agendado: 0,
    atingiu_visita: 0,
    atingiu_analise: 0,
    vendas: 0,
    perdidos: 0,
    cobertura_pct: null,
  };
  let coberturaPonderada = 0;
  for (const r of rows) {
    acc.leads += r.leads;
    acc.atingiu_atendimento += r.atingiu_atendimento;
    acc.atingiu_agendado += r.atingiu_agendado;
    acc.atingiu_visita += r.atingiu_visita;
    acc.atingiu_analise += r.atingiu_analise;
    acc.vendas += r.vendas;
    acc.perdidos += r.perdidos;
    coberturaPonderada += (Number(r.cobertura_pct) || 0) * r.leads;
  }
  acc.cobertura_pct = acc.leads > 0 ? Math.round((coberturaPonderada / acc.leads) * 10) / 10 : null;
  return acc;
}

export type PassagemEtapa = {
  etapa: EtapaFunil;
  volume: number;
  /** % sobre a etapa anterior (null = denominador zero). */
  taxa_passagem_pct: number | null;
  /** % acumulada desde a entrada (leads criados). */
  conversao_acumulada_pct: number | null;
};

/** Taxas de passagem etapa→etapa e conversão acumulada de uma coorte agregada. */
export function taxasDePassagem(c: CoorteAgregada): PassagemEtapa[] {
  const out: PassagemEtapa[] = [];
  let anterior: number | null = null;
  for (const etapa of ETAPAS_COORTE) {
    const volume = c[etapa.chave];
    out.push({
      etapa,
      volume,
      taxa_passagem_pct:
        anterior === null ? null : anterior > 0 ? Math.round((volume / anterior) * 1000) / 10 : null,
      conversao_acumulada_pct: c.leads > 0 ? Math.round((volume / c.leads) * 1000) / 10 : null,
    });
    anterior = volume;
  }
  return out;
}

/**
 * "Sem dado suficiente": coorte com cobertura de transições abaixo do limiar
 * (import legado pré-jun/2026 não tem histórico). A UI suprime as taxas e
 * explica o porquê — nunca mostra 0% falso.
 */
export function coorteSemDado(coberturaPct: number | null, limiar: number): boolean {
  return coberturaPct === null || coberturaPct < limiar;
}

/** Agrupa a série diária de vendas em semanas ISO (curva semanal da Tela 2). */
export function vendasPorSemana(
  serie: Array<{ dia: string; vendas: number }>,
): Array<{ semana: string; vendas: number }> {
  const semanas = new Map<string, number>();
  for (const p of serie) {
    const d = new Date(`${p.dia}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    // Chave = segunda-feira da semana (UTC), estável para ordenação.
    const dow = (d.getUTCDay() + 6) % 7;
    const seg = new Date(d);
    seg.setUTCDate(d.getUTCDate() - dow);
    const chave = seg.toISOString().slice(0, 10);
    semanas.set(chave, (semanas.get(chave) ?? 0) + (p.vendas || 0));
  }
  return Array.from(semanas.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, vendas]) => ({ semana, vendas }));
}
