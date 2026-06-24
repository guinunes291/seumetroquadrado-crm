// Rate limit simples em memória (janela fixa por chave). Não substitui um rate
// limit de borda (Cloudflare) nem é compartilhado entre instâncias, mas evita
// abuso/enumeração trivial e protege custo (ex.: chamadas de IA) por processo.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

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
}
