// Fronteira tipada dos objetos criados pela migration do Meu Funil
// (20260927120000_meu_funil_estudo_diario), que ainda NÃO estão em types.ts
// (gerado a partir do banco real).
//
// Mesmo padrão de integrations/supabase/higiene-pendente.ts. Ao regenerar os
// types do Supabase depois de aplicar a migration:
//   1. apagar este arquivo;
//   2. trocar `supabaseMeuFunil` por `supabase` em src/features/meu-funil/use-meu-funil.ts;
//   3. baixar o teto do type-escape budget.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { Database, Json } from "./types";

type Pub = Database["public"];

export type FunilEstudoDiarioRow = {
  id: string;
  corretor_id: string;
  dia: string;
  foco: string;
  compromisso: string | null;
  segundos_na_tela: number;
  concluido_em: string;
  created_at: string;
  updated_at: string;
};

type FunilEstudoDiarioInsert = Pick<FunilEstudoDiarioRow, "corretor_id" | "dia" | "foco"> &
  Partial<Pick<FunilEstudoDiarioRow, "compromisso" | "segundos_na_tela" | "concluido_em">>;

export type DatabaseMeuFunil = Omit<Database, "public"> & {
  public: Omit<Pub, "Tables" | "Functions"> & {
    Tables: Pub["Tables"] & {
      funil_estudo_diario: {
        Row: FunilEstudoDiarioRow;
        Insert: FunilEstudoDiarioInsert;
        Update: Partial<FunilEstudoDiarioInsert>;
        Relationships: [];
      };
    };
    Functions: Pub["Functions"] & {
      meu_funil_estudo: { Args: { _dias?: number }; Returns: Json };
    };
  };
};

/** O MESMO cliente (mesma sessão, mesmo storage), só com o schema estendido. */
export const supabaseMeuFunil = supabase as unknown as SupabaseClient<DatabaseMeuFunil>;
