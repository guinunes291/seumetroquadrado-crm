// Fronteira tipada da tabela samiq_anexos (v8), no molde de samiq-rpc-args.ts:
// a tabela é nova e só entra em src/integrations/supabase/types.ts quando a
// plataforma regenerar os types. Até lá o cliente é visto por um holder
// estrutural, sem escape de tipo e sem editar o arquivo gerado.

export type AnexoSamiQRow = {
  id: string;
  user_id: string;
  mime_type: string;
  tamanho_bytes: number;
  nome_original: string | null;
  legenda: string | null;
  storage_path: string;
  mensagem_id: string | null;
  criado_em: string;
  usado_em: string | null;
  lead_id: string | null;
  documentacao_id: string | null;
};

export type NovoAnexoSamiQ = Pick<
  AnexoSamiQRow,
  | "user_id"
  | "mime_type"
  | "tamanho_bytes"
  | "nome_original"
  | "legenda"
  | "storage_path"
  | "mensagem_id"
>;

type ResultadoBanco<T> = PromiseLike<{
  data: T | null;
  error: { code?: string; message?: string } | null;
}>;

type Filtro<T> = {
  eq(coluna: string, valor: string): Filtro<T>;
  is(coluna: string, valor: null): Filtro<T>;
  order(coluna: string, opcoes: { ascending: boolean }): Filtro<T>;
  limit(n: number): ResultadoBanco<T[]>;
  maybeSingle(): ResultadoBanco<T>;
};

export type TabelaAnexosSamiQ = {
  select(colunas: string): Filtro<AnexoSamiQRow>;
  insert(linha: NovoAnexoSamiQ): {
    select(colunas: string): { single(): ResultadoBanco<{ id: string }> };
  };
  update(patch: Partial<AnexoSamiQRow>): {
    eq(coluna: string, valor: string): ResultadoBanco<null>;
  };
  delete(): { eq(coluna: string, valor: string): ResultadoBanco<null> };
};

export const COLUNAS_ANEXO_SAMIQ =
  "id, user_id, mime_type, tamanho_bytes, nome_original, legenda, storage_path, mensagem_id, criado_em, usado_em, lead_id, documentacao_id";

/** samiq_anexos pelo cliente que for passado (sessão do corretor = RLS; admin = servidor). */
export function tabelaAnexosSamiQ(client: { from: unknown }): TabelaAnexosSamiQ {
  const from = client.from as (tabela: string) => TabelaAnexosSamiQ;
  return from.call(client, "samiq_anexos");
}
