// B4. /email-preview renders every template in the registry from its mock
// fixtures. Useful in development, and previously reachable by anyone on the live
// site, which handed out the whole transactional-email surface (wording,
// structure, what we send and when) to any visitor who guessed the path.
//
// D6 offers "delete or gate to admin+non-prod". Gated rather than deleted: the
// templates themselves are Keep per D0, the previewer is how anyone reviews them,
// and two smoke tests cover it.
//
// The gate is an ALLOWLIST and fails closed. src/env.ts defaults
// NEXT_PUBLIC_SITE_URL to https://wallplace.co.uk, so treating "unset" or
// "unrecognised" as non-production would be exactly the wrong way round.

/** Hosts where the previewer is available. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * True only where this is positively identifiable as a non-production
 * environment: a localhost origin, or a Vercel preview/development deploy.
 * Anything else, including an unset or unparseable site URL, reads as
 * production and the previewer 404s.
 */
export function isEmailPreviewAllowed(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  // A production deploy is production whatever the site URL claims.
  if (vercelEnv === "production") return false;
  if (vercelEnv === "preview" || vercelEnv === "development") return true;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return false;

  try {
    return LOCAL_HOSTS.has(new URL(siteUrl).hostname);
  } catch {
    // Unparseable means we cannot prove it is safe.
    return false;
  }
}
