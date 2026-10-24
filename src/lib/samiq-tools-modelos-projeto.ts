// Sami — modelagem dos resultados de empreendimento, crédito e situação do
// corretor (catálogo, ficha do projeto, análise de crédito, check-in/lote).
// Recortado de samiq-tools.ts sem mudança de comportamento.

import { redactSamiQFreeText } from "@/lib/samiq-governance";
import { avisoTabelaSamiQ, situacaoTabelaSamiQ } from "@/lib/samiq-tabela";
import { minimizar } from "./samiq-tools-modelos";

export type ProjetoRow = {
  id: string;
  nome: string | null;
  bairro: string | null;
  cidade: string | null;
  regiao: string | null;
  zona_smq: string | null;
  tipologia: string | null;
  dorms_min: number | null;
  dorms_max: number | null;
  preco_a_partir: number | null;
  renda_minima: number | null;
  status_entrega: string | null;
  ano_entrega: number | null;
  mes_entrega: number | null;
  /** Coluna livre no banco (texto ou lista): só passa por String() e corte. */
  diferenciais: unknown;
};

export function modelarProjetos(rows: ProjetoRow[], limite = 10): unknown {
  // Catálogo é dado PÚBLICO da imobiliária: não passa pela redação de nomes
  // (nomes de empreendimento parecem nomes de pessoa para o regex).
  return rows.slice(0, limite).map((p) => ({
    id: p.id,
    nome: p.nome,
    localizacao: [p.bairro, p.regiao ?? p.zona_smq, p.cidade].filter(Boolean).join(" · "),
    tipologia: p.tipologia,
    dormitorios:
      p.dorms_min != null && p.dorms_max != null && p.dorms_min !== p.dorms_max
        ? `${p.dorms_min} a ${p.dorms_max}`
        : (p.dorms_min ?? p.dorms_max ?? undefined),
    preco_a_partir: p.preco_a_partir,
    renda_minima: p.renda_minima,
    entrega:
      p.status_entrega || p.ano_entrega
        ? [
            p.status_entrega,
            p.mes_entrega && p.ano_entrega ? `${p.mes_entrega}/${p.ano_entrega}` : p.ano_entrega,
          ]
            .filter(Boolean)
            .join(" · ")
        : undefined,
    diferenciais: p.diferenciais
      ? (Array.isArray(p.diferenciais) ? p.diferenciais.join(", ") : String(p.diferenciais)).slice(
          0,
          200,
        )
      : undefined,
  }));
}

// ---------------------------------------------------------------------------
// v8: leituras novas (o que o modelo vê)
// ---------------------------------------------------------------------------

export type MaterialProjetoRow = {
  id: string;
  nome: string | null;
  construtora: string | null;
  endereco: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  regiao: string | null;
  zona_smq: string | null;
  tipologia: string | null;
  dorms_min: number | null;
  dorms_max: number | null;
  metragem_min: number | null;
  metragem_max: number | null;
  vagas: string | null;
  preco_a_partir: number | null;
  renda_minima: number | null;
  status_entrega: string | null;
  mes_entrega: number | null;
  ano_entrega: number | null;
  status_preco: string | null;
  disponibilidade_resumo: string | null;
  perfil_ideal: string | null;
  argumentos_venda: string[] | null;
  book_url: string | null;
  tabela_precos_url: string | null;
  tabela_atualizada_em: string | null;
  preco_atualizado_em: string | null;
};

function intervalo(min: number | null, max: number | null, sufixo = ""): string | undefined {
  if (min == null && max == null) return undefined;
  if (min != null && max != null && min !== max) return `${min} a ${max}${sufixo}`;
  return `${min ?? max}${sufixo}`;
}

