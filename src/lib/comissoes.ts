import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/fetch-all-paged";
import type { Intent, Hue } from "@/lib/status-tones";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Vocabulário canônico. Valores legados/desconhecidos são tolerados na UI. */
export type ComissaoStatus = "pendente" | "paga" | "cancelada";
export type ComissaoTipo = "corretor" | "gerente" | "superintendente";

export type VendaEmbed = {
  data_assinatura: string;
  projeto_nome: string | null;
  valor_venda: number;
  distrato: boolean;
  corretor_id: string | null;
};

export type ComissaoRow = {
  id: string;
  venda_id: string | null;
  lead_id: string | null;
  beneficiario_id: string | null;
  beneficiario_nome: string | null;
  tipo: string;
  status: string;
  data_pagamento: string | null;
  valor_base: number;
  percentual: number;
  valor_comissao: number;
  percentual_desconto: number;
  valor_liquido: number;
  contrato_vgv: number;
  observacoes: string | null;
  created_at: string;
  venda: VendaEmbed | null;
};

export type SplitPercentuais = {
  total: number;
  corretor: number;
  gerente: number;
  superintendente: number;
};

/** Os 4 campos do split como digitados nos diálogos de venda. */
export type SplitTexto = {
  total: string;
  corretor: string;
  gerente: string;
  superintendente: string;
};

// ---------------------------------------------------------------------------
// Calculadora / validação (puras)
// ---------------------------------------------------------------------------

/**
 * Arredonda para 2 casas (centavos). Informativo no front: a fonte da verdade
 * é o `round(numeric, 2)` do trigger no banco (half-up exato em numeric);
 * casos raros de meio-centavo em float podem divergir 1 centavo.
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Converte um percentual digitado ("1,85" ou "3.50") em número. Retorna null
 * para vazio/inválido — quem chama decide o erro (nunca zerar em silêncio).
 */
