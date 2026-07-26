// Tipos compartilhados da aba "Conciliação" (Etapa 2).
// Client-safe: a UI importa daqui, nunca de *.server.ts.

export type ContaBancaria = "itau_ltda" | "c6_ei";

export const CONTAS: { valor: ContaBancaria; rotulo: string; detalhe: string }[] = [
  {
    valor: "itau_ltda",
    rotulo: "Itaú · SEU METRO QUADRADO LTDA",
    detalhe: "CNPJ 66.930.565/0001-86 — conta desde 22/05/2026",
  },
  {
    valor: "c6_ei",
    rotulo: "C6 · GUILHERME NUNES SERVIÇOS IMOBILIÁRIOS (EI)",
    detalhe: "CNPJ 55.579.001/0001-24 — conta histórica",
  },
];

/** Desconto de NF aplicado no pagamento das comissões (débito = valor × 0,94). */
export const FATOR_NF = 0.94;

/** Data de referência falsa usada no lote histórico de comissões pagas. */
export const DATA_REFERENCIA_FALSA = "2026-07-26";

export const MOTIVO_TRANSFERENCIA_PROPRIA =
  "transferência entre contas próprias (PJ→PF/PF→PJ)";

export const MOTIVOS_IGNORAR = [
  "Tarifa bancária",
  "Saldo / aplicação automática",
  "Fatura de cartão",
  "Imposto",
  "Despesa não relacionada a comissão",
  MOTIVO_TRANSFERENCIA_PROPRIA,
] as const;

export type TransacaoItem = {
  id: string;
  conta: ContaBancaria;
  data: string;
  valor: number;
  descricao: string;
  contraparte: string | null;
  fitid: string;
  arquivo: string | null;
  status: "pendente" | "conciliada" | "ignorada";
  motivo_ignorada: string | null;
  /** Existe crédito de mesmo valor e mesma data em outra conta importada. */
  gemeo_transferencia: boolean;
  /** Comissões/vendas vinculadas ativas. */
  vinculos: {
    id: string;
    tipo: "comissao" | "venda";
    alvo_id: string;
    rotulo: string;
    data_anterior: string | null;
    confirmado_por_nome: string | null;
    created_at: string | null;
  }[];
};

export type SugestaoComissao = {
  tipo: "exato" | "lote";
  /** integral = valor cheio; liquido_nf = valor × 0,94. */
  modo: "integral" | "liquido_nf";
  /** forte = dentro da tolerância; quase = diferença até 1%. */
  forca: "forte" | "quase";
  /** Diferença em R$ entre o débito e o valor esperado. */
  diferenca: number;
  /** MEMO do PIX cita cliente ou empreendimento de uma das comissões. */
  cita_venda: boolean;
  beneficiario_nome: string;
  comissoes: {
    id: string;
    valor_liquido: number;
    data_pagamento: string | null;
    projeto_nome: string | null;
  }[];
  total: number;
  /** Quanto maior, melhor o encaixe (proximidade de data + nome na descrição). */
  score: number;
};


export type PainelConciliacao = {
  progresso: {
    comissoes_pagas: number;
    comissoes_conciliadas: number;
    valor_total: number;
    valor_conciliado: number;
  };
  transacoes: TransacaoItem[];
  /** Sugestões por id de transação (apenas pendentes). */
  sugestoes: Record<string, { debito: SugestaoComissao[]; credito: SugestaoVenda[] }>;
  caixa: {
    conta: ContaBancaria;
    mes: string;
    entradas: number;
    saidas: number;
  }[];
};

export type ResultadoConciliacao =
  | { ok: true; mensagem?: string }
  | { ok: false; erro: string; detalhe?: string };

export type ResultadoImportacao =
  | {
      ok: true;
      lidas: number;
      inseridas: number;
      duplicadas: number;
    }
  | { ok: false; erro: string; detalhe?: string };
