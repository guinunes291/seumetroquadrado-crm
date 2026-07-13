// Tipos compartilhados do dossiê do lead (rota leads.$leadId + abas em dossie/).
// A forma espelha o SELECT * da tabela `leads` usado pela rota.

export type DossieLead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string;
  origem: string;
  status: string;
  temperatura: string | null;
  corretor_id: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  construtora: string | null;
  observacoes: string | null;
  cpf: string | null;
  renda_informada: string | null;
  entrada_disponivel: string | null;
  usa_fgts: boolean;
  campanha: string | null;
  created_at: string;
  ultima_interacao: string | null;
  proximo_followup: string | null;
  desfecho: string | null;
  fase: string | null;
  visita_data: string | null;
  visita_hora: string | null;
  visita_empreendimento: string | null;
  docs_recebidos: string[] | null;
  docs_pendentes: string[] | null;
  tipo_renda: string | null;
  decisor: string | null;
  faixa_mcmv: string | null;
  // Opcional: a coluna `objecoes` chega depois da migration 20260629120000.
  objecoes?: string[] | null;
};
