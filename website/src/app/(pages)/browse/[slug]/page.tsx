import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { artists } from "@/data/artists";
import { getCollectionsByArtist } from "@/data/collections";
import Button from "@/components/Button";
import CollectionCard from "@/components/CollectionCard";
import MessageArtistButton from "@/components/MessageArtistButton";
import { PlacementButton, PlacementCTASection } from "@/components/PlacementCTA";
import ArtistProfileClient from "./ArtistProfileClient";
import { getArtistBySlug } from "@/lib/db/merged-data";
import { trackEvent, extractTrackingContext, generateVisitorId } from "@/lib/analytics";
import type { Metadata } from "next";

// Static params for seed artists — database artists use dynamic fallback
export async function generateStaticParams() {
  return artists.map((artist) => ({
    slug: artist.slug,
  }));
}

// Allow dynamic params for database artists not in static list
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtistBySlug(slug);

  if (!artist) {
    return { title: "Artist Not Found – Wallplace" };
  }

  return {
    title: `${artist.name} – Wallplace`,
    description: artist.shortBio,
    openGraph: {
      title: `${artist.name} – Wallplace`,
      description: artist.shortBio,
      images: artist.image ? [{ url: artist.image, width: 400, height: 400 }] : [],
      type: "profile",
    },
    twitter: {
      card: "summary",
      title: `${artist.name} – Wallplace`,
      description: artist.shortBio,
    },
  };
}