/** Ficha do empreendimento: dado público da imobiliária (sem redação de nomes). */
export function modelarMaterialProjeto(p: MaterialProjetoRow, agora: Date = new Date()): unknown {
  const ondeFica =
    p.endereco?.trim() ||
    [p.logradouro, p.numero, p.bairro, p.cidade].filter(Boolean).join(", ") ||
    undefined;
  const diasTabela = p.tabela_atualizada_em
    ? Math.floor((agora.getTime() - Date.parse(p.tabela_atualizada_em)) / 86_400_000)
    : null;
  // Do dia 5 em diante só vale a tabela do mês (samiq-tabela.ts). Sem link de
  // tabela não há o que avisar.
  const situacaoTabela = p.tabela_precos_url
    ? situacaoTabelaSamiQ(p.tabela_atualizada_em, agora)
    : null;
  return {
    id: p.id,
    nome: p.nome,
    construtora: p.construtora,
    onde_fica: ondeFica,
    regiao: [p.bairro, p.regiao ?? p.zona_smq].filter(Boolean).join(" · ") || undefined,
    tipologia: p.tipologia,
    dormitorios: intervalo(p.dorms_min, p.dorms_max),
    metragem: intervalo(p.metragem_min, p.metragem_max, " m²"),
    vagas: p.vagas ?? undefined,
    preco_a_partir: p.preco_a_partir,
    renda_minima: p.renda_minima,
    entrega:
      [
        p.status_entrega,
        p.mes_entrega && p.ano_entrega ? `${p.mes_entrega}/${p.ano_entrega}` : p.ano_entrega,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    status_preco: p.status_preco ?? undefined,
    disponibilidade: p.disponibilidade_resumo?.slice(0, 200) || undefined,
    perfil_ideal: p.perfil_ideal?.slice(0, 200) || undefined,
    argumentos: (p.argumentos_venda ?? []).slice(0, 4).map((a) => String(a).slice(0, 160)),
    tem_book: !!p.book_url,
    tem_tabela: !!p.tabela_precos_url,
    tabela_atualizada_em: p.tabela_atualizada_em,
    tabela_dias: diasTabela,
    tabela_situacao: situacaoTabela?.estado,
    aviso_tabela: situacaoTabela ? avisoTabelaSamiQ(situacaoTabela) : undefined,
  };
}

export type AnaliseCreditoRow = {
  status: string | null;
  banco: string | null;
  modalidade: string | null;
  sistema_amortizacao: string | null;
  valor_financiamento: number | null;
  valor_parcela: number | null;
  prazo_meses: number | null;
  taxa_juros_anual: number | null;
  valor_fgts: number | null;
  valor_subsidio: number | null;
  valor_entrada: number | null;
  valor_imovel_simulacao: number | null;
  renda_familiar: number | null;
  faixa_mcmv: string | null;
  data_aprovacao: string | null;
  validade_ate: string | null;
  observacoes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export function modelarCredito(rows: AnaliseCreditoRow[]): unknown {
  if (rows.length === 0) return { analise: null, aviso: "Nenhuma análise de crédito registrada." };
  const [atual, ...anteriores] = rows;
  return {
    analise: minimizar({
      situacao: atual.status,
      banco: atual.banco,
      modalidade: atual.modalidade,
      amortizacao: atual.sistema_amortizacao,
      financiamento: atual.valor_financiamento,
      parcela: atual.valor_parcela,
      prazo_meses: atual.prazo_meses,
      taxa_ano: atual.taxa_juros_anual,
      fgts: atual.valor_fgts,
      subsidio: atual.valor_subsidio,
      entrada: atual.valor_entrada,
      imovel_simulacao: atual.valor_imovel_simulacao,
      renda_familiar: atual.renda_familiar,
      faixa: atual.faixa_mcmv,
      aprovada_em: atual.data_aprovacao,
      validade_ate: atual.validade_ate,
      observacoes: redactSamiQFreeText(atual.observacoes ?? "", 300) || undefined,
      registrada_em: atual.created_at,
      atualizada_em: atual.updated_at,
    }),
    rodadas_anteriores: anteriores.length,
  };
}

export type SituacaoCorretor = {
  presenca: unknown;
  emAtendimento: unknown;
  lote: unknown;
};

/** Situação do corretor (check-in, Em atendimento, lote) em formato curto. */
export function modelarSituacao(s: SituacaoCorretor): unknown {
  const p = (s.presenca ?? {}) as Record<string, unknown>;
  const c = (p.checkin ?? null) as Record<string, unknown> | null;
  const e = (s.emAtendimento ?? {}) as Record<string, unknown>;
  const l = (s.lote ?? {}) as Record<string, unknown>;
  const filiais = Array.isArray(p.filiais)
    ? (p.filiais as Array<Record<string, unknown>>).map((f) => ({ slug: f.slug, nome: f.nome }))
    : undefined;
  return {
    checkin_hoje: c
      ? {
          modo: c.modo,
          filial: c.filial_nome ?? c.filial_slug ?? undefined,
          apto_roleta: c.apto_roleta,
          motivo: c.motivo ?? undefined,
          localizacao: c.localizacao ?? undefined,
          encerrado: !!c.encerrado_em,
        }
      : null,
    presente: p.presente ?? false,
    vendas_mes_anterior: p.vendas_mes_anterior,
    vendas_minimas_para_casa: p.vendas_minimas,
    casa_liberada: p.casa_liberada,
    exige_localizacao_na_filial: p.exige_localizacao,
    filiais,
    em_atendimento: {
      ocupacao: e.em_atendimento,
      teto: e.teto,
      lotado: e.lotado,
      recebe_lead: e.recebe_lead,
      minha_base: e.minha_base,
      teto_base: e.teto_base,
      retorno_max_dias: e.retorno_max_dias,
    },
    lote_prospeccao: {
      pode_pedir: l.pode_pedir,
      motivo: l.motivo ?? undefined,
      vagas: l.vagas ?? undefined,
      regiao: l.regiao ?? undefined,
    },
  };
}
