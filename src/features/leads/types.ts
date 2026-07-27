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
  /** Só na RPC v2+: lead tem follow-up pendente/em andamento (flag de linha). */
  tem_followup?: boolean;
  /** Só na RPC v3: data do próximo follow-up aberto (espelho de tarefas). */
  proximo_followup?: string | null;
  /** Só na RPC v3: score de prioridade 0-100 calculado no servidor
   *  (espelho de src/lib/priority.ts, incluindo o componente de SLA). */
  score?: number | null;
  total_count?: number | null;
};