function BoolCard({ label, yes }: { label: string; yes: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full ${
      yes ? "bg-accent/10 text-accent border border-accent/20" : "bg-surface text-muted border border-border"
    }`}>
      {yes && <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>}
      {label}
    </span>
  );
}

export default async function ArtistProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artist = await getArtistBySlug(slug);

  if (!artist) {
    notFound();
  }

  // Track profile view (fire-and-forget, non-blocking)
  const headersList = await headers();
  const ctx = extractTrackingContext(headersList);
  trackEvent({
    event_type: "profile_view",
    artist_slug: slug,
    visitor_id: generateVisitorId(ctx.ip, ctx.userAgent),
    referrer: ctx.referrer || undefined,
    source: ctx.referrer?.includes("qr") ? "qr" : "browse",
  }).catch(() => {});

  return (
    <div className="bg-background">
      {/* Banner */}
      <section className="relative -mt-14 lg:-mt-16 h-52 lg:h-64 overflow-hidden">
        <Image
          src={artist.works[0]?.image || artist.image}
          alt={`${artist.name} banner`}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        <div className="absolute top-20 lg:top-24 left-0 right-0 z-10">
          <div className="max-w-[1200px] mx-auto px-6">
            <Link
              href="/browse"
              className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors duration-200"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11L5 7l4-4" />
              </svg>
              Back to Marketplace
            </Link>
          </div>
        </div>
      </section>

      {/* Profile header */}
      <section className="relative -mt-16 pb-0">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="relative w-28 h-28 lg:w-32 lg:h-32 rounded-full overflow-hidden shrink-0 bg-border/30 border-4 border-background shadow-lg mb-4">
            <Image
              src={artist.image || `https://picsum.photos/seed/${artist.slug}/400/400`}
              alt={artist.name}
              fill
              className="object-cover"
              sizes="128px"
            />
          </div>

          <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-stretch">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl lg:text-3xl leading-none">{artist.name}</h1>
                {artist.isFoundingArtist && (
                  <span className="inline-block px-2 py-0.5 bg-accent/10 text-accent text-[10px] font-medium rounded-sm border border-accent/20 cursor-help" title="One of the first 20 artists on Wallplace">
                    Founding Artist
                  </span>
                )}
              </div>
              <p className="text-muted text-sm">
                {artist.primaryMedium} &middot; {artist.location}
              </p>
              <p className="text-foreground/80 leading-relaxed max-w-lg text-base mb-4 mt-3">
                {artist.shortBio}
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {artist.styleTags.map((tag) => (
                  <span key={tag} className="inline-block px-2.5 py-0.5 text-[11px] text-muted bg-surface border border-border rounded-sm">{tag}</span>
                ))}
                {artist.instagram && (
                  <>
                    <span className="text-border mx-1">|</span>
                    <a href={`https://instagram.com/${artist.instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
                      {artist.instagram}
                    </a>
                  </>
                )}
                {artist.website && (
                  <a href={artist.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                    Website
                  </a>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <MessageArtistButton artistSlug={artist.slug} artistName={artist.name} variant="accent" size="md" />
                <PlacementButton artistSlug={artist.slug} artistName={artist.name} />
              </div>
            </div>

            <div className="w-full lg:w-[400px] shrink-0 lg:mt-16">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
                {[
                  { label: "Location", value: artist.location },
                  { label: "Delivery", value: artist.deliveryRadius },
                  { label: "Sizes", value: artist.availableSizes.slice(0, 3).join(", ") },
                  { label: "Suited for", value: artist.venueTypesSuitedFor.slice(0, 3).join(", ") },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-[11px] text-muted uppercase tracking-wider mb-0.5">{item.label}</p>
                    <p className="text-sm font-medium text-foreground">{item.value || "—"}</p>
                  </div>
                ))}
              </div>

              {/* Stats row - only show if there's data */}
              {((artist.totalPlacements ?? 0) > 0 || (artist.totalSales ?? 0) > 0 || (artist.totalViews ?? 0) > 0) && (
                <div className="flex items-center gap-4 mb-4 py-2.5 border-y border-border">
                  {(artist.totalPlacements ?? 0) > 0 && (
                    <div className="text-center">
                      <p className="text-lg font-serif font-semibold text-foreground leading-none">{artist.totalPlacements}</p>
                      <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Venue{artist.totalPlacements !== 1 ? "s" : ""}</p>
                    </div>
                  )}
                  {(artist.totalSales ?? 0) > 0 && (
                    <div className="text-center">
                      <p className="text-lg font-serif font-semibold text-foreground leading-none">{artist.totalSales}</p>
                      <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Sold</p>
                    </div>
                  )}
                  {(artist.totalViews ?? 0) > 0 && (
                    <div className="text-center">
                      <p className="text-lg font-serif font-semibold text-foreground leading-none">{artist.totalViews}</p>
                      <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Views</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Originals", yes: artist.offersOriginals },
                  { label: "Prints", yes: artist.offersPrints },
                  { label: "Framed", yes: artist.offersFramed },
                  { label: artist.revenueSharePercent ? `Display · ${artist.revenueSharePercent}% revenue share` : "Display", yes: artist.openToFreeLoan || artist.openToRevenueShare },
                  { label: "Purchase", yes: artist.openToOutrightPurchase },
                ].filter(item => item.yes).map((item) => (
                  <BoolCard key={item.label} label={item.label} yes={item.yes} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio + Extended Bio (client) */}
      <ArtistProfileClient
        artistName={artist.name}
        artistSlug={artist.slug}
        extendedBio={artist.extendedBio}
        themes={artist.themes}
        works={artist.works}
      />

      {/* Collections */}
      {(() => {
        const artistCollections = getCollectionsByArtist(artist.slug);
        if (artistCollections.length === 0) return null;
        return (
          <section className="py-10 lg:py-14 border-t border-border">
            <div className="max-w-[1200px] mx-auto px-6">
              <h2 className="text-2xl mb-6">Collections</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {artistCollections.map((col) => (
                  <CollectionCard key={col.id} collection={col} />
                ))}
              </div>
            </div>
          </section>
        );
      })()}

      {/* CTA Block — hidden for artists viewing other artists */}
      <PlacementCTASection>
        <section className="py-20 lg:py-24 border-t border-border">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-3xl lg:text-4xl mb-4">
                Interested in {artist.name}&rsquo;s work?
              </h2>
              <p className="text-muted leading-relaxed mb-8 text-lg">
                Get in touch to discuss pricing, availability, and how this artist&rsquo;s work could transform your venue.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <PlacementButton artistSlug={artist.slug} artistName={artist.name} variant="primary" size="lg" />
                <MessageArtistButton artistSlug={artist.slug} artistName={artist.name} variant="accent" size="lg" />
                <Button href="/browse" variant="secondary" size="lg">Browse More Artists</Button>
              </div>
            </div>
          </div>
        </section>
      </PlacementCTASection>
    </div>
  );
}
