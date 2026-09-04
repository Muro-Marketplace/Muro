/**
 * Slugs an artist may never hold.
 *
 * The vanity URL (`src/app/(pages)/[artistSlug]/page.tsx`) resolves
 * `wallplace.co.uk/{slug}` to an artist's shop, which puts artist slugs and
 * top-level route names in one namespace. Before that route existed a slug only
 * ever appeared under `/browse/`, so a collision was harmless. Now it shadows a
 * page, in whichever direction the clash arrives from: an artist taking
 * `pricing`, or a future route named after an artist who has already printed
 * their URL on a business card.
 *
 * Next resolves the filesystem before dynamic routes, so a real page always
 * wins the request. That protects the site and strands the artist, whose link
 * silently stops reaching their shop. Hence the guard at slug assignment rather
 * than at request time.
 *
 * `src/lib/reserved-slugs.test.ts` derives this set from the route tree on disk
 * and fails when a route is missing from it, so adding a page without adding
 * its name here breaks CI rather than someone's bio link.
 */
const RESERVED = [
  // Top-level pages, src/app/(pages)/*
  "about",
  "account",
  "admin",
  "apply",
  "artist-agreement",
  "artist-portal",
  "artists",
  "artwork-requests",
  "blog",
  "browse",
  "check-your-inbox",
  "checkout",
  "complaints",
  "contact",
  "cookies",
  "curated",
  "customer",
  "customer-portal",
  "dev",
  "faqs",
  "feature-requests",
  "forgot-password",
  "galleries",
  "how-it-works",
  "ip-policy",
  "login",
  "newsletter",
  "orders",
  "partners",
  "placements",
  "pricing",
  "privacy",
  "profile-designs",
  "programmes",
  "register-venue",
  "reset-password",
  "returns",
  "signup",
  "spaces",
  "sustainability",
  "terms",
  "venue-agreement",
  "venue-portal",
  "venues",

  // Top-level app entries outside the (pages) group.
  "api",
  "auth",
  "email-preview",
  "waitlist",

  // Served straight out of public/.
  "file.svg",
  "globe.svg",
  "images",
  "next.svg",
  "vercel.svg",
  "window.svg",

  // Fixed-path route handlers. robots.ts serves /robots.txt and sitemap.ts
  // serves /sitemap.xml, so neither appears as a directory in the tree walk.
  "robots",
  "robots.txt",
  "sitemap",
  "sitemap.xml",

  // Framework-owned.
  "_next",

  // Not routes yet. Reserving them costs nothing today and is impossible once
  // an artist holds the URL and has put it in their bio.
  "sell",
  "shop",
  "store",
  "help",
  "support",
  "press",
  "careers",
] as const;

export const RESERVED_SLUGS: ReadonlySet<string> = new Set(RESERVED);

/**
 * True when `slug` may not be given to an artist.
 *
 * Normalises before checking rather than trusting the caller: slugs arrive here
 * from `slugify()` already lowercased, but the claim flow
 * (`src/app/(pages)/apply/claim/page.tsx`) carries its own divergent copy of
 * slugify, so the guard cannot assume it was cleaned up.
 *
 * An empty slug is reserved. `slugify()` returns "" for input with no
 * alphanumerics, and an empty slug would make the vanity URL the site root.
 */
export function isReservedSlug(slug: string): boolean {
  const normalised = slug.trim().toLowerCase();
  if (normalised === "") return true;
  return RESERVED_SLUGS.has(normalised);
}
