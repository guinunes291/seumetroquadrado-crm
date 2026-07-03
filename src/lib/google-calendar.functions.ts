// Server functions do Google Calendar chamáveis pelo cliente autenticado.
// O módulo pesado (.server.ts) é importado dinamicamente dentro dos handlers.

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GoogleCalendarStatus = {
  /** Credenciais GOOGLE_CLIENT_ID/SECRET presentes no ambiente. */
  configured: boolean;
  /** Usuário atual tem conexão ativa. */
  connected: boolean;
  email: string | null;
  syncEnabled: boolean;
  /** URL de consentimento para iniciar o OAuth (só quando configured). */
  authUrl: string | null;
};

function requestOrigin(): string {
  const req = getRequest();
  const url = req ? new URL(req.url) : null;
  return process.env.APP_ORIGIN || (url ? url.origin : "");
}

export const getGoogleCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GoogleCalendarStatus> => {
    const gcal = await import("@/lib/google-calendar.server");
    const configured = gcal.isGoogleCalendarConfigured();

    // Leitura via cliente do usuário (RLS: só a própria conexão).
    const { data } = await context.supabase
      .from("google_calendar_connections" as never)
      .select("google_email, sync_enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    const conn = data as unknown as { google_email: string | null; sync_enabled: boolean } | null;

    return {
      configured,
      connected: !!conn,
      email: conn?.google_email ?? null,
      syncEnabled: conn?.sync_enabled ?? false,
      authUrl: configured ? gcal.buildConsentUrl(context.userId, requestOrigin()) : null,
    };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean }> => {
    const { error } = await context.supabase
      .from("google_calendar_connections" as never)
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SyncInput = z.object({ agendamentoId: z.string().uuid() });

/**
 * Espelha um agendamento no Google Calendar do corretor responsável.
 * Autorização: o chamador precisa enxergar o agendamento via RLS.
 */
export const syncAgendamentoGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SyncInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: visivel, error } = await context.supabase
      .from("agendamentos")
      .select("id")
      .eq("id", data.agendamentoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!visivel) throw new Error("Agendamento não encontrado");

    const gcal = await import("@/lib/google-calendar.server");
    return gcal.syncAgendamento(data.agendamentoId);
  });
