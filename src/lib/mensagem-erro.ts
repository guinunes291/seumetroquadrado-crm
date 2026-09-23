/**
 * Extrai uma mensagem legível de qualquer erro. Erros do Supabase/PostgREST são
 * objetos simples (`{ message, details, hint, code }`), não instâncias de Error
 * — `String(obj)` daria "[object Object]" e esconderia a causa real.
 */
export function mensagemDeErro(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const e = error as {
      message?: unknown;
      error_description?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const base =
      (typeof e.message === "string" && e.message) ||
      (typeof e.error_description === "string" && e.error_description) ||
      (typeof e.details === "string" && e.details) ||
      null;
    if (base) return typeof e.code === "string" && e.code ? `${base} (${e.code})` : base;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}
