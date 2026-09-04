/**
 * The artist's shop URL, in the short form they will actually share.
 *
 * Two URLs reach the same page and they are not interchangeable:
 *
 *   /browse/{slug}   canonical. What sitemap.ts emits, what the page's own
 *                    metadata points at, and where search engines index it.
 *   /{slug}          the vanity URL. What an artist puts in an Instagram bio
 *                    and what the post studio writes into captions. It 307s to
 *                    the canonical one.
 *
 * Everything an artist copies uses the short form. Everything a crawler reads
 * uses the canonical one.
 *
 * The origin is read from NEXT_PUBLIC_SITE_URL, which Next inlines at build
 * time, so this is identical on the client and the server. The fallback matches
 * the one used elsewhere in the codebase (see `api/apply/route.ts`).
 */
function origin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
  return configured.replace(/\/+$/, "");
}

/** Absolute vanity URL, for copying, QR codes and captions. */
export function shopUrl(slug: string): string {
  return `${origin()}/${slug}`;
}

/** The same URL without its scheme, which is noise on a bio line. */
export function shopUrlDisplay(slug: string): string {
  return shopUrl(slug).replace(/^https?:\/\//, "");
}
