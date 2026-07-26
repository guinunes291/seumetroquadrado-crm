// Guarda server-only compartilhada pelas server functions da conciliação.
import { podeOperarFinanceiro, contextoTela } from "@/lib/financeiro.server";
import type { ApiClientContext } from "@/lib/api-client-auth.server";

/** Devolve o contexto de auditoria da tela, ou null quando não pode operar. */
export async function contextoFinanceiroOuNulo(
  supabase: any,
  userId: string,
): Promise<ApiClientContext | null> {
  if (!(await podeOperarFinanceiro(supabase, userId))) return null;
  const { data: perfil } = await supabase
    .from("profiles")
    .select("nome")
    .eq("id", userId)
    .maybeSingle();
  return contextoTela(userId, (perfil as any)?.nome ?? "Usuário");
}
