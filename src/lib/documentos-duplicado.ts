// Idempotência de POST /api/public/documentos por `messageId` — as DUAS vias.
//
// O contrato H-016 §4 diz que reenviar um documento já gravado devolve
// `{ ok: true, duplicado: true, documento_id }`. A rota tinha só a via feliz:
// uma pré-checagem por leitura. Leitura não serializa nada — dois POSTs
// concorrentes passam os dois por ela, e o segundo morre na constraint
// `documentacoes_message_id_uniq`.
//
//   F-083 — nesse caso o CRM devolvia HTTP 500 com o texto cru do Postgres
//           (`duplicate key value violates unique constraint ...`). O drenador
//           do n8n classifica 500 como transitório e reescreve
//           `drenagem_estado='erro'` numa linha já `resolvido=true` com
//           `documento_id` preenchido. O dado estava certo (a constraint segurou
//           a segunda escrita); quem passou a mentir foi o ESTADO, na única
//           tabela que diz se um documento chegou ao CRM.
//
// A correção não é evitar a corrida — é traduzir a constraint para o contrato.
// Este módulo existe separado da rota pelo mesmo motivo que
// `lead-busca-telefone.ts`: é aqui que o critério mora, e é aqui que o teste
// pega quem o alterar (tests/documentos-duplicado.test.ts).

/** Colunas que o contrato H-016 §4 exige na resposta de duplicata. */
export const SELECT_DUP = "id, lead_id, tipo, arquivo_path, arquivo_nome";

export type DocDup = {
  id: string;
  lead_id: string | null;
  tipo: string | null;
  arquivo_path: string | null;
  arquivo_nome: string | null;
};

/**
 * A gravação bateu na unicidade de `message_id`?
 *
 * `23505` sozinho não basta: `documentacoes` pode ganhar outras constraints
 * únicas, e traduzir qualquer uma delas para "já está gravado" mentiria na
 * direção oposta. Exige o nome da coluna no texto do erro.
 */
export function ehColisaoMessageId(erro: unknown): boolean {
  const e = (erro ?? {}) as { code?: string; message?: string; details?: string };
  if (e.code !== "23505") return false;
  return `${e.message ?? ""} ${e.details ?? ""}`.includes("message_id");
}

/**
 * Corpo do contrato H-016 §4 para "este documento já está gravado".
 *
 * Uma função só, usada pela pré-checagem E pelo tratamento de corrida: era a
 * divergência entre os dois caminhos que produzia a F-083, então eles passam a
 * ser literalmente o mesmo código.
 */
export async function respostaDuplicado(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  dup: DocDup,
  assinar: (supabase: unknown, path: string) => Promise<string | null>,
): Promise<Record<string, unknown>> {
  const url = dup.arquivo_path ? await assinar(supabase, dup.arquivo_path) : null;
  return {
    ok: true,
    duplicado: true,
    ambiguo: false,
    documento_id: dup.id,
    lead_id: dup.lead_id,
    tipo: dup.tipo,
    nome_arquivo: dup.arquivo_nome,
    url,
    arquivo_path: dup.arquivo_path,
  };
}

/** Lê a linha vencedora da corrida pelo `message_id`. */
export async function buscarPorMessageId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  messageId: string,
): Promise<DocDup | null> {
  const { data } = await db
    .from("documentacoes")
    .select(SELECT_DUP)
    .eq("message_id", messageId)
    .maybeSingle();
  return (data as DocDup | null) ?? null;
}
