/* ============================================================
   Pure in-process fixed-window rate limiter: a Map keyed by an
   arbitrary string (userId, in the caller's case) with no app
   imports, so it can be unit-tested with a fake clock.
   ============================================================ */

// Once the map grows past this many entries, a check() prunes stale ones so
// memory stays bounded regardless of key cardinality.
const PRUNE_THRESHOLD = 10_000;

interface Entry {
  windowStart: number;
  count: number;
}

export interface RateLimiter {
  /** Records a hit for `key`; returns whether it is allowed and, when
      denied, whole seconds until the window resets. */
  check(key: string): { ok: true } | { ok: false; retryAfterSeconds: number };
}

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number; // injectable clock for tests; defaults to Date.now
}): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts;
  const entries = new Map<string, Entry>();

  function prune(currentTime: number): void {
    if (entries.size <= PRUNE_THRESHOLD) return;
    for (const [key, entry] of entries) {
      if (currentTime - entry.windowStart >= windowMs) {
        entries.delete(key);
      }
    }
  }

  return {
    check(key) {
      const currentTime = now();
      prune(currentTime);

      const existing = entries.get(key);
      if (!existing || currentTime - existing.windowStart >= windowMs) {
        entries.set(key, { windowStart: currentTime, count: 1 });
        return { ok: true };
      }

      existing.count += 1;
      if (existing.count <= limit) {
        return { ok: true };
      }

      const elapsed = currentTime - existing.windowStart;
      const retryAfterSeconds = Math.ceil((windowMs - elapsed) / 1000);
      return { ok: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
    },
  };
}