export function parsePercent(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "" || !/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Converte os 4 campos digitados do split; null se algum estiver vazio/inválido. */
export function parseSplit(valores: SplitTexto): SplitPercentuais | null {
  const total = parsePercent(valores.total);
  const corretor = parsePercent(valores.corretor);
  const gerente = parsePercent(valores.gerente);
  const superintendente = parsePercent(valores.superintendente);
  if (total === null || corretor === null || gerente === null || superintendente === null) {
    return null;
  }
  return { total, corretor, gerente, superintendente };
}

/** Valores em R$ de cada parte da comissão (percentuais em pontos: 3.5 = 3,5%). */
export function calcularComissoes(valorVenda: number, p: SplitPercentuais) {
  return {
    imobiliaria: round2((valorVenda * p.total) / 100),
    corretor: round2((valorVenda * p.corretor) / 100),
    gerente: round2((valorVenda * p.gerente) / 100),
    superintendente: round2((valorVenda * p.superintendente) / 100),
  };
}

/**
 * Regras do split: cada percentual em [0, 100] e a soma das partes não pode
 * exceder o total (a diferença é a margem da imobiliária). Total 0 é permitido
 * mas gera aviso.
 */
export function validarSplit(p: SplitPercentuais): {
  ok: boolean;
  erros: string[];
  avisos: string[];
} {
  const erros: string[] = [];
  const avisos: string[] = [];
  const campos: Array<[string, number]> = [
    ["Total", p.total],
    ["Corretor", p.corretor],
    ["Gerente", p.gerente],
    ["Superintendente", p.superintendente],
  ];
  for (const [rotulo, valor] of campos) {
    if (valor < 0 || valor > 100) erros.push(`${rotulo}: percentual deve estar entre 0 e 100.`);
  }
  const partes = p.corretor + p.gerente + p.superintendente;
  if (partes > p.total + 1e-9) {
    erros.push("A soma das partes (corretor + gerente + superintendente) excede o total.");
  }
  if (erros.length === 0 && p.total === 0) {
    avisos.push("Comissão total em 0% — nenhuma comissão será gerada com valor.");
  }
  return { ok: erros.length === 0, erros, avisos };
}

/** Valor líquido após desconto percentual (ex.: antecipação). */
export function calcularLiquido(valorComissao: number, percentualDesconto: number): number {
  return round2(valorComissao * (1 - percentualDesconto / 100));
}

// ---------------------------------------------------------------------------
// Rótulos / tons
// ---------------------------------------------------------------------------

export function statusLabel(s: string): string {
  return (
    {
      pendente: "Pendente",
      paga: "Paga",
      cancelada: "Cancelada",
      // Legados da tela antiga — tolerados caso existam linhas históricas.
      recebido: "Recebida",
      em_disputa: "Em disputa",
    }[s] ?? s
  );
}

export function statusIntent(s: string): Intent {
  const map: Record<string, Intent> = {
    pendente: "warning",
    paga: "success",
    recebido: "success",
    cancelada: "neutral",
    em_disputa: "danger",
  };
  return map[s] ?? "neutral";
}

export function tipoLabel(t: string): string {
  return (
    {
      corretor: "Corretor",
      gerente: "Gerente",
      superintendente: "Superintendente",
    }[t] ?? t
  );
}

export function tipoHue(t: string): Hue {
  const map: Record<string, Hue> = {
    corretor: "blue",
    gerente: "violet",
    superintendente: "teal",
  };
  return map[t] ?? "slate";
}

/** BRL com centavos (o formatBRL de projetos.ts arredonda para inteiro). */
export function formatBRL2(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------------------
// Período (mês-calendário sobre colunas `date` — padrão de metas.tsx)
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** Limites do mês como date strings: [ini, fim) — fim é o dia 1º do mês seguinte. */
export function mesBounds(ano: number, mes: number): { ini: string; fim: string } {
  const ini = `${ano}-${pad(mes)}-01`;
  const fim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${pad(mes + 1)}-01`;
  return { ini, fim };
}

/** Últimos `n` meses (mais recente primeiro): value "YYYY-MM", label "julho de 2026". */
export function ultimosMeses(n: number, hoje = new Date()): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  let ano = hoje.getFullYear();
  let mes = hoje.getMonth() + 1;
  for (let i = 0; i < n; i++) {
    const label = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
    out.push({
      value: `${ano}-${pad(mes)}`,
      label: label.charAt(0).toUpperCase() + label.slice(1),
    });
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
  }
  return out;
}

export function parseMesValue(v: string): { ano: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return { ano, mes };
}

// ---------------------------------------------------------------------------
// Totais (puras)
// ---------------------------------------------------------------------------

export type ComissoesTotais = {
  /** VGV somado uma vez por venda (linhas da mesma venda compartilham o contrato_vgv). */
  vgv: number;
  pendente: number;
  paga: number;
  cancelada: number;
  /** Pendente + paga (cancelada fora). */
  total: number;
};

export function computeTotais(rows: ComissaoRow[]): ComissoesTotais {
  const vendasVistas = new Set<string>();
  let vgv = 0;
  let pendente = 0;
  let paga = 0;
  let cancelada = 0;
  for (const r of rows) {
    if (r.venda_id) {
      if (!vendasVistas.has(r.venda_id)) {
        vendasVistas.add(r.venda_id);
        vgv += Number(r.contrato_vgv) || 0;
      }
    } else {
      vgv += Number(r.contrato_vgv) || 0;
    }
    const liquido = Number(r.valor_liquido) || 0;
    if (r.status === "pendente") pendente += liquido;
    else if (r.status === "paga" || r.status === "recebido") paga += liquido;
    else if (r.status === "cancelada") cancelada += liquido;
  }
  return {
    vgv: round2(vgv),
    pendente: round2(pendente),
    paga: round2(paga),
    cancelada: round2(cancelada),
    total: round2(pendente + paga),
  };
}

/** VGV e comissão da imobiliária derivados das vendas do período (exclui distratos). */
export function computeResumoVendas(
  vendas: Array<{ valor_venda: number; percentual_comissao: number; distrato: boolean }>,
): { vgv: number; comissaoImobiliaria: number } {
  let vgv = 0;
  let comissao = 0;
  for (const v of vendas) {
    if (v.distrato) continue;
    const valor = Number(v.valor_venda) || 0;
    vgv += valor;
    comissao += round2((valor * (Number(v.percentual_comissao) || 0)) / 100);
  }
  return { vgv: round2(vgv), comissaoImobiliaria: round2(comissao) };
}

/** Beneficiários únicos presentes nas linhas (para o filtro do gestor). */
export function beneficiariosDasLinhas(rows: ComissaoRow[]): { id: string; nome: string }[] {
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.beneficiario_id && !map.has(r.beneficiario_id)) {
      map.set(r.beneficiario_id, r.beneficiario_nome ?? "Sem nome");
    }
  }
  return Array.from(map.entries())
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Linhas para o export xlsx do contador (valores numéricos crus). */
export function buildExportRows(rows: ComissaoRow[]): Record<string, string | number | null>[] {
  return rows.map((r) => ({
    "Data assinatura": r.venda?.data_assinatura ?? null,
    Projeto: r.venda?.projeto_nome ?? null,
    Beneficiário: r.beneficiario_nome ?? `${tipoLabel(r.tipo)} (a atribuir)`,
    Tipo: tipoLabel(r.tipo),
    VGV: Number(r.contrato_vgv) || 0,
    "Percentual (%)": Number(r.percentual) || 0,
    "Valor comissão": Number(r.valor_comissao) || 0,
    "Desconto (%)": Number(r.percentual_desconto) || 0,
    "Valor líquido": Number(r.valor_liquido) || 0,
    Status: statusLabel(r.status),
    "Data pagamento": r.data_pagamento,
    Observações: r.observacoes,
  }));
}

/** Ordena por data da venda (desc, nulls por último) e desempata por criação. */
export function sortComissoes<T extends ComissaoRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = a.venda?.data_assinatura ?? "";
    const db = b.venda?.data_assinatura ?? "";
    if (da !== db) return db.localeCompare(da);
    return b.created_at.localeCompare(a.created_at);
  });
}

// ---------------------------------------------------------------------------
// Acesso a dados
// ---------------------------------------------------------------------------

const SELECT_BASE =
  "id, venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status, data_pagamento, " +
  "valor_base, percentual, valor_comissao, percentual_desconto, valor_liquido, contrato_vgv, " +
  "observacoes, created_at";
const VENDA_EMBED =
  "venda:vendas(data_assinatura, projeto_nome, valor_venda, distrato, corretor_id, status_venda)";
const VENDA_EMBED_INNER = VENDA_EMBED.replace("venda:vendas(", "venda:vendas!inner(");

export type ComissoesFiltro = {
  /** Limites de mês-calendário sobre `vendas.data_assinatura` da venda aprovada. */
  mes?: { ini: string; fim: string } | null;
  status?: ComissaoStatus | null;
};

export async function listComissoes(filtro: ComissoesFiltro = {}): Promise<ComissaoRow[]> {
  // Comissão operacional sempre nasce de uma venda atualmente aprovada. O
  // ledger preserva cancelamentos/estornos para auditoria separada.
  const select = `${SELECT_BASE}, ${VENDA_EMBED_INNER}`;
  const rows = await fetchAllPaged<ComissaoRow>(async (from, to) => {
    let q = supabase
      .from("comissoes")
      .select(select)
      .eq("venda.status_venda", "aprovada")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to);
    if (filtro.status) q = q.eq("status", filtro.status);
    if (filtro.mes) {
      q = q
        .gte("venda.data_assinatura", filtro.mes.ini)
        .lt("venda.data_assinatura", filtro.mes.fim);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as ComissaoRow[];
  });
  return sortComissoes(rows);
}

/** Vendas aprovadas no período para os cards (VGV e comissão da imobiliária). */
export async function listVendasPeriodo(
  mes?: { ini: string; fim: string } | null,
): Promise<
  Array<{ id: string; valor_venda: number; percentual_comissao: number; distrato: boolean }>
> {
  return fetchAllPaged(async (from, to) => {
    let q = supabase
      .from("vendas")
      .select("id, valor_venda, percentual_comissao, distrato")
      .eq("status_venda", "aprovada")
      .order("aprovado_em", { ascending: false })
      .order("id")
      .range(from, to);
    if (mes) q = q.gte("aprovado_em", mes.ini).lt("aprovado_em", mes.fim);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  });
}

export async function marcarComissaoPaga(id: string, dataPagamento: string) {
  const { error } = await supabase
    .from("comissoes")
    .update({ status: "paga", data_pagamento: dataPagamento })
    .eq("id", id);
  if (error) throw error;
}

export async function reverterComissaoPendente(id: string) {
  const { error } = await supabase
    .from("comissoes")
    .update({ status: "pendente", data_pagamento: null })
    .eq("id", id);
  if (error) throw error;
}

export async function atribuirBeneficiario(
  id: string,
  beneficiarioId: string,
  beneficiarioNome: string,
) {
  const { error } = await supabase
    .from("comissoes")
    .update({ beneficiario_id: beneficiarioId, beneficiario_nome: beneficiarioNome })
    .eq("id", id);
  if (error) throw error;
}

export async function aplicarDesconto(
  id: string,
  percentualDesconto: number,
  valorLiquido: number,
) {
  const { error } = await supabase
    .from("comissoes")
    .update({ percentual_desconto: percentualDesconto, valor_liquido: valorLiquido })
    .eq("id", id);
  if (error) throw error;
}
