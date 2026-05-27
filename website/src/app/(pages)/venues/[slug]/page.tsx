import type { Metadata } from "next";
import VenueDetailClient from "./VenueDetailClient";

// Spaces paywall enforcement (high-priority audit fix).
//
// The detail page used to render the full venue profile server-side
// directly from the DB, bypassing the paywall that /spaces enforces on
// the listing UI. We've moved all DB reads behind /api/venues/[slug]
// (which 403s when the viewer can't see space details) and turned this
// route into a thin shell that hands off to VenueDetailClient. The
// client component then fetches with the viewer's auth header so the
// gate is applied uniformly.
//
// Metadata is kept neutral so the venue name never appears in the SSR
// HTML response, satisfying the "no protected info in the page source
// for gated viewers" acceptance criterion.

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  // Intentionally generic: rendering the venue's real name in the
  // <title> would leak the protected `name` field to any drive-by
  // scraper. The client component sets a richer document.title once
  // it confirms the viewer can see details.
  return {
    title: "Space, Wallplace",
    description: "Venue space on Wallplace.",
    robots: { index: false, follow: false },
  };
}

export default async function VenueDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <VenueDetailClient slug={slug} />;
}
