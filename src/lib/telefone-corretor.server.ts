// Conferência privilegiada e SÓ de leitura: o telefone informado pertence a
// algum corretor (ativo ou não)? Mesma regra de validarTelefoneCliente, sem
// expor nomes nem a lista de telefones a quem chama.

import { telefonePertenceACorretor } from "@/lib/telefone-corretor";

export async function telefoneEhDeCorretor(telefone: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "corretor");
  const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("telefone")
      .in("id", ids.slice(i, i + 200));
    if (telefonePertenceACorretor(telefone, profiles ?? [])) return true;
  }
  return false;
}
