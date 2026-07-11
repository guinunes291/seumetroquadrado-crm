// Decisão de disposição de cada item do push_outbox após a tentativa de envio.
// Módulo PURO (sem I/O) — o handler push-dispatch aplica a decisão no banco.
//
// Problema que resolve (A1): antes, todo item pendente era marcado como enviado
// incondicionalmente — mesmo com 0 subscriptions ou falha transitória —, então
// a notificação era perdida para sempre. Agora só marca "sent" quando houve
// entrega real; senão reagenda com backoff e só descarta após o teto.

export const PUSH_MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 5 * 60_000; // 5 min
const MAX_BACKOFF_MS = 6 * 60 * 60_000; // 6 h

export type PushSendOutcome = {
  /** Quantas subscriptions receberam a notificação com sucesso. */
  delivered: number;
  /** Quantas subscriptions o usuário tinha no momento do envio. */
  subscriptions: number;
};

export type PushDisposition =
  | { acao: "sent" }
  | { acao: "retry"; attempts: number; nextAttemptAt: string; lastError: string }
  | { acao: "discard"; attempts: number; lastError: string };

/** Backoff exponencial (5min, 10min, 20min… teto 6h) a partir do nº de tentativas. */
export function backoffMs(attempts: number): number {
  const exp = BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1);
  return Math.min(exp, MAX_BACKOFF_MS);
}

/**
 * Decide o que fazer com um item após a tentativa de envio.
 * @param item     estado atual (attempts = tentativas já feitas ANTES desta).
 * @param outcome  resultado desta tentativa.
 * @param nowMs    timestamp atual (injetável para teste).
 */
export function decidirDisposicao(
  item: { attempts: number },
  outcome: PushSendOutcome,
  nowMs: number,
): PushDisposition {
  if (outcome.delivered > 0) return { acao: "sent" };

  const attempts = (item.attempts ?? 0) + 1;
  const motivo = outcome.subscriptions === 0 ? "sem_subscriptions" : "falha_de_entrega";

  if (attempts >= PUSH_MAX_ATTEMPTS) {
    return {
      acao: "discard",
      attempts,
      lastError: `${motivo}: descartado após ${attempts} tentativas`,
    };
  }
  return {
    acao: "retry",
    attempts,
    nextAttemptAt: new Date(nowMs + backoffMs(attempts)).toISOString(),
    lastError: `${motivo}: reagendado (tentativa ${attempts})`,
  };
}
