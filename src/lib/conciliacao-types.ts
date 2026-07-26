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

export const MOTIVOS_IGNORAR = [
  "Tarifa bancária",
  "Despesa não relacionada a comissão",
  "Transferência entre contas",
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

export type SugestaoVenda = {
  venda_id: string;
  projeto_nome: string | null;
  cliente_nome: string | null;
  valor_venda: number | null;
  data_assinatura: string | null;
  status_recebimento: string | null;
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
