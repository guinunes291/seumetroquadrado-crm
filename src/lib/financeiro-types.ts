// Tipos compartilhados da tela Financeiro · Fechamento.
// Ficam fora de *.server.ts porque a UI (client bundle) precisa importá-los.

export type ResultadoAcao =
  | { ok: true; mensagem?: string }
  | { ok: false; erro: string; detalhe?: string };

export type FilaItem = {
  id: string;
  status: string;
  tipo: string;
  valor_liquido: number;
  valor_comissao: number;
  data_pagamento: string | null;
  observacoes: string | null;
  beneficiario_id: string | null;
  beneficiario_nome: string | null;
  beneficiario_ativo: boolean | null;
  venda_id: string | null;
  projeto_nome: string | null;
  data_assinatura: string | null;
  valor_venda: number | null;
  status_recebimento: string | null;
  data_recebimento: string | null;
  cliente_nome: string | null;
  travado: boolean;
  motivo_travamento: string | null;
};

export type VendaItem = {
  id: string;
  projeto_nome: string | null;
  cliente_nome: string | null;
  corretor_id: string | null;
  corretor_nome: string | null;
  valor_venda: number | null;
  data_assinatura: string | null;
  status_recebimento: string | null;
  data_recebimento: string | null;
  status_venda: string | null;
  comissoes_abertas: number;
  valor_comissoes_abertas: number;
};

export type PessoaItem = { id: string; nome: string; ativo: boolean };

export type PainelFinanceiro = {
  cabecalho: {
    em_aberto: { valor: number; qtd: number };
    travado: { valor: number; qtd: number };
    apto: { valor: number; qtd: number };
    pago_mes: { valor: number; qtd: number };
    referencia_mes: string;
  };
  fila: FilaItem[];
  recebiveis: VendaItem[];
  vendas_sem_corretor: VendaItem[];
  integridade: {
    chave: string;
    titulo: string;
    descricao: string;
    qtd: number;
    ids: string[];
  }[];
  pessoas: PessoaItem[];
};


export type LinhaAuditoria = {
  id: string;
  criado_em: string | null;
  entidade: string;
  entidade_id: string;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  motivo: string | null;
  origem: string;
  autor: string;
};
