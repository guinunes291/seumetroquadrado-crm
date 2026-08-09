// Lógica pura do Raio-X do Corretor (relatório individual da aba Time).
// Comparações com a média do time, funil lado a lado, evolução trimestral,
// resumo de comissões e o export multi-abas — tudo testável sem banco.

import { formatDuration } from "@/lib/duracao";
import type { CoorteAgregada } from "./funil-derive";
import { taxasDePassagem } from "./funil-derive";
import type { PerformanceDrillRow, PerformanceRow } from "./queries";

// ---------------------------------------------------------------------------
// Comparação com a média do time ("nunca número solo")
// ---------------------------------------------------------------------------

export type ComparacaoMetrica = {
  chave: string;
  label: string;
  valor: number | null;
  mediaTime: number | null;
  /** % acima/abaixo da média (null sem base). */
  deltaPct: number | null;
  /** true quando valor MENOR é melhor (ex.: 1ª resposta). */
  menorMelhor: boolean;
};

const AMOSTRA_MINIMA = 3;

function media(valores: Array<number | null>): number | null {
  const v = valores.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length < AMOSTRA_MINIMA) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

function delta(valor: number | null, base: number | null): number | null {
  if (valor === null || base === null || base === 0) return null;
  return Math.round(((valor - base) / base) * 100);
}

/** Métricas do corretor vs. a média dos DEMAIS corretores com atividade. */
export function compararComTime(
  corretor: PerformanceRow,
  time: PerformanceRow[],
): ComparacaoMetrica[] {
  const outros = time.filter(
    (r) => r.corretor_id !== corretor.corretor_id && r.leads_recebidos > 0,
  );
  const defs: Array<{
    chave: string;
    label: string;
    get: (r: PerformanceRow) => number | null;
    menorMelhor?: boolean;
  }> = [
    { chave: "vendas", label: "Vendas", get: (r) => r.vendas },
    { chave: "vgv", label: "VGV", get: (r) => r.vgv },
    { chave: "leads_recebidos", label: "Leads recebidos", get: (r) => r.leads_recebidos },
    { chave: "contatos", label: "Contatos reais", get: (r) => r.contatos },
    { chave: "visitas_realizadas", label: "Visitas realizadas", get: (r) => r.visitas_realizadas },
    {
      // O valor agora sai formatado em hh:mm (formatDuration) — a unidade
      // deixa de morar no label.
      chave: "primeira_resposta",
      label: "1ª resposta",
      get: (r) => r.primeira_resposta_p50_min,
      menorMelhor: true,
    },
  ];
  return defs.map((d) => {
    const valor = d.get(corretor);
    const mediaTime = media(outros.map(d.get));
    return {
      chave: d.chave,
      label: d.label,
      valor,
      mediaTime,
      deltaPct: delta(valor, mediaTime),
      menorMelhor: d.menorMelhor ?? false,
    };
  });
}

// ---------------------------------------------------------------------------
// Funil lado a lado (dele × time)
// ---------------------------------------------------------------------------

export type PassagemComparada = {
  etapa: string;
  minhaTaxa: number | null;
  taxaTime: number | null;
  /** pontos percentuais de diferença (positivo = acima do time). */
  gapPp: number | null;
};

/** Taxas de passagem do corretor lado a lado com as do time (mesma janela). */
export function funilLadoALado(
  minha: CoorteAgregada | null,
  time: CoorteAgregada | null,
): PassagemComparada[] {
  const minhas = minha ? taxasDePassagem(minha) : null;
  const doTime = time ? taxasDePassagem(time) : null;
  const etapas = (doTime ?? minhas ?? []).map((p) => p.etapa);
  return etapas
    .filter((e) => e.chave !== "leads")
    .map((e) => {
      const m = minhas?.find((p) => p.etapa.chave === e.chave)?.taxa_passagem_pct ?? null;
      const t = doTime?.find((p) => p.etapa.chave === e.chave)?.taxa_passagem_pct ?? null;
      return {
        etapa: e.label,
        minhaTaxa: m,
        taxaTime: t,
        gapPp: m !== null && t !== null ? Math.round((m - t) * 10) / 10 : null,
      };
    });
}

// ---------------------------------------------------------------------------
// Evolução trimestral (conversa de comissão escalonada)
// ---------------------------------------------------------------------------

export type Trimestre = { trimestre: string; vendas: number; vgv: number; visitas: number };

