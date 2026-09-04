import { isReservedSlug } from "./reserved-slugs";
import { slugify } from "./slugify";

/**
 * Choosing an artist's slug, in one place.
 *
 * It used to happen three ways: `api/apply/route.ts` used the shared
 * `slugify()` with a 2..49 collision loop, `api/auth/oauth-finalize/route.ts`
 * had its own inline slugify with a 1..99 loop, and
 * `apply/claim/page.tsx` had a third local slugify and no loop at all. They
 * disagreed on accents and on underscores, so the same artist got a different
 * URL depending on how they signed up.
 *
 * That divergence stopped being cosmetic when the slug became a public vanity
 * URL at `/{slug}`, and it had to be touched anyway to add the reserved-slug
 * guard, so the three collapse here.
 *
 * The IO is injected rather than imported, so this file has no Supabase
 * dependency and works unchanged on the client (the claim page) and the server.
 */

/** Escape appended to a name that slugifies to a reserved word. */
const RESERVED_ESCAPE = "artist";

/**
 * The slug an artist's name wants to be, before uniqueness is considered.
 *
 * Never empty and never reserved. A studio trading under a single word is the
 * realistic way a reserved name arrives here: "Bloom", "Atlas", "Press".
 */
export function artistSlugBase(name: string): string {
  const slug = slugify(name) || RESERVED_ESCAPE;
  // Keep the name recognisable rather than renumbering it: `shop` becomes
  // `shop-artist`, not `shop-2`, which would imply a `shop-1` exists.
  return isReservedSlug(slug) ? `${slug}-${RESERVED_ESCAPE}` : slug;
}

interface ChooseArtistSlugOptions {
  /** Numbered candidates to try before falling back to `uniqueSuffix`. */
  maxAttempts?: number;
  /** Last resort when every numbered candidate is taken. */
  uniqueSuffix?: () => string;
}

/**
 * A free, non-reserved slug for `name`.
 *
 * `isTaken` answers whether a candidate already exists, normally a lookup
 * against `artist_profiles.slug`. It is asked about candidates in order and
 * only until one comes back free.
 *
 * Two failure modes the old loops got wrong, both of which ended with the
 * profile silently not being created:
 *
 *  - **Exhaustion.** They returned the last candidate without ever checking it,
 *    so the insert hit the UNIQUE constraint. Here exhaustion falls through to
 *    `uniqueSuffix`, which collides only if the same artist signs up twice in
 *    the same millisecond.
 *  - **A failing probe.** An error from the lookup propagated and took signup
 *    with it. Here it is treated as "unknown, assume free": a UNIQUE violation
 *    on insert is a better outcome than refusing the signup, and the caller
 *    already handles insert failure.
 */
export async function chooseArtistSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
  options: ChooseArtistSlugOptions = {},
): Promise<string> {
  const { maxAttempts = 50, uniqueSuffix = () => Date.now().toString(36) } = options;
  const base = artistSlugBase(name);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    let clash: boolean;
    try {
      clash = await isTaken(candidate);
    } catch {
      clash = false;
    }
    if (!clash) return candidate;
  }

  return `${base}-${uniqueSuffix()}`;
}
