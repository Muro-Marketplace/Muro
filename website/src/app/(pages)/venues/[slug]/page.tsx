import type { Metadata } from "next";
import VenueProfileBody from "./VenueProfileBody";

// Venue identity is paywalled (only the owner, subscribed artists, and
// customers may see it), and server-rendered metadata can't vary per viewer,
// so the SSR title/description stay generic and don't leak the venue name.
// VenueProfileBody fetches the gated /api/venues/[slug]/profile endpoint and
// renders either the full profile or a locked teaser; for entitled viewers it
// also sets a per-venue tab title client-side.
export const metadata: Metadata = {
  title: "Venue space · Wallplace",
  description: "A venue space on Wallplace.",
};

export default async function VenueDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <VenueProfileBody slug={slug} />;
}