export function evolucaoTrimestral(serie: PerformanceDrillRow[]): Trimestre[] {
  const grupos = new Map<string, Trimestre>();
  for (const m of serie) {
    const d = new Date(`${m.mes}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    const chave = `${d.getUTCFullYear()}-T${q}`;
    const acc = grupos.get(chave) ?? { trimestre: chave, vendas: 0, vgv: 0, visitas: 0 };
    acc.vendas += m.vendas;
    acc.vgv += Number(m.vgv) || 0;
    acc.visitas += m.visitas_realizadas;
    grupos.set(chave, acc);
  }
  return Array.from(grupos.values()).sort((a, b) => a.trimestre.localeCompare(b.trimestre));
}

// ---------------------------------------------------------------------------
// Janela de análise (período personalizado)
// ---------------------------------------------------------------------------

/**
 * Quantos meses-calendário buscar no drill para cobrir a janela: do mês de
 * `de` até o mês de `hoje` (inclusive) — a RPC de drill ancora em now().
 * Limitado a 1..24 (a MV guarda ~12 meses; acima disso volta vazio, honesto).
 */
export function mesesDesde(deIso: string, hojeIso: string): number {
  const de = new Date(`${deIso.slice(0, 10)}T12:00:00Z`);
  const hoje = new Date(`${hojeIso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(de.getTime()) || Number.isNaN(hoje.getTime())) return 6;
  const n =
    (hoje.getUTCFullYear() - de.getUTCFullYear()) * 12 +
    (hoje.getUTCMonth() - de.getUTCMonth()) +
    1;
  return Math.min(24, Math.max(1, n));
}

/** Recorta a série mensal aos meses-calendário que contêm [de, ate]. */
export function filtrarSerieJanela<T extends { mes: string }>(
  serie: T[],
  de: string | null,
  ate: string | null,
): T[] {
  const mesDe = de ? de.slice(0, 7) : null;
  const mesAte = ate ? ate.slice(0, 7) : null;
  return serie.filter((m) => {
    const mm = m.mes.slice(0, 7);
    return (!mesDe || mm >= mesDe) && (!mesAte || mm <= mesAte);
  });
}

// ---------------------------------------------------------------------------
// Comissões (resumo)
// ---------------------------------------------------------------------------

export type ComissaoRow = {
  status: string;
  valor_liquido: number | string | null;
  valor_comissao: number | string | null;
};

const COMISSAO_ABERTA = new Set(["pendente", "aprovada", "liberada", "aguardando"]);

export function resumoComissoes(rows: ComissaoRow[]): { pago: number; aberto: number } {
  let pago = 0;
  let aberto = 0;
  for (const r of rows) {
    const valor = Number(r.valor_liquido ?? r.valor_comissao) || 0;
    if (r.status === "paga") pago += valor;
    else if (COMISSAO_ABERTA.has(r.status)) aberto += valor;
  }
  return { pago, aberto };
}

// ---------------------------------------------------------------------------
// Export multi-abas
// ---------------------------------------------------------------------------

export function raioXParaSheets(args: {
  nome: string;
  comparacoes: ComparacaoMetrica[];
  serie: PerformanceDrillRow[];
  funil: PassagemComparada[];
  perdas: Array<{ categoria: string; quantidade: number; vgv_estimado: number | null }>;
}): Array<{ name: string; rows: Array<Record<string, unknown>> }> {
  return [
    {
      name: "Resumo",
      rows: args.comparacoes.map((c) => ({
        Métrica: c.label,
        [args.nome]: c.valor ?? "sem dado",
        "Média do time": c.mediaTime === null ? "sem dado" : Math.round(c.mediaTime * 10) / 10,
        "Vs. time (%)": c.deltaPct ?? "",
      })),
    },
    {
      name: "Evolução mensal",
      rows: args.serie.map((m) => ({
        Mês: m.mes,
        "Leads recebidos": m.leads_recebidos,
        Contatos: m.contatos,
        Agendamentos: m.agendamentos_criados,
        "Visitas realizadas": m.visitas_realizadas,
        "No-shows": m.no_shows,
        Análises: m.analises,
        Vendas: m.vendas,
        "VGV (R$)": Number(m.vgv) || 0,
        // Número em minutos preservado para análises externas; hh:mm ao lado.
        "1ª resposta p50 (min)": m.primeira_resposta_p50_min ?? "",
        "1ª resposta p50 (hh:mm)": formatDuration(m.primeira_resposta_p50_min),
      })),
    },
    {
      name: "Funil vs time",
      rows: args.funil.map((f) => ({
        Etapa: f.etapa,
        "Taxa do corretor (%)": f.minhaTaxa ?? "sem dado",
        "Taxa do time (%)": f.taxaTime ?? "sem dado",
        "Gap (p.p.)": f.gapPp ?? "",
      })),
    },
    {
      name: "Perdas",
      rows: args.perdas.map((p) => ({
        Categoria: p.categoria,
        Leads: p.quantidade,
        "VGV estimado (R$)": p.vgv_estimado ?? "",
      })),
    },
  ];
}
