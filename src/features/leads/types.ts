// Tipo do lead como retornado pela RPC `leads_filtered` — extraído de
// leads.index.tsx sem mudança de comportamento, para ser compartilhado entre a
// página e os componentes/hooks da listagem.
export type Lead = {
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
  observacoes: string | null;
  created_at: string;
  ultima_interacao: string | null;
  na_lixeira: boolean;
  renda_informada: string | null;
  entrada_disponivel: string | null;
  usa_fgts: boolean | null;
  data_venda: string | null;
  total_count?: number | null;
};
