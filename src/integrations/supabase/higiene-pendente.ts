// Fronteira tipada dos objetos criados pelas migrations de Higiene do Funil
// (20260911230000_app_flags, 20260911230100_higiene_funil_views), que ainda
// NÃO estão em types.ts (gerado a partir do banco real).
//
// Mesmo padrão de integrations/supabase/pendentes.ts, em arquivo separado de
// propósito: os dois têm ciclos de vida independentes e some cada um quando a
// SUA rodada de migrations for refletida nos types.
//
// Ao regenerar os types do Supabase depois de aplicar estas migrations:
//   1. apagar este arquivo;
//   2. trocar `supabaseHigiene` por `supabase` em src/hooks/use-higiene-funil.ts;
//   3. baixar o teto do type-escape budget.
//
// NOTA sobre bigint: count(*) volta como `bigint`, que o PostgREST serializa
// em JSON como number. Tipado como number aqui — os valores desta tela
// (dezenas de milhares) estão muito abaixo de Number.MAX_SAFE_INTEGER.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { Database } from "./types";
import type { LeadStatus } from "@/lib/leads";

type Pub = Database["public"];
type Tabelas = Pub["Tables"];
type Temperatura = Database["public"]["Enums"]["lead_temperatura"];

/** Cabeçalho: uma linha só. */
export type HigieneResumoRow = {
  vivos: number;
  sem_corretor: number;
  em_carteira: number;
  parados: number;
  /** Parado e nunca tocado: problema da DISTRIBUIÇÃO, não do corretor. */
  parados_nunca_tocados: number;
  /** Parado depois de ter sido tocado: aí sim é abandono. */
  parados_abandonados: number;
  /** Parados cujo relógio veio de escrita em lote (importação/migração). */
  parados_em_lote: number;
  parados_em_carteira: number;
  parados_em_atendimento: number;
  prazo_dias: number;
  /** A base se move durante o dia: número sem hora é promessa falsa. */
  medido_em: string;
};

export type HigieneFilaRow = {
  lead_id: string;
  nome: string;
  telefone: string;
  status: LeadStatus;
  temperatura: Temperatura | null;
  dias_parado: number;
  parado_desde: string | null;
  nunca_tocado: boolean;
  escrita_em_lote: boolean;
  proximo_followup: string | null;
  corretor_id: string | null;
  corretor_nome: string | null;
  projeto_nome: string | null;
  peso: number;
  acao_sugerida: string;
  prioridade: number;
};

export type HigienePastaRow = {
  lead_id: string;
  lead_nome: string;
  telefone: string;
  lead_status: LeadStatus;
  corretor_id: string | null;
  corretor_nome: string | null;
  docs_pendentes: number;
  tipos_distintos: number;
  o_que_falta: string | null;
  ultimo_movimento: string | null;
  dias_sem_movimento: number;
  sem_corretor: boolean;
  pasta_duplicada: boolean;
  fechado_com_pendencia: boolean;
};

export type AppFlagRow = {
  chave: string;
  ativo: boolean;
  descricao: string | null;
  atualizado_em: string;
  atualizado_por: string | null;
};

type SomenteLeitura<R> = { Row: R; Insert: never; Update: never; Relationships: [] };

export type DatabaseHigiene = Omit<Database, "public"> & {
  public: Omit<Pub, "Tables"> & {
    Tables: Tabelas & {
      v_higiene_resumo: SomenteLeitura<HigieneResumoRow>;
      v_higiene_fila: SomenteLeitura<HigieneFilaRow>;
      v_higiene_pastas_travadas: SomenteLeitura<HigienePastaRow>;
      app_flags: {
        Row: AppFlagRow;
        Insert: never;
        Update: Partial<Pick<AppFlagRow, "ativo" | "atualizado_em" | "atualizado_por">>;
        Relationships: [];
      };
    };
  };
};

/** O MESMO cliente (mesma sessão, mesmo storage), só com o schema estendido. */
export const supabaseHigiene = supabase as unknown as SupabaseClient<DatabaseHigiene>;
