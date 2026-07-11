// Registro de venda compartilhado pelos dois pontos que criam uma venda:
// o ContractSaleDialog (Kanban/etapa) e o RegistrarVendaDialog (atalho global).
// A venda nasce pendente; somente a RPC gerencial `aprovar_venda` produz
// comissão, ranking, VGV e a transição do lead para contrato fechado.

import { supabase } from "@/integrations/supabase/client";
import { validarSplit, type SplitPercentuais } from "@/lib/comissoes";

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
  valorVenda: number;
  dataAssinatura: string;
  split: SplitPercentuais;
  observacoes?: string | null;
};

/**
 * Registra um rascunho comercial em estado pendente de aprovação. Não há efeito
 * em lead, metas ou comissão nesta etapa.
 */
export async function registrarVenda(input: RegistrarVendaInput): Promise<string> {
  const { data: criada, error: insErr } = await supabase
    .from("vendas")
    .insert({
      lead_id: input.leadId,
      corretor_id: input.corretorId,
      criado_por_id: input.criadoPorId,
      projeto_id: input.projetoId,
      projeto_nome: input.projetoNome,
      valor_venda: input.valorVenda,
      data_assinatura: input.dataAssinatura,
      percentual_comissao: input.split.total,
      percentual_corretor: input.split.corretor,
      percentual_gerente: input.split.gerente,
      percentual_superintendente: input.split.superintendente,
      observacoes: input.observacoes?.trim() || null,
      status_venda: "pendente",
    })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return criada.id;
}
