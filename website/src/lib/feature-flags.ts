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
 *   - An in-flight feature is off in prod and on in dev, so local testing
 *     needs no .env edit.
 *   - Once a feature has shipped, its prodDefault flips to true and the env
 *     var becomes a kill switch (set it to 0 to disable without a code
 *     change). WALL_VISUALIZER_V1 and GATING_V1 are both at that stage, so
 *     "off by default in production" is no longer true of every flag here.
 *
 * Usage:
 *   import { isFlagOn } from "@/lib/feature-flags";
 *   if (isFlagOn("WALL_VISUALIZER_V1")) { ... }
 */

export type FeatureFlag =
  | "WALL_VISUALIZER_V1"
  | "OAUTH_GOOGLE_APPLE"
  | "GATING_V1"
  | "BLOGS_V1"
  | "SEED_CATALOG";

interface FlagDef {
  envKey: string;
  /** Whether the flag defaults to ON in development. */
  devDefault: boolean;
  /** Whether the flag defaults to ON in production. */
  prodDefault: boolean;
  description: string;
}

export const FLAGS: Record<FeatureFlag, FlagDef> = {
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
  GATING_V1: {
    envKey: "NEXT_PUBLIC_FLAG_GATING_V1",
    devDefault: false,
    prodDefault: true,
    description:
      "Phase 2.5: subscription gating across publish, placements, " +
      "artist-to-artist first contact, and /browse visibility. On in prod, " +
      "where the env var is already set to 1, so this default now agrees " +
      "with it instead of contradicting it. Set " +
      "NEXT_PUBLIC_FLAG_GATING_V1=0 in Vercel to kill-switch, the same " +
      "pattern WALL_VISUALIZER_V1 uses. Off in dev so local QA does not " +
      "need a subscription.",
  },
  BLOGS_V1: {
    envKey: "NEXT_PUBLIC_FLAG_BLOGS_V1",
    devDefault: true,
    prodDefault: false,
    description:
      "Phase 2.7: artist blog editor + public /blog surface + admin " +
      "review queue. On in dev for build-time QA; off in prod until the " +
      "first admin sweep is wired.",
  },
  SEED_CATALOG: {
    envKey: "NEXT_PUBLIC_FLAG_SEED_CATALOG",
    devDefault: true,
    prodDefault: true,
    description:
      "Launch audit: the 41 seed artists in src/data/artists.ts and the 21 " +
      "seed venues in src/data/venues.ts are fictional. Owner decision D1 " +
      "(2026-09-02) keeps them visible in production on the marketplace and " +
      "their own pages, labelled with a grey Sample pill. " +
      "Set NEXT_PUBLIC_FLAG_SEED_CATALOG=0 in Vercel to remove them from " +
      "the marketplace, artist pages, sitemap and venue demand tracker (the " +
      "homepage featured grid never shows a seed) in one go.",
  },
};

/**
 * One static read per flag, so webpack's DefinePlugin can inline the values into
 * the client bundle (E16, 06-validation-massassign.md §4.3).
 *
 * DefinePlugin only substitutes a statically-written member expression such as
 * `process.env.NEXT_PUBLIC_FLAG_GATING_V1`. It cannot substitute
 * `process.env[key]` with a computed key: the compiled chunk kept that as a
 * call-time lookup (`t.default.env[e]`) against the bundled `process` polyfill,
 * whose `env` is empty in the browser. So every client-side flag read returned
 * null from readBoolEnv and fell through to prodDefault, meaning the env var had
 * no effect on the client at all, in either direction. Upgrade prompts and
 * paywall affordances stayed hidden with gating on, and a kill switch flipped to
 * 0 kept rendering the feature it was meant to kill.
 *
 * The map must list every FLAGS envKey. C4 adds the CI check for that.
 */
export const CLIENT_ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1: process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1,
  NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE: process.env.NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE,
  NEXT_PUBLIC_FLAG_GATING_V1: process.env.NEXT_PUBLIC_FLAG_GATING_V1,
  NEXT_PUBLIC_FLAG_BLOGS_V1: process.env.NEXT_PUBLIC_FLAG_BLOGS_V1,
  NEXT_PUBLIC_FLAG_SEED_CATALOG: process.env.NEXT_PUBLIC_FLAG_SEED_CATALOG,
};

function readBoolEnv(key: string): boolean | null {
  // Live value first, build-time snapshot second. The server has a real,
  // current process.env and should keep using it (§4.3 suggests the reverse
  // order, which would pin the value to whatever was set when this module was
  // first evaluated). In the browser the first read is always undefined, so the
  // inlined snapshot is what answers.
  const raw = process.env[key] ?? CLIENT_ENV[key];
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
