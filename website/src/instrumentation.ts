import { missingEmailEnv, isProductionRuntime } from "@/lib/email/env";

/**
 * 09 §A.6 layer 1, the boot assertion.
 *
 * Next calls register() once per server start. E1: a production deploy with no
 * RESEND_API_KEY dropped every email silently and nothing surfaced it, so the
 * gap could run for a week. Production now hard-fails at boot rather than
 * serving traffic that cannot send mail; preview and local warn once and carry
 * on, so `npm run dev` does not error on every signup.
 *
 * Layers 2 (sendEmail stops reporting success for a no-op) and 3 (the
 * /api/health/email route) catch what this one cannot: a key that is present at
 * boot but revoked later, and a key that is missing in a non-production
 * environment nobody is watching.
 */
export async function register() {
  // Only the Node runtime has the full env; the edge copy would false-positive.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const missing = missingEmailEnv();
  if (missing.length === 0) return;

  const msg = `[email] missing required env: ${missing.join(", ")}`;
  if (isProductionRuntime()) throw new Error(msg);
  console.warn(`${msg}, emails will be skipped in this environment`);
}
