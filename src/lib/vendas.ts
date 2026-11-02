// Registro de venda compartilhado pelos dois pontos que criam uma venda:
// o ContractSaleDialog (Kanban/etapa) e o RegistrarVendaDialog (atalho global).
// A venda nasce pendente; somente a RPC gerencial `aprovar_venda` produz
// comissão, ranking, VGV e a transição do lead para contrato fechado — e a
// aprovação exige os três marcos de efetivação ativos (contrato assinado,
// ato pago e apto para repasse), atualizados via `atualizar_efetivacao_venda`.

import { supabase } from "@/integrations/supabase/client";
import { validarSplit, type SplitPercentuais } from "@/lib/comissoes";

/** Marcos de efetivação da venda, na ordem em que acontecem na esteira. */
export const EFETIVACAO_FLAGS = [
  { key: "contrato_assinado", label: "Contrato Assinado" },
  { key: "ato_pago", label: "Ato Pago" },
  { key: "apto_repasse", label: "Apto para repasse" },
] as const;

export type EfetivacaoFlagKey = (typeof EFETIVACAO_FLAGS)[number]["key"];

export type EfetivacaoVenda = Record<EfetivacaoFlagKey, boolean>;

/** Venda efetivada = os três marcos ativos (condição para aprovar). */
export function vendaEfetivada(venda: EfetivacaoVenda): boolean {
  return EFETIVACAO_FLAGS.every((flag) => venda[flag.key]);
}

/** Rótulos dos marcos que ainda faltam para a venda poder ser aprovada. */
export function marcosPendentes(venda: EfetivacaoVenda): string[] {
  return EFETIVACAO_FLAGS.filter((flag) => !venda[flag.key]).map((flag) => flag.label);
}

/**
 * Liga/desliga marcos de efetivação de uma venda rascunho/pendente via RPC
 * (gestão ou o corretor da venda). Campos omitidos ficam como estão.
 */
export async function atualizarEfetivacaoVenda(
  vendaId: string,
  patch: Partial<EfetivacaoVenda>,
): Promise<void> {
  const { error } = await supabase.rpc("atualizar_efetivacao_venda", {
    p_venda_id: vendaId,
    p_contrato_assinado: patch.contrato_assinado,
    p_ato_pago: patch.ato_pago,
    p_apto_repasse: patch.apto_repasse,
  });
  if (error) throw error;
}

/** Validação pura da venda. Retorna a mensagem de erro ou `null` se ok. */
export function validarVenda(args: {
  valorVenda: number;
  dataAssinatura: string;
  hoje: string;
  split: SplitPercentuais | null;
}): string | null {
  if (!Number.isFinite(args.valorVenda) || args.valorVenda <= 0) {
    return "Informe um valor de venda válido";
  }
  if (args.dataAssinatura > args.hoje) {
    return "A data de assinatura não pode ser futura";
  }
  if (!args.split) {
    return "Percentuais de comissão inválidos — revise os campos";
  }
  const check = validarSplit(args.split);
  if (!check.ok) return check.erros[0];
  return null;
}

export type RegistrarVendaInput = {
  leadId: string;
  corretorId: string | null;
  criadoPorId: string | null;
  projetoId: string | null;
  projetoNome: string | null;
  /** Unidade/apartamento vendido (opcional, texto curto). */
  unidade?: string | null;
  valorVenda: number;
  dataAssinatura: string;
  split: SplitPercentuais;
  observacoes?: string | null;
  /** Mês previsto para recebimento da construtora ("AAAA-MM"). */
  previsaoRecebimento?: string | null;
  /** Marcos de efetivação já cumpridos no momento do cadastro (opcional). */
  efetivacao?: Partial<EfetivacaoVenda>;
};

/**
 * Registra um rascunho comercial em estado pendente de aprovação. Não há efeito
 * em lead, metas ou comissão nesta etapa.
 */
const registrosEmAndamento = new Set<string>();
const vendaExistenteMensagem =
  "Este cliente já tem uma venda em rascunho, aguardando aprovação ou aprovada. Confira a venda existente em Vendas antes de registrar outra.";

export async function registrarVenda(input: RegistrarVendaInput): Promise<string> {
  if (registrosEmAndamento.has(input.leadId)) {
    throw new Error("O cadastro da venda deste cliente já está em andamento. Aguarde a confirmação.");
  }
  registrosEmAndamento.add(input.leadId);
  try {
    const { data: existente, error: consultaErro } = await supabase
      .from("vendas")
      .select("id")
      .eq("lead_id", input.leadId)
      .in("status_venda", ["rascunho", "pendente", "aprovada"])
      .limit(1);
    if (consultaErro) throw consultaErro;
    if (existente?.length) throw new Error(vendaExistenteMensagem);
    return await inserirVendaPendente(input);
  } finally {
    registrosEmAndamento.delete(input.leadId);
  }
}

async function inserirVendaPendente(input: RegistrarVendaInput): Promise<string> {
  const { data: criada, error: insErr } = await supabase
    .from("vendas")
    .insert({
      lead_id: input.leadId,
      corretor_id: input.corretorId,
      criado_por_id: input.criadoPorId,
      projeto_id: input.projetoId,
      projeto_nome: input.projetoNome,
      unidade: input.unidade?.trim() || null,
      valor_venda: input.valorVenda,
      data_assinatura: input.dataAssinatura,
      percentual_comissao: input.split.total,
      percentual_corretor: input.split.corretor,
      percentual_gerente: input.split.gerente,
      percentual_superintendente: input.split.superintendente,
      observacoes: input.observacoes?.trim() || null,
      previsao_recebimento: input.previsaoRecebimento ? `${input.previsaoRecebimento}-01` : null,
      status_venda: "pendente",
      contrato_assinado: input.efetivacao?.contrato_assinado ?? false,
      ato_pago: input.efetivacao?.ato_pago ?? false,
      apto_repasse: input.efetivacao?.apto_repasse ?? false,
    })
    .select("id")
    .single();
  if (insErr) {
    if (insErr.code === "23505" && insErr.message.includes("uq_vendas_lead_ativa")) {
      throw new Error(vendaExistenteMensagem);
    }
    throw insErr;
  }
  return criada.id;
}
