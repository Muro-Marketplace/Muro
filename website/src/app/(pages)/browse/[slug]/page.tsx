import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { artists } from "@/data/artists";
import { getCollectionsByArtist } from "@/data/collections";
import Button from "@/components/Button";
import CollectionCard from "@/components/CollectionCard";
import ArtistProfileClient from "./ArtistProfileClient";
import type { Metadata } from "next";

export async function generateStaticParams() {
  return artists.map((artist) => ({
    slug: artist.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const artist = artists.find((a) => a.slug === slug);

  if (!artist) {
    return { title: "Artist Not Found – Wallspace" };
  }

  return {
    title: `${artist.name} – Wallspace`,
    description: artist.shortBio,
  };
}

function CheckIcon({ yes }: { yes: boolean }) {
  if (yes) {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-accent shrink-0"
      >
        <polyline points="2 7 5.5 10.5 12 3.5" />
      </svg>
    );
  }
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted/40 shrink-0"
    >
      <path d="M3 3l8 8M11 3L3 11" />
    </svg>
  );
}

function InfoCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-sm border ${
        highlight
          ? "border-accent/20 bg-accent/5"
          : "border-border bg-surface"
      }`}
    >
      <span className="mt-0.5 text-muted">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted uppercase tracking-wide leading-none mb-1">
          {label}
        </p>
        <p className="text-sm text-foreground font-medium leading-snug">
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

function BoolCard({ label, yes }: { label: string; yes: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 p-3.5 rounded-sm border ${
        yes ? "border-accent/20 bg-accent/5" : "border-border bg-surface"
      }`}
    >
      <CheckIcon yes={yes} />
      <span
        className={`text-sm leading-none ${yes ? "text-foreground" : "text-muted"}`}
      >
        {label}
      </span>
    </div>
  );
}

export default async function ArtistProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artist = artists.find((a) => a.slug === slug);

  if (!artist) {
    notFound();
  }

  return (
    <div className="bg-background">
      {/* Banner – uses first work as cover image */}
      <section className="relative -mt-14 lg:-mt-16 h-52 lg:h-64 overflow-hidden">
        <Image
          src={artist.works[0]?.image || artist.image}
          alt={`${artist.name} banner`}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        {/* Back link overlaid */}
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

      {/* Profile header – overlaps the banner */}
      <section className="relative -mt-16 pb-0">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* Profile pic – overlapping banner */}
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
            {/* Left: identity + bio */}
            <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h1 className="text-2xl lg:text-3xl leading-none">{artist.name}</h1>
                    {artist.isFoundingArtist && (
                      <span
                        className="inline-block px-2 py-0.5 bg-accent/10 text-accent text-[10px] font-medium rounded-sm border border-accent/20 cursor-help"
                        title="One of the first 20 artists on Wallspace – free access for life and priority venue matching"
                      >
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

              {/* Style tags + social – single row */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {artist.styleTags.map((tag) => (
                  <span key={tag} className="inline-block px-2.5 py-0.5 text-[11px] text-muted bg-surface border border-border rounded-sm">
                    {tag}
                  </span>
                ))}
                <span className="text-border mx-1">|</span>
                <a
                  href={`https://instagram.com/${artist.instagram.replace("@", "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" />
                    <circle cx="12" cy="12" r="5" />
                    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                  </svg>
                  {artist.instagram}
                </a>
                {artist.website && (
                  <a
                    href={artist.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    Website
                  </a>
                )}
              </div>

              <Button href="/contact" variant="accent" size="md">
                Message This Artist
              </Button>
            </div>

            {/* Right: commercial details – clean & light */}
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
                    <p className="text-sm font-medium text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Originals", yes: artist.offersOriginals },
                  { label: "Prints", yes: artist.offersPrints },
                  { label: "Framed", yes: artist.offersFramed },
                  { label: "Free loan", yes: artist.openToFreeLoan },
                  { label: "Revenue share", yes: artist.openToRevenueShare },
                  { label: "Purchase", yes: artist.openToOutrightPurchase },
                ].filter(item => item.yes).map((item) => (
                  <span key={item.label} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full bg-accent/10 text-accent border border-accent/20">
                    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                    {item.label}
                  </span>
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

      {/* CTA Block */}
      <section className="py-20 lg:py-24 border-t border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl lg:text-4xl mb-4">
              Interested in {artist.name}&rsquo;s work?
            </h2>
            <p className="text-muted leading-relaxed mb-8 text-lg">
              Get in touch to discuss pricing, availability, and how this
              artist&rsquo;s work could transform your venue.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/contact" variant="primary" size="lg">
                Message This Artist
              </Button>
              <Button href="/browse" variant="ghost" size="lg">
                Browse more artists
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
