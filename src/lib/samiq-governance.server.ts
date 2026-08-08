import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isMissingBackendObject } from "@/lib/supabase-errors";
import { rateLimit } from "@/lib/rate-limit";
import type { SamiQAction } from "@/lib/samiq";

/**
 * Ações de IA fora do chat do SamiQ (item 0.6 da estrategia-2026-08), com
 * slugs PRÓPRIOS: o índice (action, created_at) de samiq_execucoes é como a
 * métrica C3 distingue o chat dos botões do dossiê/match. Não entram em
 * SAMIQ_ACTIONS de propósito — aquilo é catálogo de UI do painel.
 */
export type GovernedAIAction = SamiQAction | "match_projetos" | "resumo_lead" | "mensagem_whatsapp";

/**
 * Modelo do comportamento legado, usado só quando a governança ainda não
 * conhece a ação (migration não aplicada). Vive AQUI para os handlers não
 * carregarem modelo hardcoded — os testes de contrato proíbem.
 */
export const FALLBACK_MODEL_ID = "google/gemini-3-flash-preview";

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

/** Governança fora do ar OU sem a ação versionada — só este caso autoriza fallback. */
export class SamiQGovernanceUnavailableError extends Error {
  constructor(readonly original: unknown) {
    super("Não foi possível validar a cota do SamiQ.");
    this.name = "SamiQGovernanceUnavailableError";
  }
}

export async function reserveSamiQExecution(args: {
  userId: string;
  action: GovernedAIAction;
  estimatedInputTokens?: number;
  /** Baixa o teto de saída DESTA chamada (o LEAST na RPC impede subir). */
  requestedOutputTokens?: number;
}): Promise<SamiQReservation> {
  const { data, error } = await supabaseAdmin.rpc("samiq_reservar_execucao", {
    _user_id: args.userId,
    _action: args.action,
    _estimated_input_tokens: args.estimatedInputTokens ?? 10_000,
    ...(args.requestedOutputTokens ? { _requested_output_tokens: args.requestedOutputTokens } : {}),
  });
  if (error) {
    // RPC/versão ausente (PGRST202 etc.) ou "acao sem prompt versionado"
    // (22023): a migration ainda não chegou — sinaliza para o chamador poder
    // degradar. Qualquer outro erro continua opaco (não vaza detalhe interno).
    if (isMissingBackendObject(error) || error.code === "22023") {
      throw new SamiQGovernanceUnavailableError(error);
    }
    throw new Error("Não foi possível validar a cota do SamiQ.");
  }

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

export type GovernedReservation =
  | ({ governed: true } & SamiQReservation)
  | {
      governed: false;
      executionId: null;
      modelId: string;
      systemPrompt: null;
      actionPrompt: null;
      maxOutputTokens: number;
    };

/**
 * Reserva para as superfícies de IA unificadas (match/resumo/mensagem).
 * Caminho principal: a mesma RPC do SamiQ (quota distribuída, prompt/modelo
 * versionados, telemetria). Se a governança ainda não conhece a ação
 * (migration não aplicada em produção — desacoplamento deploy×banco, lição
 * do P0-1), degrada para o comportamento legado: rate limit em memória por
 * usuário + modelo constante. Quota NEGADA nunca degrada — política é política.
 */
export async function reserveGovernedAIExecution(args: {
  userId: string;
  action: GovernedAIAction;
  estimatedInputTokens?: number;
  requestedOutputTokens?: number;
  fallback: { rateLimitKey: string; maxPerMinute: number; maxOutputTokens?: number };
}): Promise<GovernedReservation> {
  try {
    const reservation = await reserveSamiQExecution(args);
    return { governed: true, ...reservation };
  } catch (error) {
    if (!(error instanceof SamiQGovernanceUnavailableError)) throw error;
    const rl = rateLimit(
      `${args.fallback.rateLimitKey}:${args.userId}`,
      args.fallback.maxPerMinute,
      60_000,
    );
    if (!rl.allowed) throw new SamiQQuotaError("user_rate_limit_local", rl.retryAfterS);
    return {
      governed: false,
      executionId: null,
      modelId: FALLBACK_MODEL_ID,
      systemPrompt: null,
      actionPrompt: null,
      maxOutputTokens: args.fallback.maxOutputTokens ?? args.requestedOutputTokens ?? 700,
    };
  }
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
    _error_code: args.errorCode ?? undefined,
  });
  return !error && data === true;
}
