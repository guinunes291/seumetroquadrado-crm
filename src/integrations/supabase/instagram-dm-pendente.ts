// Fronteira tipada das tabelas instagram_dm_* (migration 20261104120000), que
// ainda não estão em types.ts (gerado a partir do banco real).
//
// Sem nenhum cast: este arquivo cria o próprio cliente service role tipado
// com o schema estendido, em vez de converter o supabaseAdmin. Assim o
// type-escape budget não sobe.
//
// Ao regenerar os types do Supabase com as tabelas no banco:
//   1. apagar este arquivo;
//   2. trocar `adminInstagram()` por `supabaseAdmin` em
//      src/lib/instagram-dm.server.ts e src/lib/instagram-dm.functions.ts.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./types";

type Tabela<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

export type ConfigRow = {
  id: number;
  zernio_account_id: string | null;
  zernio_username: string | null;
  zernio_webhook_id: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  app_origin: string | null;
  textos: Json;
  conectado_em: string | null;
  conectado_por: string | null;
  atualizado_em: string;
};

export type PalavraRow = {
  id: string;
  palavra: string;
  palavra_chave: string;
  ativo: boolean;
  mensagem_abertura: string;
  resposta_publica: string | null;
  post_id: string | null;
  roleta_id: string | null;
  assunto: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type ConversaRow = {
  id: string;
  palavra_id: string | null;
  palavra: string;
  origem: "comentario" | "dm";
  sender_id: string | null;
  nome: string | null;
  username: string | null;
  conversation_id: string | null;
  comment_id: string | null;
  post_id: string | null;
  etapa: string;
  renda_texto: string | null;
  renda_valor: number | null;
  regiao: string | null;
  prazo: string | null;
  whatsapp: string | null;
  tentativas_whatsapp: number;
  resposta_enviada: boolean;
  resposta_enviada_em: string | null;
  lead_id: string | null;
  lead_status: string | null;
  erro: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type EventoRow = {
  id: string;
  mensagem_id: string;
  tipo: "mensagem" | "comentario";
  conversa_id: string | null;
  status: "processando" | "respondido" | "erro";
  erro: string | null;
  tentativas: number;
  recebido_em: string;
  atualizado_em: string;
};

type Opcionais<R, K extends keyof R> = Omit<R, K> & Partial<Pick<R, K>>;

type Pub = Database["public"];

export type DatabaseInstagram = Omit<Database, "public"> & {
  public: Omit<Pub, "Tables"> & {
    Tables: Pub["Tables"] & {
      instagram_dm_config: Tabela<ConfigRow, Partial<ConfigRow>>;
      instagram_dm_palavras: Tabela<
        PalavraRow,
        Opcionais<
          PalavraRow,
          | "id"
          | "ativo"
          | "resposta_publica"
          | "post_id"
          | "roleta_id"
          | "assunto"
          | "criado_em"
          | "atualizado_em"
        >
      >;
      instagram_dm_conversas: Tabela<
        ConversaRow,
        Partial<ConversaRow> & Pick<ConversaRow, "palavra" | "origem">
      >;
      instagram_dm_eventos: Tabela<
        EventoRow,
        Partial<EventoRow> & Pick<EventoRow, "mensagem_id" | "tipo">
      >;
    };
  };
};

let cliente: SupabaseClient<DatabaseInstagram> | null = null;

/** Cliente service role (ignora RLS) com as tabelas instagram_dm_* tipadas. Só servidor. */
export function adminInstagram(): SupabaseClient<DatabaseInstagram> {
  if (cliente) return cliente;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no servidor.");
  }
  cliente = createClient<DatabaseInstagram>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}
