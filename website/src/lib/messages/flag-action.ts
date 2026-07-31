import { mutate } from "@/lib/api-client";
import type { ToastOptions } from "@/context/ToastContext";

export type FlagOutcome = "reported" | "deleted" | "blocked";

export interface FlagActionArgs {
  url: string;
  method: "POST" | "DELETE";
  body: unknown;
  /** The confirmation state to set once the server accepts the action. */
  outcome: FlagOutcome;
  errorMessage: string;
  setSubmitting: (value: boolean) => void;
  setSubmitted: (outcome: FlagOutcome) => void;
  showToast: (message: string, opts?: ToastOptions) => void;
}

/**
 * The Report / Delete / Block actions in the message flag popup (E43-e).
 *
 * Each used to set its "submitted" confirmation regardless of the response:
 * `authFetch` resolves on a non-2xx (it does not throw) and the surrounding
 * catch swallowed network errors, so a failed action still told the user it
 * worked. Block was the worst — someone could believe a harasser was blocked
 * when the block never persisted.
 *
 * mutate() throws ApiError on a non-2xx and NetworkError when the request never
 * lands, so the confirmation is set ONLY after the action actually succeeds; a
 * failure surfaces an error toast and leaves the state untouched.
 *
 * Returns true if the server accepted the action.
 */
export async function submitFlagAction(args: FlagActionArgs): Promise<boolean> {
  const { url, method, body, outcome, errorMessage, setSubmitting, setSubmitted, showToast } = args;
  setSubmitting(true);
  try {
    await mutate(url, { method, body: JSON.stringify(body) });
    setSubmitted(outcome);
    return true;
  } catch {
    showToast(errorMessage, { variant: "error" });
    return false;
  } finally {
    setSubmitting(false);
  }
}
