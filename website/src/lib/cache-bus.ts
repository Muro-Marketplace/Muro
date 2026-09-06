/**
 * Where "a write landed, drop what you are holding" is announced.
 *
 * This exists to break an import cycle. `mutate()` in lib/api-client.ts has to
 * invalidate the client-side caches, and lib/portal-get.ts is one of them, but
 * portal-get reads through `authFetch` and so imports api-client. Wiring them
 * to each other made api-client -> portal-get -> api-client, which resolved to
 * `authFetch === undefined` inside portal-get whenever a test loaded the real
 * api-client module (the blogs suite found it).
 *
 * Both sides depend on this module instead, and neither on the other. A cache
 * registers its own clear on load; api-client announces without knowing who is
 * listening.
 */

const clears = new Set<() => void>();

/** Register a cache's clear. Call at module load; it is never unregistered. */
export function onCacheInvalidate(clear: () => void): void {
  clears.add(clear);
}

/**
 * Drop every registered cache. Called by mutate() after a confirmed write.
 *
 * A clear that throws must not stop the others: they are independent caches and
 * a half-invalidated set is exactly the state this is meant to prevent.
 */
export function invalidateCaches(): void {
  for (const clear of clears) {
    try {
      clear();
    } catch {
      /* keep going: the remaining caches still have to be dropped */
    }
  }
}

/** Test seam. */
export function registeredCacheCount(): number {
  return clears.size;
}
