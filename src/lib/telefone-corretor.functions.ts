import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { telefonePertenceACorretor } from "@/lib/telefone-corretor";

// Global validation is privileged: never disclose broker names or phone lists.
export const validarTelefoneCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ telefone: z.string().max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ativo, error: authError } = await context.supabase.rpc("is_active_member", {
      _user_id: context.userId,
    });
    if (authError || !ativo) throw new Error("Acesso não autorizado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "corretor");
    if (rolesError) throw new Error("Não foi possível conferir o telefone. Tente novamente.");
    const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
    // Chunk to avoid large URLs and PostgREST's row ceiling; include inactive brokers.
    for (let i = 0; i < ids.length; i += 200) {
      const { data: profiles, error } = await supabaseAdmin
        .from("profiles")
        .select("telefone")
        .in("id", ids.slice(i, i + 200));
      if (error) throw new Error("Não foi possível conferir o telefone. Tente novamente.");
      if (telefonePertenceACorretor(data.telefone, profiles ?? [])) {
        throw new Error("Este telefone pertence a um corretor cadastrado e não pode ser usado em um cliente.");
      }
    }
    return { ok: true };
  });