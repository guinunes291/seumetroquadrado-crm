// Lógica pura da aba Relatórios (visão executiva): agregações de vendas
// aprovadas para evolução mensal, top empreendimentos e ticket médio.

export type VendaAprovadaRow = {
  valor_venda: number | string | null;
  projeto_nome: string | null;
  data_assinatura: string | null;
};

const valor = (v: number | string | null): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Data de negócio da venda: SEMPRE a assinatura. Nunca a data de aprovação
 * nem a de cadastro — uma venda assinada em junho é resultado de junho,
 * independente de quando foi lançada ou aprovada. A coluna é obrigatória e
 * (desde 20260731122000) sem default, então uma venda nunca herda a data do
 * dia do cadastro; linha sem assinatura simplesmente não entra na janela.
 */
function dataDaVenda(r: VendaAprovadaRow): string | null {
  return r.data_assinatura;
}

export type VendasMes = { mes: string; vendas: number; vgv: number };

/** Agrupa vendas aprovadas por mês (chave YYYY-MM-01, ordenada). */
export function agruparVendasPorMes(rows: VendaAprovadaRow[]): VendasMes[] {
  const meses = new Map<string, { vendas: number; vgv: number }>();
  for (const r of rows) {
    const d = dataDaVenda(r);
    if (!d) continue;
    const mes = `${d.slice(0, 7)}-01`;
    const acc = meses.get(mes) ?? { vendas: 0, vgv: 0 };
    acc.vendas += 1;
    acc.vgv += valor(r.valor_venda);
    meses.set(mes, acc);
  }
  return Array.from(meses.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({ mes, ...v }));
}

export type ProjetoResultado = { projeto: string; vendas: number; vgv: number };

/** Top empreendimentos por VGV (empate: mais vendas). Sem projeto vira "Sem projeto". */
export function topProjetos(rows: VendaAprovadaRow[], n = 8): ProjetoResultado[] {
  const projetos = new Map<string, { vendas: number; vgv: number }>();
  for (const r of rows) {
    // Mesma régua da evolução mensal: sem data de assinatura, a venda não
    // pertence à janela analisada e não pode inflar o ranking de produto.
    if (!dataDaVenda(r)) continue;
    const nome = r.projeto_nome?.trim() || "Sem projeto";
    const acc = projetos.get(nome) ?? { vendas: 0, vgv: 0 };
    acc.vendas += 1;
    acc.vgv += valor(r.valor_venda);
    projetos.set(nome, acc);
  }
  return Array.from(projetos.entries())
    .map(([projeto, v]) => ({ projeto, ...v }))
    .sort((a, b) => b.vgv - a.vgv || b.vendas - a.vendas)
    .slice(0, n);
}

/** Ticket médio (null sem vendas — a UI mostra "—", nunca R$ 0 falso). */
export function ticketMedio(vgv: number, vendas: number): number | null {
  if (!vendas || vendas <= 0) return null;
  return Math.round(vgv / vendas);
}

// ---------------------------------------------------------------------------
// Derivações nominais (sub-abas Vendas/Time) — puras, tipos estruturais.
// ---------------------------------------------------------------------------

export type VendaCorretorRow = { corretor_id: string | null; valor_venda: number | string | null };
export type CorretorVgv = { vendas: number; vgv: number };

/** VGV e nº de vendas por corretor (para enriquecer o ranking do período). */
export function vgvPorCorretor(rows: VendaCorretorRow[]): Map<string, CorretorVgv> {
  const out = new Map<string, CorretorVgv>();
  for (const r of rows) {
    if (!r.corretor_id) continue;
    const acc = out.get(r.corretor_id) ?? { vendas: 0, vgv: 0 };
    acc.vendas += 1;
    acc.vgv += valor(r.valor_venda);
    out.set(r.corretor_id, acc);
  }
  return out;
}

export type ComissaoResumivel = {
  beneficiario_id: string | null;
  beneficiario_nome: string | null;
  tipo: string;
  status: string;
  valor_comissao: number;
  valor_liquido: number;
};

export type ComissaoBeneficiario = {
  chave: string;
  nome: string;
  tipos: string[];
  paga: number;
  pendente: number;
  total: number;
};

/**
 * Comissões do período agrupadas por beneficiário (líquido; cancelada fica de
 * fora). Sem beneficiário atribuído, agrupa pelo tipo ("corretor — a
 * atribuir") para o dinheiro não sumir do relatório.
 */
