"use client";

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { ApiError, NetworkError } from "@/lib/api-client";

export interface SaveActionOptions<TArgs extends unknown[], TResult> {
  /** The write itself. Must throw on failure, so use `mutate()`, not `authFetch`. */
  run: (...args: TArgs) => Promise<TResult>;
  /**
   * Apply the optimistic UI change and return the function that undoes it.
   * Follows the snapshot/restore shape used by SavedContext.toggleSaved.
   * Omit for saves that should not move the UI until the server confirms.
   */
  optimistic?: (...args: TArgs) => () => void;
  /** Runs only after a confirmed 2xx. Reconcile server state here. */
  onSuccess?: (result: TResult, ...args: TArgs) => void;
  /** Toast on confirmed success. Omit for silent saves (auto-save). */
  successMessage?: string | ((result: TResult) => string);
  /** Fallback error copy when the server sends nothing usable. */
  errorMessage?: string;
  /**
   * Clears the unsaved-changes guard. Called ONLY after a confirmed success,
   * never optimistically.
   */
  clearDirty?: () => void;
}

export interface SaveActionState<TArgs extends unknown[]> {
  /** Bind to the control's `disabled`. True while the request is in flight. */
  saving: boolean;
  /** Last failure, for inline error text next to the control. */
  error: string | null;
  /** True only between a confirmed success and the next change. */
  saved: boolean;
  /** Awaitable. Resolves true on confirmed success, false on any failure. */
  save: (...args: TArgs) => Promise<boolean>;
  /** Drop the saved/error banner when the user edits again. */
  reset: () => void;
}

function describe(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof NetworkError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * One save control, done correctly.
 *
 *   - disables the control for the whole round trip (and refuses re-entry)
 *   - awaits the request
 *   - reports success ONLY when the server confirmed it
 *   - rolls the optimistic state back and surfaces the real error otherwise
 *   - clears the unsaved-changes guard only after a confirmed success
 *
 * Usage:
 *   const saveProfile = useSaveAction({
 *     run: () => mutate("/api/artist-profile", { method: "PUT", body }),
 *     successMessage: "Profile saved",
 *     clearDirty: () => setHasUnsavedChanges(false),
 *   });
 *   <button onClick={() => saveProfile.save()} disabled={saveProfile.saving}>
 *     {saveProfile.saving ? "Saving..." : "Save changes"}
 *   </button>
 */
export function useSaveAction<TArgs extends unknown[] = [], TResult = unknown>(
  opts: SaveActionOptions<TArgs, TResult>,
): SaveActionState<TArgs> {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A ref, not state: it has to block a second click within the same tick,
  // before React has flushed `saving`. Double-submit on a slow connection was
  // producing duplicate rows on the offers and messages endpoints.
  const inFlight = useRef(false);

  // Latest options without re-creating `save` on every render.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const save = useCallback(
    async (...args: TArgs): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setSaving(true);
      setError(null);
      setSaved(false);

      const rollback = optsRef.current.optimistic?.(...args);

      try {
        const result = await optsRef.current.run(...args);

        optsRef.current.onSuccess?.(result, ...args);
        // Guard is cleared here and nowhere else.
        optsRef.current.clearDirty?.();
        setSaved(true);

        const msg = optsRef.current.successMessage;
        if (msg) {
          showToast(typeof msg === "function" ? msg(result) : msg);
        }
        return true;
      } catch (err) {
        rollback?.();
        const message = describe(err, optsRef.current.errorMessage ?? "Could not save. Please try again.");
        setError(message);
        showToast(message, { variant: "error", durationMs: 5000 });
        return false;
      } finally {
        inFlight.current = false;
        setSaving(false);
      }
    },
    [showToast],
  );

  const reset = useCallback(() => {
    setSaved(false);
    setError(null);
  }, []);

  return { saving, error, saved, save, reset };
}
