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
  /** Recebe todos os agendamentos da equipe (somente gestor/admin). */
  espelhoGlobal: boolean;
  /** Usuário pode ligar o espelho global. */
  podeEspelhoGlobal: boolean;
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

    // Leitura via cliente do usuário (RLS: só a própria conexão/papéis).
    const [{ data }, rolesR] = await Promise.all([
      context.supabase
        .from("google_calendar_connections" as never)
        .select("google_email, sync_enabled, espelho_global")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    const conn = data as unknown as {
      google_email: string | null;
      sync_enabled: boolean;
      espelho_global: boolean;
    } | null;
    const roles = (rolesR.data ?? []).map((r) => r.role as string);
    const podeEspelhoGlobal = roles.includes("admin") || roles.includes("gestor");

    return {
      configured,
      connected: !!conn,
      email: conn?.google_email ?? null,
      syncEnabled: conn?.sync_enabled ?? false,
      espelhoGlobal: conn?.espelho_global ?? false,
      podeEspelhoGlobal,
      authUrl: configured ? gcal.buildConsentUrl(context.userId, requestOrigin()) : null,
    };
  });

const EspelhoInput = z.object({ ativo: z.boolean() });

/**
 * Liga/desliga o espelho global (todos os agendamentos da equipe na agenda do
 * usuário). Restrito a gestor/admin; ao ligar, re-espelha os próximos eventos.
 */
export const setEspelhoGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => EspelhoInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; processados: number }> => {
    const { data: rolesData } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (rolesData ?? []).map((r) => r.role as string);
    if (!roles.includes("admin") && !roles.includes("gestor")) {
      throw new Error("Apenas gestores e administradores podem espelhar toda a equipe");
    }

    const { error } = await context.supabase
      .from("google_calendar_connections" as never)
      .update({ espelho_global: data.ativo } as never)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    let processados = 0;
    if (data.ativo) {
      const gcal = await import("@/lib/google-calendar.server");
      processados = (await gcal.syncAgendamentosFuturos()).processados;
    }
    return { ok: true, processados };
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
  .validator((d: unknown) => SyncInput.parse(d))
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
