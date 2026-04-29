/**
 * Feature flags.
 *
 * Lightweight env-driven flags. Each flag is a boolean read from
 * NEXT_PUBLIC_FLAG_<name>. Defaults are conservative (off) so a missing
 * env var never accidentally exposes an in-progress feature.
 *
 * Why NEXT_PUBLIC_*:
 *   Flags are read on both the server (API routes, server components) and
 *   the client (interactive components that decide whether to show a
 *   button). NEXT_PUBLIC_* is inlined at build time, so client reads work
 *   without a network call.
 *
 * Why no remote provider yet:
 *   We deploy via Vercel; flipping an env var triggers a redeploy in
 *   ~30s. That's good enough for our cadence today. If we need true
 *   runtime flags (without redeploy) we can swap this file's internals to
 *   call out to LaunchDarkly / Statsig / Vercel Edge Config without
 *   changing any callers.
 *
 * Convention:
 *   - One flag per major in-flight feature.
 *   - Off by default in production.
 *   - On in dev (so local testing doesn't need to touch .env).
 *
 * Usage:
 *   import { isFlagOn } from "@/lib/feature-flags";
 *   if (isFlagOn("WALL_VISUALIZER_V1")) { ... }
 */

export type FeatureFlag = "WALL_VISUALIZER_V1" | "OAUTH_GOOGLE_APPLE";

interface FlagDef {
  envKey: string;
  /** Whether the flag defaults to ON in development. */
  devDefault: boolean;
  /** Whether the flag defaults to ON in production. */
  prodDefault: boolean;
  description: string;
}

const FLAGS: Record<FeatureFlag, FlagDef> = {
  WALL_VISUALIZER_V1: {
    envKey: "NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1",
    devDefault: true,
    prodDefault: true,
    description:
      "Phase 1 wall visualizer (preset walls, customer + venue flows, " +
      "non-AI render, plus artist showroom + mockup-attach). On in " +
      "prod by default, set NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1=0 in " +
      "Vercel to kill-switch if it misbehaves.",
  },
  OAUTH_GOOGLE_APPLE: {
    envKey: "NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE",
    devDefault: false,
    prodDefault: false,
    description:
      "Show 'Continue with Google / Apple' on login + signup. Off until the " +
      "providers are enabled in the Supabase dashboard and the OAuth client " +
      "credentials (Google Cloud, Apple Developer) are configured. Flip to 1 " +
      "in Vercel once both are live.",
  },
};

function readBoolEnv(key: string): boolean | null {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw === "") return null;
  const v = raw.toLowerCase().trim();
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return null;
}

/**
 * Is the given flag currently on?
 *
 * Resolution order:
 *   1. Explicit env value (NEXT_PUBLIC_FLAG_*)
 *   2. NODE_ENV-aware default (devDefault in dev, prodDefault in prod)
 */
export function isFlagOn(flag: FeatureFlag): boolean {
  const def = FLAGS[flag];
  if (!def) return false;
  const explicit = readBoolEnv(def.envKey);
  if (explicit !== null) return explicit;
  const isProd = process.env.NODE_ENV === "production";
  return isProd ? def.prodDefault : def.devDefault;
}

/** Throw if the flag is off, handy for API routes that must short-circuit. */
export function requireFlag(flag: FeatureFlag): void {
  if (!isFlagOn(flag)) {
    throw new Error(`Feature flag ${flag} is disabled`);
  }
}

/** All flags + their resolved state, for /api/_internal/flags or dev pages. */
export function listFlags(): Array<{
  flag: FeatureFlag;
  on: boolean;
  description: string;
}> {
  return (Object.keys(FLAGS) as FeatureFlag[]).map((f) => ({
    flag: f,
    on: isFlagOn(f),
    description: FLAGS[f].description,
  }));
}
