"use client";

/**
 * useAutoSave, generic debounced auto-save hook.
 *
 * Why not just `useDebounce(value) → useEffect(save)`? Because layout JSON
 * is bigger than typical debounce targets and we want to avoid:
 *   1. Saving on every keystroke when it's mid-drag.
 *   2. Sending the same payload twice if the user pauses then keeps
 *      tweaking before the prior PATCH returns.
 *   3. Stale closures clobbering the latest data after a slow network.
 *
 * Surface:
 *   const { status, lastSavedAt, errorMessage, saveNow } =
 *     useAutoSave(value, save, { enabled, debounceMs, equals });
 *
 *   - status: "idle" | "dirty" | "saving" | "saved" | "error"
 *   - errorMessage: present when status === "error"
 *   - saveNow(): force-flush regardless of debounce; resolves to status
 *
 * The hook compares the previous-saved value to the current via `equals`
 * (defaults to JSON.stringify). When it changes, it transitions to dirty,
 * waits debounceMs, then awaits `save(value)`. If a newer value arrives
 * mid-flight, the in-flight result is discarded (stale-while-saving).
 *
 * Does NOT save on first mount, only when the value diverges from the
 * initial value. Pass `forceSaveOnMount: true` to override.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error";

export interface UseAutoSaveOptions<T> {
  /** Toggle the hook off entirely, useful while loading initial state. */
  enabled?: boolean;
  /** Debounce window. Default 800ms. */
  debounceMs?: number;
  /** Equality check between the last-saved value and the current value. */
  equals?: (a: T, b: T) => boolean;
  /** Save on first mount even before any change. Default false. */
  forceSaveOnMount?: boolean;
}

export interface UseAutoSaveResult {
  status: AutoSaveStatus;
  /** ISO timestamp of the last successful save. */
  lastSavedAt: string | null;
  errorMessage: string | null;
  /** Trigger an immediate save, bypassing the debounce. */
  saveNow: () => Promise<AutoSaveStatus>;
}

const defaultEquals = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

export function useAutoSave<T>(
  value: T,
  save: (val: T) => Promise<void>,
  options: UseAutoSaveOptions<T> = {},
): UseAutoSaveResult {
  const {
    enabled = true,
    debounceMs = 800,
    equals = defaultEquals,
    forceSaveOnMount = false,
  } = options;

  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs avoid stale-closure issues across timers.
  const lastSavedValueRef = useRef<T>(value);
  const pendingValueRef = useRef<T>(value);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  const equalsRef = useRef(equals);

  // Keep latest function refs without retriggering effects.
  saveRef.current = save;
  equalsRef.current = equals;

  // Core save runner, flushes whatever's in pendingValueRef, then checks
  // whether it became stale during the await and re-runs once if so.
  const flush = useCallback(async (): Promise<AutoSaveStatus> => {
    if (inFlightRef.current) {
      // Already saving, flag as dirty and let the in-flight handler loop.
      setStatus("dirty");
      return "dirty";
    }
    inFlightRef.current = true;
    setStatus("saving");
    setErrorMessage(null);
    try {
      while (true) {
        const target = pendingValueRef.current;
        await saveRef.current(target);
        // If the value drifted while we were awaiting, loop and save again.
        if (!equalsRef.current(target, pendingValueRef.current)) continue;
        lastSavedValueRef.current = target;
        const ts = new Date().toISOString();
        setLastSavedAt(ts);
        setStatus("saved");
        return "saved";
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setStatus("error");
      return "error";
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Track value changes; debounce + flush.
  useEffect(() => {
    pendingValueRef.current = value;
    if (!enabled) return;

    const isInitial =
      timerRef.current === null && status === "idle" && lastSavedAt === null;
    const unchanged = equalsRef.current(
      lastSavedValueRef.current,
      value,
    );

    if (isInitial && !forceSaveOnMount && unchanged) {
      // First render and identical to baseline, nothing to do.
      return;
    }
    if (unchanged && status === "saved") {
      // No-op: already saved this exact payload.
      return;
    }

    setStatus("dirty");
    setErrorMessage(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // We deliberately don't include `status` / `lastSavedAt`, they're
    // derived from the same chain and would cause re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled, debounceMs, flush, forceSaveOnMount]);

  // Manual flush.
  const saveNow = useCallback(async (): Promise<AutoSaveStatus> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return flush();
  }, [flush]);

  return { status, lastSavedAt, errorMessage, saveNow };
}
