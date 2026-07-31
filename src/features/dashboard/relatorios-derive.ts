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
