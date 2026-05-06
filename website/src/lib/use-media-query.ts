"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Track whether a CSS media query currently matches.
 *
 * Backed by `useSyncExternalStore` so:
 *   - SSR is safe (the server snapshot is a fixed `false`, so the
 *     server-rendered markup is stable and the client doesn't get a
 *     hydration mismatch on first paint).
 *   - There's no `setState` inside an effect (avoids the
 *     react-hooks/set-state-in-effect cascading-render smell).
 *   - Concurrent rendering reads consistent values across the tree.
 *
 * Usage:
 *   const isMobile = useMediaQuery("(max-width: 768px)");
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) {
        // No matchMedia available (SSR or jsdom-without-matchMedia
        // tests) — return a no-op unsubscribe.
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    [query],
  );

  // Snapshots are read on every render. matchMedia is cheap (the
  // browser caches the underlying MediaQueryList for a given string)
  // so there's no win in memoising it ourselves.
  const getSnapshot = () => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  };

  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
