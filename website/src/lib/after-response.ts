// Run work after the response has been sent.
//
// E36d. The public signup forms (apply, waitlist, register-venue) leaked
// account existence two ways: a distinct 409 status and message on a duplicate
// email, and — surviving that fix — response latency, because the fresh-
// submission path awaited an email send while the duplicate path returned
// straight away. Identical status codes do not help if one branch is 300ms
// slower than the other.
//
// Moving the send off the response path makes both branches return at the same
// point, so the timing difference is gone rather than merely narrowed. It also
// makes the forms faster for everyone, which is the real reason to prefer this
// over padding the fast branch with an artificial delay.
//
// `after` is Next's supported primitive for this; on Vercel the function stays
// alive until the scheduled work finishes, so nothing is dropped the way a bare
// floating promise would be.

import { after } from "next/server";

/**
 * Schedule `task` to run once the response has been sent.
 *
 * The task's failures are logged, never rethrown: callers use this for
 * best-effort work (email, notifications) whose failure must not change the
 * response the user already received.
 */
export function afterResponse(task: () => Promise<unknown>): void {
  const guarded = async () => {
    try {
      await task();
    } catch (err) {
      console.error("[after-response] task failed:", err);
    }
  };

  try {
    after(guarded);
  } catch {
    // No Next request scope. That means a route handler invoked directly —
    // unit tests and scripts — where `after` throws rather than deferring.
    // Start the work now so behaviour is otherwise identical; the timing
    // equality this exists for only matters in production.
    void guarded();
  }
}
