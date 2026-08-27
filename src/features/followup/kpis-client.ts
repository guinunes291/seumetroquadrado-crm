// Camada de dados dos KPIs do Follow-Up — a curva de resposta por nº da
// tentativa (a tese dos 13 toques) e a cobertura da régua por corretor.
//
// SEM recharts aqui, de propósito: este módulo é importado por testes e por
// código fora do bundle lazy; o gráfico vive exclusivamente em kpis-view.tsx.
// RPCs: meu_followup_tentativas (self-serve), gestao_followup_tentativas e
// gestao_followup_cobertura (gate de gestão) — todas da migration
// 20260827130000_followup_regua. Toda leitura passa por rpcWithFallback:
// migration ainda não aplicada degrada para estado vazio, nunca tela quebrada.

import { rpc } from "@/features/dashboard/queries";
import { rpcWithFallback } from "@/lib/supabase-errors";

export type TentativaRow = {
  tentativa: number;
  enviados: number;
  respondidos: number;
  avancaram: number;
};

/** Curva + carimbo da MV (atualizado_em vem repetido em toda linha da RPC). */
export type CurvaTentativas = {
  rows: TentativaRow[];
  atualizadoEm: string | null;
};

export type CoberturaRow = {
  corretor_id: string;
  corretor_nome: string;
  fila_hoje: number;
  vencidos: number;
  esgotados: number;
};

/** bigint do Postgres chega como number OU string conforme o caminho — Number normaliza. */
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type TentativaRaw = {
  tentativa: number | string;
  enviados: number | string;
  respondidos: number | string;
  avancaram: number | string;
  atualizado_em: string | null;
};

function normalizarCurva(data: unknown): CurvaTentativas {
  const raw = Array.isArray(data) ? (data as TentativaRaw[]) : [];
  return {
    rows: raw.map((r) => ({
      tentativa: num(r.tentativa),
      enviados: num(r.enviados),
      respondidos: num(r.respondidos),
      avancaram: num(r.avancaram),
    })),
    atualizadoEm: raw[0]?.atualizado_em ?? null,
  };
}

const CURVA_VAZIA: CurvaTentativas = { rows: [], atualizadoEm: null };

/** Curva do PRÓPRIO corretor (auto-escopo no banco; qualquer papel ativo). */
export async function fetchMinhasTentativas(meses = 6): Promise<CurvaTentativas> {
  return rpcWithFallback(
    async () => {
      const { data, error } = await rpc("meu_followup_tentativas", { _meses: meses });
      if (error) throw error;
      return normalizarCurva(data);
    },
    () => CURVA_VAZIA,
  );
}

/**
 * Curva agregada no escopo de gestão (admin/gestor/superintendente; corretor
 * recebe 'forbidden' — o chamador decide a fonte pelo papel, não esta camada).
 */
export async function fetchTentativasDoTime(
  de?: string | null,
  ate?: string | null,
  corretor?: string | null,
): Promise<CurvaTentativas> {
  return rpcWithFallback(
    async () => {
      const { data, error } = await rpc("gestao_followup_tentativas", {
        _de: de ?? null,
        _ate: ate ?? null,
        _corretor: corretor ?? null,
      });
      if (error) throw error;
      return normalizarCurva(data);
    },
    () => CURVA_VAZIA,
  );
}

type CoberturaRaw = {
  corretor_id: string;
  corretor_nome: string;
  fila_hoje: number | string;
  vencidos: number | string;
  esgotados: number | string;
};

/** Cobertura da régua por corretor (gestão) — já vem ordenada por vencidos desc. */
export async function fetchCobertura(): Promise<CoberturaRow[]> {
  return rpcWithFallback(
    async () => {
      const { data, error } = await rpc("gestao_followup_cobertura", {});
      if (error) throw error;
      const raw = Array.isArray(data) ? (data as CoberturaRaw[]) : [];
      return raw.map((r) => ({
        corretor_id: r.corretor_id,
        corretor_nome: r.corretor_nome,
        fila_hoje: num(r.fila_hoje),
        vencidos: num(r.vencidos),
        esgotados: num(r.esgotados),
      }));
    },
    () => [],
  );
}

// ---------------------------------------------------------------------------
// Derivações puras (testadas em tests/followup-kpis.test.ts)
// ---------------------------------------------------------------------------

/** Reativação = resposta do 3º toque em diante (lead que só voltou insistindo). */
export const REATIVADO_A_PARTIR_DO_TOQUE = 3;

/**
 * Taxa de resposta agregada em % (0–100, arredondada a 1 casa).
 * Sem enviados não há taxa: devolve 0 — nunca NaN/Infinity.
 */
export function taxaResposta(rows: TentativaRow[]): number {
  const enviados = rows.reduce((s, r) => s + r.enviados, 0);
  if (enviados <= 0) return 0;
  const respondidos = rows.reduce((s, r) => s + r.respondidos, 0);
  return Math.round((respondidos / enviados) * 1000) / 10;
}

export type ResumoKpisFollowUp = {
  enviados: number;
  respondidos: number;
  taxaPct: number;
  /** Respondidos em tentativa >= 3 — o valor que a régua longa recupera. */
  reativados: number;
  avancaram: number;
};

/** Os 4 números do topo da tela, derivados da curva num único passe de leitura. */
export function resumoKpis(rows: TentativaRow[]): ResumoKpisFollowUp {
  return {
    enviados: rows.reduce((s, r) => s + r.enviados, 0),
    respondidos: rows.reduce((s, r) => s + r.respondidos, 0),
    taxaPct: taxaResposta(rows),
    reativados: rows
      .filter((r) => r.tentativa >= REATIVADO_A_PARTIR_DO_TOQUE)
      .reduce((s, r) => s + r.respondidos, 0),
    avancaram: rows.reduce((s, r) => s + r.avancaram, 0),
  };
}
