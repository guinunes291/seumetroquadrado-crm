// Fronteira tipada dos objetos criados pela migration
// 20260927120000_aprovacao_credito_dados.sql, que ainda NÃO estão em types.ts
// (gerado a partir do banco real — a plataforma bloqueia edição manual).
//
// Mesmo padrão de pendentes.ts / higiene-pendente.ts, em arquivo próprio: some
// quando ESTA rodada de migrations for refletida nos types.
//
// Ao regenerar os types do Supabase depois de aplicar a migration:
//   1. apagar este arquivo;
//   2. trocar `supabaseAprovacao` por `supabase` nos consumidores;
//   3. baixar o teto do type-escape budget.
//
// Objetos cobertos:
//   • analises_credito: colunas da aprovação (valores, banco, validade,
//     comprovante_doc_id, dados_extraidos, poder_compra gerada)
//   • view aprovacoes_credito_vigentes

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { Database, Json } from "./types";

type Pub = Database["public"];
type Tabelas = Pub["Tables"];

/** Campos da aprovação que o corretor (ou a IA) preenche. */
export type ColunasAprovacao = {
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
  valor_imovel_max: number | null;
  renda_familiar: number | null;
  faixa_mcmv: string | null;
  qtd_participantes: number | null;
  cotista_fgts: boolean | null;
  possui_dependente: boolean | null;
  data_aprovacao: string | null;
  validade_ate: string | null;
  comprovante_doc_id: string | null;
  dados_origem: string | null;
  dados_extraidos: Json | null;
};

/** Coluna GERADA no banco: só leitura (não entra em Insert/Update). */
type ColunasSoLeitura = { poder_compra: number | null };

type AnalisesEstendida = Omit<Tabelas["analises_credito"], "Row" | "Insert" | "Update"> & {
  Row: Tabelas["analises_credito"]["Row"] & ColunasAprovacao & ColunasSoLeitura;
  Insert: Tabelas["analises_credito"]["Insert"] & Partial<ColunasAprovacao>;
  Update: Tabelas["analises_credito"]["Update"] & Partial<ColunasAprovacao>;
};

export type AprovacaoVigenteRow = Omit<ColunasAprovacao, "dados_origem" | "dados_extraidos"> &
  ColunasSoLeitura & {
    analise_id: string;
    lead_id: string;
    lead_nome: string;
    lead_telefone: string | null;
    lead_status: string;
    corretor_id: string | null;
    projeto_nome: string | null;
    status_analise: string;
    vencida: boolean;
    updated_at: string;
  };

export type DatabaseAprovacao = Omit<Database, "public"> & {
  public: Omit<Pub, "Tables" | "Views"> & {
    Tables: Omit<Tabelas, "analises_credito"> & { analises_credito: AnalisesEstendida };
    Views: Pub["Views"] & {
      aprovacoes_credito_vigentes: { Row: AprovacaoVigenteRow; Relationships: [] };
    };
  };
};

/** O MESMO cliente (mesma sessão, mesmo storage), só com o schema estendido. */
export const supabaseAprovacao = supabase as unknown as SupabaseClient<DatabaseAprovacao>;
