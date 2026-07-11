import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type DocumentRequestAuth = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export class DocumentRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/**
 * Autentica o JWT no GoTrue e cria um cliente RLS preso à sessão do usuário.
 * A service role só é usada pelo handler depois desta validação e de uma
 * leitura autorizada da documentação.
 */
export async function authenticateDocumentRequest(request: Request): Promise<DocumentRequestAuth> {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new DocumentRequestError(
      "Configuração de autenticação indisponível",
      503,
      "auth_unavailable",
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    throw new DocumentRequestError("Sessão ausente", 401, "unauthorized");
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new DocumentRequestError("Sessão ausente", 401, "unauthorized");

  const supabase = createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userResult.user) {
    throw new DocumentRequestError("Sessão inválida", 401, "unauthorized");
  }

  const { data: active, error: activeError } = await supabase.rpc("conta_atual_ativa");
  if (activeError || !active) {
    throw new DocumentRequestError("Conta pendente ou bloqueada", 403, "account_inactive");
  }

  return { supabase, userId: userResult.user.id };
}

export async function requireAccessibleDocument(auth: DocumentRequestAuth, documentacaoId: string) {
  const { data, error } = await auth.supabase
    .from("documentacoes")
    .select("id, lead_id, url")
    .eq("id", documentacaoId)
    .maybeSingle();
  if (error) {
    throw new DocumentRequestError(
      "Não foi possível validar a documentação",
      500,
      "document_lookup_failed",
    );
  }
  // RLS torna "não existe" e "fora da carteira" indistinguíveis.
  if (!data) throw new DocumentRequestError("Documento não encontrado", 404, "not_found");
  return data;
}
