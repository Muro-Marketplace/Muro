/**
 * 09 §A.6 layer 1. Which of the env vars email delivery depends on are missing?
 *
 * Extracted from instrumentation.ts so it can be unit-tested: the boot hook
 * itself runs once per server start and throws, which is not something a test
 * can drive directly.
 *
 * CRON_SECRET is on the list because the digest and nudge crons are email
 * senders too; without it they refuse to run and their mail silently never goes.
 */
export const REQUIRED_EMAIL_ENV = [
  "RESEND_API_KEY",
  "EMAIL_FROM_TX",
  "EMAIL_FROM_NOTIFY",
  "EMAIL_FROM_NEWS",
  "CRON_SECRET",
] as const;

export type RequiredEmailEnv = (typeof REQUIRED_EMAIL_ENV)[number];

/**
 * Returns the missing keys, in declaration order. A key set to the empty string
 * counts as missing: Vercel lets you save a blank value, and a blank API key
 * fails exactly like an absent one but is far easier to miss in the dashboard.
 */
export function missingEmailEnv(
  env: Record<string, string | undefined> = process.env,
): RequiredEmailEnv[] {
  return REQUIRED_EMAIL_ENV.filter((k) => {
    const v = env[k];
    return v === undefined || v === null || v.trim() === "";
  });
}

/** True when this process is serving production traffic (not preview, not local). */
export function isProductionRuntime(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.VERCEL_ENV === "production";
}
