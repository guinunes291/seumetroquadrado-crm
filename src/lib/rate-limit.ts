// Rate limit simples em memória (janela fixa por chave). Não substitui um rate
// limit de borda (Cloudflare) nem é compartilhado entre instâncias, mas evita
// abuso/enumeração trivial e protege custo (ex.: chamadas de IA) por processo.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;
const SWEEP_EVERY_INSERTIONS = 256;
let insertionsSinceSweep = 0;

function sweepExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
  insertionsSinceSweep = 0;
}

function makeRoom(now: number): void {
  insertionsSinceSweep += 1;
  if (insertionsSinceSweep >= SWEEP_EVERY_INSERTIONS || buckets.size >= MAX_BUCKETS) {
    sweepExpired(now);
  }
  if (buckets.size < MAX_BUCKETS) return;

  // Limite rígido para impedir crescimento sem teto sob flood de chaves/IPs.
  // Remove primeiro a janela que expirará mais cedo.
  let oldestKey: string | undefined;
  let oldestResetAt = Number.POSITIVE_INFINITY;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < oldestResetAt) {
      oldestKey = key;
      oldestResetAt = bucket.resetAt;
    }
  }
  if (oldestKey !== undefined) buckets.delete(oldestKey);
}

export type RateLimitResult = {
  allowed: boolean;
  /** Requisições restantes na janela atual. */
  remaining: number;
  /** Segundos até a janela reiniciar. */
  retryAfterS: number;
};

/**
 * Consome 1 unidade da cota de `key`. Retorna se foi permitida e metadados.
 * @param key    identificador do cliente (chave de API, user id, IP…)
 * @param max    máximo de requisições por janela
 * @param windowMs duração da janela em ms
 * @param now    timestamp (injeção para testes)
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    if (!bucket) makeRoom(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, retryAfterS: 0 };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterS: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, remaining: Math.max(0, max - bucket.count), retryAfterS: 0 };
}

/** Limpa todos os buckets — apenas para testes. */
export function __resetRateLimit() {
  buckets.clear();
  insertionsSinceSweep = 0;
}

/** Observabilidade estritamente voltada a testes do limite de memória. */
export function __rateLimitBucketCountForTests(): number {
  return buckets.size;
}

export const __RATE_LIMIT_MAX_BUCKETS_FOR_TESTS = MAX_BUCKETS;
