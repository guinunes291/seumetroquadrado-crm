const MAX_LEGACY_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

/** Janela legada: opt-in exato, futura e nunca superior a sete dias. */
export function legacyApiWindowIsOpen(now = Date.now()): boolean {
  if (process.env.PUBLIC_API_LEGACY_ENABLED !== "true") return false;
  const rawStartedAt = process.env.PUBLIC_API_LEGACY_STARTED_AT;
  const rawUntil = process.env.PUBLIC_API_LEGACY_UNTIL;
  if (!rawStartedAt || !rawUntil) return false;
  const startedAt = Date.parse(rawStartedAt);
  const until = Date.parse(rawUntil);
  return (
    Number.isFinite(startedAt) &&
    Number.isFinite(until) &&
    startedAt <= now &&
    until > now &&
    until > startedAt &&
    until - startedAt <= MAX_LEGACY_WINDOW_MS
  );
}
