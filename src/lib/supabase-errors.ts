// Degradação controlada para objetos de banco ausentes (P0-1 da auditoria):
// migrations desta branch podem ainda não estar aplicadas no ambiente vivo.
// Toda RPC/tabela NOVA deve ser consumida via rpcWithFallback — a tela usa o
// caminho antigo (ou esconde o recurso) em vez de quebrar.

type SupabaseishError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
};

/** Códigos que significam "o objeto não existe neste banco (ainda)". */
const MISSING_OBJECT_CODES = new Set([
  "PGRST202", // RPC não encontrada (PostgREST)
  "PGRST205", // tabela/relação não encontrada no schema cache (PostgREST)
  "42P01", // undefined_table (Postgres)
  "42883", // undefined_function (Postgres)
]);

/**
 * `true` quando o erro indica RPC/tabela ausente — e não uma falha real.
 * Aceita o formato de erro do supabase-js (PostgrestError) e mensagens cruas.
 */
export function isMissingBackendObject(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as SupabaseishError;
  if (e.code && MISSING_OBJECT_CODES.has(e.code)) return true;
  const msg = `${e.message ?? ""} ${e.details ?? ""}`.toLowerCase();
  return (
    msg.includes("could not find the function") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

/**
 * `true` quando o erro indica COLUNA ausente (migration aditiva ainda não
 * aplicada) — a leitura deve refazer o select sem a coluna nova.
 */
export function isMissingColumn(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as SupabaseishError;
  if (e.code === "42703") return true; // undefined_column (Postgres)
  const msg = `${e.message ?? ""} ${e.details ?? ""}`.toLowerCase();
  return /column .* does not exist/.test(msg) || msg.includes("could not find the '");
}

/**
 * Executa a chamada nova; se o backend ainda não tem o objeto, usa o fallback.
 * Qualquer OUTRO erro é propagado — só a ausência do objeto degrada.
 */
export async function rpcWithFallback<T>(
  call: () => Promise<T>,
  fallback: () => Promise<T> | T,
): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (isMissingBackendObject(err)) return await fallback();
    throw err;
  }
}

/**
 * Variante para SELECT com colunas novas: se a coluna ainda não existe no
 * banco, refaz pelo caminho antigo. Outros erros sobem.
 */
export async function selectWithColumnFallback<T>(
  call: () => Promise<T>,
  fallback: () => Promise<T> | T,
): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (isMissingColumn(err) || isMissingBackendObject(err)) return await fallback();
    throw err;
  }
}
