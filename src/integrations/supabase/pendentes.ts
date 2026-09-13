// Fronteira tipada para objetos de banco que as migrations desta rodada criam
// e que ainda NÃO estão em types.ts (gerado). Em vez de espalhar `as never`
// pelas telas (cada um conta no type-escape budget), o escape é UM só, aqui,
// com o tipo explícito de cada tabela/RPC nova.
//
// Ao regenerar os types do Supabase depois de aplicar as migrations:
//   1. apagar este arquivo;
//   2. trocar `supabasePendente` por `supabase` nos consumidores;
//   3. baixar o teto do type-escape budget.
//
// Objetos cobertos (migration 20260902120000_prateleira_projetos.sql,
// 20260805160000_construtoras_parceiras.sql e
// 20260913190000_portal_projeto_materiais.sql):
//   • projetos.preco_atualizado_em / tabela_atualizada_em
//   • projeto_foco.arte_url
//   • construtoras_parceiras (+ logo_url)
//   • projeto_eventos (+ tipo material_abrir)
//   • projeto_materiais
//   • rpc projetos_demanda_v1()

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { Database } from "./types";

type Pub = Database["public"];
type Tabelas = Pub["Tables"];

export type ProjetoEventoTipo =
  | "book_abrir"
  | "tabela_abrir"
  | "resumo_copiar"
  | "enviar_lead"
  | "sacola_add"
  | "ficha_abrir"
  | "reportar_erro"
  | "material_abrir";

export type ProjetoEventoRow = {
  id: string;
  projeto_id: string;
  lead_id: string | null;
  user_id: string | null;
  tipo: ProjetoEventoTipo;
  origem: string;
  detalhe: string | null;
  created_at: string;
};

export type ProjetoEventoInsert = {
  id?: string;
  projeto_id: string;
  lead_id?: string | null;
  user_id?: string | null;
  tipo: ProjetoEventoTipo;
  origem?: string;
  detalhe?: string | null;
  created_at?: string;
};

export type ConstrutoraParceiraRow = {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  observacao: string | null;
  logo_url: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type ConstrutoraParceiraInsert = {
  id?: string;
  nome: string;
  ordem?: number;
  ativo?: boolean;
  observacao?: string | null;
  logo_url?: string | null;
  criado_por?: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Tipos fechados pelo CHECK da tabela; rótulos em lib/projeto-materiais. */
export type ProjetoMaterialTipo =
  | "book"
  | "tabela"
  | "planta"
  | "video"
  | "tour"
  | "memorial"
  | "apresentacao"
  | "arte"
  | "outro";

export type ProjetoMaterialRow = {
  id: string;
  projeto_id: string;
  tipo: ProjetoMaterialTipo;
  titulo: string;
  url: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjetoMaterialInsert = {
  id?: string;
  projeto_id: string;
  tipo: ProjetoMaterialTipo;
  titulo: string;
  url: string;
  descricao?: string | null;
  ordem?: number;
  ativo?: boolean;
  criado_por?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DemandaRow = {
  projeto_id: string;
  leads_30d: number;
  leads_total: number;
  vendas_total: number;
  envios_7d: number;
  envios_30d: number;
  ultimo_envio: string | null;
};

type ColunasNovasProjetos = {
  preco_atualizado_em: string | null;
  tabela_atualizada_em: string | null;
};

type ColunasNovasFoco = { arte_url: string | null };

/** Acrescenta colunas a uma tabela gerada, preservando Relationships. */
type Estende<T extends { Row: object; Insert: object; Update: object }, C extends object> = Omit<
  T,
  "Row" | "Insert" | "Update"
> & {
  Row: T["Row"] & C;
  Insert: T["Insert"] & Partial<C>;
  Update: T["Update"] & Partial<C>;
};

export type DatabasePendente = Omit<Database, "public"> & {
  public: Omit<Pub, "Tables" | "Functions"> & {
    Tables: Omit<Tabelas, "projetos" | "projeto_foco"> & {
      projetos: Estende<Tabelas["projetos"], ColunasNovasProjetos>;
      projeto_foco: Estende<Tabelas["projeto_foco"], ColunasNovasFoco>;
      construtoras_parceiras: {
        Row: ConstrutoraParceiraRow;
        Insert: ConstrutoraParceiraInsert;
        Update: Partial<ConstrutoraParceiraInsert>;
        Relationships: [];
      };
      projeto_eventos: {
        Row: ProjetoEventoRow;
        Insert: ProjetoEventoInsert;
        Update: Partial<ProjetoEventoInsert>;
        Relationships: [];
      };
      projeto_materiais: {
        Row: ProjetoMaterialRow;
        Insert: ProjetoMaterialInsert;
        Update: Partial<ProjetoMaterialInsert>;
        Relationships: [];
      };
    };
    Functions: Pub["Functions"] & {
      projetos_demanda_v1: { Args: never; Returns: DemandaRow[] };
    };
  };
};

/** O MESMO cliente (mesma sessão, mesmo storage), só com o schema estendido. */
export const supabasePendente = supabase as unknown as SupabaseClient<DatabasePendente>;