export function comissoesPorBeneficiario(rows: ComissaoResumivel[]): ComissaoBeneficiario[] {
  const out = new Map<string, ComissaoBeneficiario>();
  for (const r of rows) {
    if (r.status === "cancelada") continue;
    const chave = r.beneficiario_id ?? `tipo:${r.tipo}`;
    const nome = r.beneficiario_nome ?? `(${r.tipo} — a atribuir)`;
    const acc = out.get(chave) ?? { chave, nome, tipos: [], paga: 0, pendente: 0, total: 0 };
    if (!acc.tipos.includes(r.tipo)) acc.tipos.push(r.tipo);
    const liquido = Number(r.valor_liquido ?? r.valor_comissao) || 0;
    if (r.status === "paga") acc.paga += liquido;
    else acc.pendente += liquido;
    acc.total += liquido;
    out.set(chave, acc);
  }
  return Array.from(out.values()).sort((a, b) => b.total - a.total);
}

export type LeadEsquecivel = { corretor_id: string | null; ultima_atividade_em: string };
export type EsquecidosCorretor = { corretor_id: string; total: number; maisAntigo: string };

/** Leads esquecidos agrupados por corretor (mais antigo primeiro no grupo). */
export function esquecidosPorCorretor(rows: LeadEsquecivel[]): EsquecidosCorretor[] {
  const out = new Map<string, EsquecidosCorretor>();
  for (const r of rows) {
    if (!r.corretor_id) continue;
    const acc = out.get(r.corretor_id) ?? {
      corretor_id: r.corretor_id,
      total: 0,
      maisAntigo: r.ultima_atividade_em,
    };
    acc.total += 1;
    if (r.ultima_atividade_em < acc.maisAntigo) acc.maisAntigo = r.ultima_atividade_em;
    out.set(r.corretor_id, acc);
  }
  return Array.from(out.values()).sort((a, b) => b.total - a.total);
}

export type LeadsProjetoContagem = { projeto_id: string | null; nome: string; leads: number };
export type VendaProjetoRow = {
  projeto_id: string | null;
  projeto_nome: string | null;
  valor_venda: number | string | null;
};
export type ConversaoProjeto = {
  nome: string;
  leads: number;
  vendas: number;
  vgv: number;
  /** % leads → venda; null quando não há leads atribuídos ao projeto. */
  conv_pct: number | null;
};

/**
 * Funil por empreendimento: leads captados × vendas assinadas no período.
 * Casa por projeto_id e, para venda sem id, pelo nome; projeto sem lead E sem
 * venda não aparece. Conversão só quando há base de leads (senão null — a UI
 * mostra "—", nunca um % inventado).
 */
export function conversaoPorProjeto(
  leads: LeadsProjetoContagem[],
  vendas: VendaProjetoRow[],
): ConversaoProjeto[] {
  const porId = new Map<string, { nome: string; leads: number; vendas: number; vgv: number }>();
  const porNome = new Map<string, { nome: string; leads: number; vendas: number; vgv: number }>();
  const registrar = (id: string | null, nome: string) => {
    const chaveNome = nome.trim().toLocaleLowerCase("pt-BR");
    const existente = (id && porId.get(id)) || porNome.get(chaveNome);
    if (existente) {
      if (id && !porId.has(id)) porId.set(id, existente);
      if (!porNome.has(chaveNome)) porNome.set(chaveNome, existente);
      return existente;
    }
    const novo = { nome: nome.trim() || "Sem projeto", leads: 0, vendas: 0, vgv: 0 };
    if (id) porId.set(id, novo);
    porNome.set(chaveNome, novo);
    return novo;
  };
  for (const l of leads) {
    const acc = registrar(l.projeto_id, l.nome);
    acc.leads += l.leads;
  }
  for (const v of vendas) {
    const acc = registrar(v.projeto_id, v.projeto_nome?.trim() || "Sem projeto");
    acc.vendas += 1;
    acc.vgv += valor(v.valor_venda);
  }
  const unicos = new Set(porNome.values());
  return Array.from(unicos)
    .filter((r) => r.leads > 0 || r.vendas > 0)
    .map((r) => ({
      ...r,
      conv_pct: r.leads > 0 ? Math.round((r.vendas / r.leads) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.vendas - a.vendas || b.leads - a.leads);
}
