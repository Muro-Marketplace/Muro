/**
 * Runtime environment validation.
 *
 * Parsed once at module load. Calling `env()` (server) or `publicEnv()`
 * (anywhere) returns a typed object with the validated values.
 *
 * Why this file exists:
 *   - Catches missing vars at boot, not at first request
 *   - Makes it hard to accidentally import a server-only var on the client
 *     (the client getter only exposes NEXT_PUBLIC_* fields)
 *   - Typescript autocomplete across the codebase
 *
 * Called-at-use pattern instead of eagerly parsing at module load: email
 * sending is optional, Stripe price IDs might be unset in dev, etc. The
 * server schema only throws when a REQUIRED var is missing, each callsite
 * gets a clear error rather than a mysterious crash.
 */

import { z } from "zod";

// ─── Schemas ─────────────────────────────────────────────────────────

const serverSchema = z.object({
  // Supabase, required everywhere we touch the DB
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Site URL used in emails, redirects, etc.
  NEXT_PUBLIC_SITE_URL: z.string().url().default("https://wallplace.co.uk"),

  // Admin access, fails closed if unset in admin-auth.ts, but we declare
  // it optional here so ordinary routes don't trip. Either ADMIN_EMAILS or
  // ADMIN_EMAIL is accepted, the admin-auth helper reads both.
  ADMIN_EMAILS: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),

  // Cron, required for scheduled routes + payout processing. Checked at
  // the individual route level with a clear 503 if missing.
  CRON_SECRET: z.string().min(16).optional(),

  // Stripe, required for checkout + webhooks. Only validated when actually used.
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  STRIPE_PRICE_CORE: z.string().optional(),
  STRIPE_PRICE_CORE_ANNUAL: z.string().optional(),
  STRIPE_PRICE_PREMIUM: z.string().optional(),
  STRIPE_PRICE_PREMIUM_ANNUAL: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_PRO_ANNUAL: z.string().optional(),

  // Resend + email, optional. sendEmail() short-circuits if missing.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM_TX: z.string().optional(),
  EMAIL_FROM_NOTIFY: z.string().optional(),
  EMAIL_FROM_NEWS: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),

  // Runtime
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const publicSchema = serverSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
  NEXT_PUBLIC_SITE_URL: true,
});

// ─── Parse once (server) ─────────────────────────────────────────────
// Lazy so importing this file on the client doesn't try to access
// server-only variables (which would be undefined there anyway, but
// the validation would throw).

let _server: z.infer<typeof serverSchema> | null = null;

/**
 * Server-side env accessor. Call inside API routes / server components /
 * server actions. Throws a clear error listing every missing required var.
 *
 * Safe to call many times, result is cached after first parse.
 */
export function serverEnv(): z.infer<typeof serverSchema> {
  if (_server) return _server;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid server environment variables:\n${issues}\n\nSee .env.example for the full schema.`,
    );
  }
  _server = parsed.data;
  return _server;
}

/** The six Stripe subscription price envs the webhook maps to a plan (D12). */
const STRIPE_PRICE_ENVS = [
  "STRIPE_PRICE_CORE",
  "STRIPE_PRICE_CORE_ANNUAL",
  "STRIPE_PRICE_PREMIUM",
  "STRIPE_PRICE_PREMIUM_ANNUAL",
  "STRIPE_PRICE_PRO",
  "STRIPE_PRICE_PRO_ANNUAL",
] as const;

/** Which of the six subscription price envs are unset. */
export function missingStripePriceEnvs(): string[] {
  return STRIPE_PRICE_ENVS.filter((k) => !process.env[k]);
}

/**
 * Assert every subscription price env is set in production (D12). A missing one
 * meant an artist's plan could not be resolved from their price id, and the old
 * webhook silently stamped `core` and overcharged them. The webhook now fails
 * closed (ignores the event), but this surfaces the misconfiguration loudly. Call
 * at boot / from a deploy healthcheck. A no-op outside production.
 */
export function assertStripePricesConfigured(): void {
  if (process.env.NODE_ENV !== "production") return;
  const missing = missingStripePriceEnvs();
  if (missing.length > 0) {
    throw new Error(
      `Missing Stripe subscription price env(s) in production: ${missing.join(", ")}. ` +
        `Artist plans cannot be resolved without them (D12).`,
    );
  }
}

/**
 * Public env accessor. Only exposes NEXT_PUBLIC_* keys, safe to call from
 * client components.
 */
export function publicEnv(): z.infer<typeof publicSchema> {
  // process.env is inlined by Next.js at build time for NEXT_PUBLIC_ vars,
  // so this works the same on client and server.
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
}
