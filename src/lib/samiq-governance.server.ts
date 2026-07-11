import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SamiQAction } from "@/lib/samiq";

const reservationRowSchema = z.object({
  allowed: z.boolean(),
  denial_reason: z.string().nullable(),
  retry_after_seconds: z.coerce.number().int().nonnegative(),
  execution_id: z.string().uuid().nullable(),
  prompt_version: z.string().nullable(),
  model_id: z.string().nullable(),
  system_prompt: z.string().nullable(),
  action_prompt: z.string().nullable(),
  max_output_tokens: z.coerce.number().int().positive().nullable(),
});

export type SamiQReservation = {
  executionId: string;
  promptVersion: string;
  modelId: string;
  systemPrompt: string;
  actionPrompt: string;
  maxOutputTokens: number;
};

export class SamiQQuotaError extends Error {
  constructor(
    readonly reason: string,
    readonly retryAfterSeconds: number,
  ) {
    super(
      reason.includes("rate")
        ? `O SamiQ precisa de uma pausa. Tente novamente em ${retryAfterSeconds}s.`
        : "O budget do SamiQ para este período foi atingido. Tente novamente após a renovação da cota.",
    );
    this.name = "SamiQQuotaError";
  }
}

export async function reserveSamiQExecution(args: {
  userId: string;
  action: SamiQAction;
  estimatedInputTokens?: number;
}): Promise<SamiQReservation> {
  const { data, error } = await supabaseAdmin.rpc("samiq_reservar_execucao", {
    _user_id: args.userId,
    _action: args.action,
    _estimated_input_tokens: args.estimatedInputTokens ?? 10_000,
  });
  if (error) throw new Error("Não foi possível validar a cota do SamiQ.");

  const parsed = reservationRowSchema.safeParse(data?.[0]);
  if (!parsed.success) throw new Error("Resposta inválida da governança do SamiQ.");
  const row = parsed.data;
  if (!row.allowed) {
    throw new SamiQQuotaError(row.denial_reason ?? "quota_exceeded", row.retry_after_seconds);
  }
  if (
    !row.execution_id ||
    !row.prompt_version ||
    !row.model_id ||
    !row.system_prompt ||
    !row.action_prompt ||
    !row.max_output_tokens
  ) {
    throw new Error("Configuração ativa do SamiQ está incompleta.");
  }

  return {
    executionId: row.execution_id,
    promptVersion: row.prompt_version,
    modelId: row.model_id,
    systemPrompt: row.system_prompt,
    actionPrompt: row.action_prompt,
    maxOutputTokens: row.max_output_tokens,
  };
}

export async function finishSamiQExecution(args: {
  userId: string;
  executionId: string;
  status: "completed" | "failed";
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  errorCode?: string;
}): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("samiq_finalizar_execucao", {
    _user_id: args.userId,
    _execution_id: args.executionId,
    _status: args.status,
    _input_tokens: Math.max(0, Math.round(args.inputTokens ?? 0)),
    _output_tokens: Math.max(0, Math.round(args.outputTokens ?? 0)),
    _latency_ms: Math.max(0, Math.round(args.latencyMs)),
    _error_code: args.errorCode ?? null,
  });
  return !error && data === true;
}
