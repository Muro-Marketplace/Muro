import { notFound, redirect } from "next/navigation";
import { artistSlugExists } from "@/lib/db/merged-data";

/**
 * The vanity URL: `wallplace.co.uk/{slug}` resolves to an artist's shop.
 *
 * This is the link an artist puts in their Instagram bio, and it is what
 * `InstagramPostGenerator` has always written into its captions
 * (`wallplace.co.uk/{artistSlug}`). Until this route existed nothing served
 * that path, so every caption the post studio generated pointed at a 404.
 *
 * **Why a route and not a `redirects()` entry.** Next resolves `redirects()`
 * before the filesystem, so a `/:slug` rule there would swallow `/about`,
 * `/pricing`, `/browse` and every other page on the site. A dynamic route is
 * matched *after* the filesystem, so every real page still wins its own URL and
 * only unclaimed paths reach this file.
 *
 * **Why 307 and not 308.** `permanentRedirect` sends a 308, which browsers
 * cache indefinitely. On a catch-all that would pin every mistyped path in a
 * visitor's browser forever, including paths we might later want to ship as
 * real pages. The repo has been bitten by exactly that before: see the K8 note
 * on `/browse/finlay-coles` in `next.config.ts`. There is no SEO cost, because
 * `/browse/{slug}` is canonical in `sitemap.ts` and in the profile's metadata.
 * This URL is a doorway, not an address.
 *
 * Artists cannot be given a slug that collides with a real route: see
 * `src/lib/reserved-slugs.ts`, whose set is derived from the route tree and
 * enforced at every slug-assignment path.
 */

/**
 * Lowercase alphanumerics in hyphen-separated runs, which is exactly what
 * `slugify()` emits. A cheap filter so the noise a catch-all attracts (asset
 * probes, traversal attempts, mistyped URLs with capitals or spaces) never
 * becomes a database round trip. It is not a second opinion on who exists.
 */
const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function ArtistVanityPage({
  params,
}: {
  params: Promise<{ artistSlug: string }>;
}) {
  const { artistSlug } = await params;

  if (!SLUG_SHAPE.test(artistSlug)) {
    notFound();
  }

  // notFound() and redirect() both work by throwing, so neither may sit inside
  // a try block and nothing after this point runs.
  if (!(await artistSlugExists(artistSlug))) {
    notFound();
  }

  redirect(`/browse/${artistSlug}`);
}
