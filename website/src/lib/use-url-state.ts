"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * Tiny URL-state hook. Reads `?param=` on mount; setting writes via
 * router.replace so state survives reload, share, back/forward.
 *
 * Designed for tab state, sort, single-value filters. For multi-value
 * objects, prefer per-param useUrlState calls or a future dedicated hook.
 *
 * Setting back to defaultValue removes the param entirely so the URL
 * stays clean ("/page" rather than "/page?tab=works").
 *
 * Other unrelated params on the URL are preserved.
 */
export function useUrlState<T extends string>(
  param: string,
  defaultValue: T,
): readonly [T, (next: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const value = (searchParams.get(param) as T | null) ?? defaultValue;

  const set = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === defaultValue) params.delete(param);
      else params.set(param, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams, param, defaultValue],
  );

  return useMemo(() => [value, set] as const, [value, set]);
}
