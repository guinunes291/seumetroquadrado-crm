// Sincroniza o token do secret N8N_METRICS_TOKEN (Lovable) para a linha
// public.metric_webhook_settings.token — usada pelo trigger de emissão de
// eventos de métricas (status/atribuição de lead) no banco.
//
// Fire-and-forget: chamada por gestor/admin na tela de Distribuição. Não
// devolve o token para o cliente; apenas confirma se está configurado.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncMetricWebhookTokenFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    } as never);
    const { data: isGestor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    } as never);
    if (!isAdmin && !isGestor) {
      return { ok: false, reason: "forbidden" as const };
    }

    const token = process.env.N8N_METRICS_TOKEN?.trim();
    if (!token) {
      return { ok: false, reason: "missing_secret" as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc(
      "set_metric_webhook_token" as never,
      { _token: token } as never,
    );
    if (error) return { ok: false, reason: "rpc_error" as const, message: error.message };

    return { ok: true, configured: true } as const;
  });
