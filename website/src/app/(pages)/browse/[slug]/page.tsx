import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { artists } from "@/data/artists";
import { getDisciplineById, resolveDiscipline, formatSubStyleLabel, disciplineLabel } from "@/data/categories";
import { getCollectionsByArtistSlug } from "@/lib/db/artist-collections";
import Breadcrumbs from "@/components/Breadcrumbs";
import Button from "@/components/Button";
import CollectionCard from "@/components/CollectionCard";
import MessageArtistButton from "@/components/MessageArtistButton";
import SaveButton from "@/components/SaveButton";
import VerifiedBadge from "@/components/VerifiedBadge";
import { PlacementButton, PlacementCTASection } from "@/components/PlacementCTA";
import ArtistProfileClient from "./ArtistProfileClient";
import { getArtistBySlug } from "@/lib/db/merged-data";
import { trackEvent, extractTrackingContext, generateVisitorId } from "@/lib/analytics";
import type { Metadata } from "next";

// Static params for seed artists, database artists use dynamic fallback
export async function generateStaticParams() {
  return artists.map((artist) => ({
    slug: artist.slug,
  }));
}

// Allow dynamic params for database artists not in static list
export const dynamicParams = true;
// Always read fresh from DB so new works/descriptions appear immediately
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  // Wrap the entire metadata build in try/catch, a throw here happens
  // BEFORE the page component runs and crashes the entire route to the
  // global error boundary ("Something went wrong"). Causes can be a
  // missing field on the artist row, an invalid OG image URL, a DB
  // connection blip, none of those should kill the page.
  try {
    const { slug } = await params;
    const artist = await getArtistBySlug(slug);

    if (!artist) {
      return { title: "Artist Not Found – Wallplace" };
    }

    // Defensive coercions, anything missing or malformed flows
    // through as a sensible fallback rather than throwing.
    const safeName = artist.name?.trim() || "Wallplace artist";
    const safeBio =
      typeof artist.shortBio === "string" && artist.shortBio.trim()
        ? artist.shortBio.trim()
        : `Browse ${safeName}'s work on Wallplace.`;
    // Only include an OG image when it parses as an absolute URL,
    // a relative or malformed string would throw downstream.
    let ogImage: { url: string; width: number; height: number } | null = null;
    if (artist.image) {
      try {
        new URL(artist.image);
        ogImage = { url: artist.image, width: 400, height: 400 };
      } catch {
        ogImage = null;
      }
    }

    return {
      title: `${safeName} – Wallplace`,
      description: safeBio,
      openGraph: {
        title: `${safeName} – Wallplace`,
        description: safeBio,
        images: ogImage ? [ogImage] : [],
        type: "profile",
      },
      twitter: {
        card: "summary",
        title: `${safeName} – Wallplace`,
        description: safeBio,
      },
    };
  } catch (err) {
    console.warn(
      "[browse/[slug] metadata] crashed:",
      err instanceof Error ? err.message : String(err),
    );
    return { title: "Wallplace artist" };
  }
}

/**
 * Pill used for the "Terms" group, accent-tinted with a tick.
 * Communicates "this is a commitment / an opt-in" in green-light style.
 */
function TermPill({ label, yes }: { label: string; yes: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full ${
      yes ? "bg-accent/10 text-accent border border-accent/20" : "bg-surface text-muted border border-border"
    }`}>
      {yes && <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>}
      {label}
    </span>
  );
}

/**
 * Pill used for the "Sells" group, quieter neutral chip, no tick.
 * Matches the format chips on the marketplace BrowseArtistCard so the
 * card → profile transition feels consistent.
 *
 * Always renders Originals / Prints / Framed (all three) so a venue
 * scanning can see what's missing as well as what's offered. Unsupported
 * formats render with strikethrough + faded styling, clearer than
 * just hiding them, since hiding can read as "I forgot to fill this in".
 */
function SellsPill({ label, yes }: { label: string; yes: boolean }) {
  return (
    <span
      className={`inline-block text-[11px] px-2 py-0.5 border rounded-sm ${
        yes
          ? "text-foreground/80 bg-surface border-border/70"
          : "text-muted/50 bg-surface/50 border-border/40 line-through"
      }`}
      title={yes ? `Sells ${label.toLowerCase()}` : `Doesn't sell ${label.toLowerCase()}`}
    >
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

  // Variant A, no banner, so we don't need a bannerSrc fallback. The
  // saved banner_image stays in the DB for future variants and for
  // social-card fallback in generateMetadata.
  //
  // Split offerings (what they sell) from terms (how they let venues
  // host). Offerings always render all three formats so venues can
  // see what the artist DOESN'T do (greyed-out / strikethrough)
  // alongside what they do, clearer than hiding the missing ones.
  const offerings = [
    { label: "Originals", yes: artist.offersOriginals },
    { label: "Prints", yes: artist.offersPrints },
    { label: "Framed", yes: artist.offersFramed },
  ];
  const terms = [
    {
      label: artist.revenueSharePercent
        ? `Revenue share · ${artist.revenueSharePercent}%`
        : "Revenue share",
      yes: artist.openToRevenueShare,
    },
    { label: "Paid loan", yes: artist.openToFreeLoan },
    { label: "Direct purchase", yes: artist.openToOutrightPurchase },
  ].filter((t) => t.yes);

  const hasStats =
    (artist.totalPlacements ?? 0) > 0 ||
    (artist.totalSales ?? 0) > 0 ||
    (artist.totalViews ?? 0) > 0;

  return (
    <div className="bg-background">
      {/* Variant A, no banner. Mobile gets a dedicated compact
          layout (header pair, full-width CTAs, stacked metadata);
          desktop renders the three-column grid. */}
      <section className="pt-6 lg:pt-12 pb-2">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <Breadcrumbs
            items={[
              { label: "Portfolios", href: "/browse?view=portfolios" },
              { label: artist.name },
            ]}
          />
          <Link
            href="/browse"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground mb-5 lg:mb-8"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11L5 7l4-4" />
            </svg>
            Back to Marketplace
          </Link>

          {/* ─── MOBILE LAYOUT (< lg) ───────────────────────────── */}
          <div className="lg:hidden">
            {/* Identity header, bigger photo + bigger type so the
                hero feels like a header rather than a notification
                row. Photo bumped 96 → 128, name bumped 2xl → 3xl,
                location/@insta promoted from xs/[11px] to sm/xs. */}
            <div className="flex items-start gap-4 mb-4">
              <div className="relative w-32 h-32 rounded-sm overflow-hidden bg-stone-100 border border-border shrink-0">
                <Image
                  src={artist.image || `https://picsum.photos/seed/${artist.slug}/600/600`}
                  alt={artist.name}
                  fill
                  className="object-cover"
                  sizes="128px"
                  priority
                />
                {/* Founding Artist badge removed per product decision. */}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted uppercase tracking-[0.18em] mb-1.5">
                  {disciplineLabel(artist.primaryMedium, artist.discipline)}
                </p>
                <div className="flex items-start gap-3 mb-1.5 flex-wrap">
                  <h1 className="font-serif text-3xl text-foreground leading-tight tracking-tight">
                    {artist.name}
                  </h1>
                  {/* Save artist (#27). Heart pairs with the existing
                      Message / Request placement CTAs further down so
                      followers can stash an artist they like and come
                      back to them, same affordance as Saatchi /
                      Vinted. */}
                  <SaveButton type="artist" itemId={artist.slug} size="sm" />
                  {artist.isVerified && (
                    <VerifiedBadge className="self-center" />
                  )}
                </div>
                <p className="text-muted text-sm">{artist.location}</p>
                {artist.instagram && (
                  <a
                    href={`https://instagram.com/${artist.instagram.replace("@", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors mt-1.5"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
                    {artist.instagram}
                  </a>
                )}
              </div>
            </div>

            {(artist.subStyles && artist.subStyles.length > 0) && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {artist.subStyles.slice(0, 6).map((s) => (
                  <span
                    key={s}
                    className="inline-block px-2 py-0.5 text-[10px] font-medium text-foreground/70 bg-surface border border-border rounded-full"
                  >
                    {formatSubStyleLabel(s)}
                  </span>
                ))}
              </div>
            )}

            <p className="text-foreground/85 leading-relaxed text-[14px] mb-4">
              {artist.shortBio}
            </p>

            {artist.styleTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {artist.styleTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-block px-2 py-0.5 text-[10px] font-medium text-foreground/65 bg-surface border border-border rounded-sm"
                  >
                    {formatSubStyleLabel(tag)}
                  </span>
                ))}
              </div>
            )}

            {/* Mobile CTAs, side-by-side, half-width each. Both
                stretch to fill their column so neither dominates. */}
            <div className="grid grid-cols-2 gap-2 mb-6">
              <MessageArtistButton
                artistSlug={artist.slug}
                artistName={artist.name}
                variant="accent"
                size="md"
                fullWidth
              />
              <PlacementButton
                artistSlug={artist.slug}
                artistName={artist.name}
                fullWidth
              />
            </div>

            {/* Metadata, compact stacked rows under the CTAs. The
                full sidebar from desktop wouldn't fit cleanly so we
                use a 2-col grid for the facts and full-width pill
                rows for Sells / Terms. */}
            <div className="border-t border-border pt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Delivery</p>
                <p className="text-sm font-medium text-foreground">{artist.deliveryRadius || "–"}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Suited for</p>
                <p className="text-sm font-medium text-foreground">
                  {artist.venueTypesSuitedFor.length > 0
                    ? artist.venueTypesSuitedFor.slice(0, 2).join(", ")
                    : "Any venue"}
                </p>
              </div>
            </div>

            {hasStats && (
              <div className="flex items-center gap-5 pt-4 mt-4 border-t border-border">
                {(artist.totalPlacements ?? 0) > 0 && (
                  <div>
                    <p className="text-base font-serif font-semibold text-foreground leading-none">{artist.totalPlacements}</p>
                    <p className="text-[10px] text-muted uppercase tracking-wider mt-1">Venue{artist.totalPlacements !== 1 ? "s" : ""}</p>
                  </div>
                )}
                {(artist.totalSales ?? 0) > 0 && (
                  <div>
                    <p className="text-base font-serif font-semibold text-foreground leading-none">{artist.totalSales}</p>
                    <p className="text-[10px] text-muted uppercase tracking-wider mt-1">Sold</p>
                  </div>
                )}
                {(artist.totalViews ?? 0) > 0 && (
                  <div>
                    <p className="text-base font-serif font-semibold text-foreground leading-none">{artist.totalViews}</p>
                    <p className="text-[10px] text-muted uppercase tracking-wider mt-1">Views</p>
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 mt-4 border-t border-border">
              <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Sells</p>
              <div className="flex flex-wrap gap-1.5">
                {offerings.map((o) => (
                  <SellsPill key={o.label} label={o.label} yes={o.yes} />
                ))}
              </div>
            </div>
            {terms.length > 0 && (
              <div className="pt-4 mt-4 border-t border-border">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Terms</p>
                <div className="flex flex-wrap gap-1.5">
                  {terms.map((t) => (
                    <TermPill key={t.label} label={t.label} yes={t.yes} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── DESKTOP LAYOUT (lg+) ───────────────────────────── */}
          {/* Three-column layout: photo + CTAs (left, 220px) →
              identity + bio (centre, flexible) → metadata (right,
              260px). */}
          <div className="hidden lg:grid grid-cols-[220px_minmax(0,1fr)_260px] gap-10 items-start">
            {/* LEFT, square photo + CTAs + Instagram. CTAs sit
                directly under the photo so the buyer's eye flows
                face → name → action. Both buttons render full-width
                of the column for visual weight as the primary CTA. */}
            <div className="space-y-3">
              <div className="relative aspect-square w-full max-w-[220px] rounded-sm overflow-hidden bg-stone-100 border border-border">
                <Image
                  src={artist.image || `https://picsum.photos/seed/${artist.slug}/600/600`}
                  alt={artist.name}
                  fill
                  className="object-cover"
                  sizes="220px"
                  priority
                />
                {/* Founding Artist badge removed per product decision. */}
              </div>
              {/* CTAs sit just below the photo with a generous gap so
                  the pair reads as two distinct actions, not a stacked
                  pill. Both stretch to the column width for visual
                  weight. */}
              <div className="flex flex-col gap-2.5 max-w-[220px] pt-1">
                <MessageArtistButton
                  artistSlug={artist.slug}
                  artistName={artist.name}
                  variant="accent"
                  size="md"
                  fullWidth
                />
                <PlacementButton
                  artistSlug={artist.slug}
                  artistName={artist.name}
                  fullWidth
                />
              </div>
              {/* @instagram moved into the centre column, alongside
                  discipline + location, to keep the left column from
                  stacking too tall. */}
            </div>

            {/* CENTRE, identity + bio + tags + CTAs. */}
            <div className="min-w-0">
              <p className="text-[11px] text-muted uppercase tracking-[0.18em] mb-3">
                {disciplineLabel(artist.primaryMedium, artist.discipline)}
              </p>
              <h1 className="font-serif text-4xl lg:text-5xl text-foreground leading-tight tracking-tight mb-2">
                {artist.name}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <p className="text-muted text-sm">{artist.location}</p>
                {artist.instagram && (
                  <>
                    <span className="text-border">·</span>
                    <a
                      href={`https://instagram.com/${artist.instagram.replace("@", "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
                      {artist.instagram}
                    </a>
                  </>
                )}
              </div>

              {(artist.subStyles && artist.subStyles.length > 0) && (
                <div className="flex flex-wrap gap-1.5 mb-6">
                  {artist.subStyles.slice(0, 6).map((s) => (
                    <span
                      key={s}
                      className="inline-block px-2.5 py-1 text-[11px] font-medium text-foreground/70 bg-surface border border-border rounded-full"
                    >
                      {formatSubStyleLabel(s)}
                    </span>
                  ))}
                </div>
              )}

              <p className="text-foreground/85 leading-relaxed text-[15px] max-w-2xl mb-6">
                {artist.shortBio}
              </p>

              {artist.styleTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-6">
                  {artist.styleTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block px-2.5 py-1 text-[11px] font-medium text-foreground/65 bg-surface border border-border rounded-sm"
                    >
                      {formatSubStyleLabel(tag)}
                    </span>
                  ))}
                </div>
              )}
              {/* CTAs moved to under the photo on the left so the
                  primary action sits next to the artist's face. */}
            </div>

            {/* RIGHT, metadata sidebar. Stacks all the venue-relevant
                facts so a buyer scanning for "would this work in my
                space" can see everything in one column without
                scrolling past the bio. Hairlines separate each group. */}
            <aside className="space-y-4">
              <div className="grid grid-cols-1 gap-y-3">
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Location</p>
                  <p className="text-sm font-medium text-foreground">{artist.location || "–"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Delivery</p>
                  <p className="text-sm font-medium text-foreground">{artist.deliveryRadius || "–"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Suited for</p>
                  <p className="text-sm font-medium text-foreground">
                    {artist.venueTypesSuitedFor.length > 0
                      ? artist.venueTypesSuitedFor.slice(0, 3).join(", ")
                      : "Any venue"}
                  </p>
                </div>
              </div>

              {hasStats && (
                <div className="flex items-center gap-5 pt-4 border-t border-border">
                  {(artist.totalPlacements ?? 0) > 0 && (
                    <div>
                      <p className="text-lg font-serif font-semibold text-foreground leading-none">{artist.totalPlacements}</p>
                      <p className="text-[10px] text-muted uppercase tracking-wider mt-1">Venue{artist.totalPlacements !== 1 ? "s" : ""}</p>
                    </div>
                  )}
                  {(artist.totalSales ?? 0) > 0 && (
                    <div>
                      <p className="text-lg font-serif font-semibold text-foreground leading-none">{artist.totalSales}</p>
                      <p className="text-[10px] text-muted uppercase tracking-wider mt-1">Sold</p>
                    </div>
                  )}
                  {(artist.totalViews ?? 0) > 0 && (
                    <div>
                      <p className="text-lg font-serif font-semibold text-foreground leading-none">{artist.totalViews}</p>
                      <p className="text-[10px] text-muted uppercase tracking-wider mt-1">Views</p>
                    </div>
                  )}
                </div>
              )}

              {/* Sells always renders Originals / Prints / Framed in
                  the same order so the row reads consistently across
                  every artist. Unsupported formats render with
                  strikethrough so the absence is explicit. Terms keeps
                  the accent-tinted tick pill, Terms are commitments
                  the artist opted into, Sells are inventory categories. */}
              <div className="pt-4 border-t border-border">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Sells</p>
                <div className="flex flex-wrap gap-1.5">
                  {offerings.map((o) => (
                    <SellsPill key={o.label} label={o.label} yes={o.yes} />
                  ))}
                </div>
              </div>
              {terms.length > 0 && (
                <div className="pt-4 border-t border-border">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Terms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {terms.map((t) => (
                      <TermPill key={t.label} label={t.label} yes={t.yes} />
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>

      {/* Portfolio + Extended Bio (client). Coerced to safe defaults
          so a row with NULL extended_bio / themes doesn't crash the
          client component on first render, the props are typed as
          required strings/arrays. Works with no image are filtered
          out: <Image src=""> throws during the initial server HTML
          render for client components and takes the whole route to
          the error boundary. */}
      <ArtistProfileClient
        artistName={artist.name ?? ""}
        artistSlug={artist.slug ?? ""}
        extendedBio={artist.extendedBio ?? ""}
        themes={Array.isArray(artist.themes) ? artist.themes : []}
        works={
          Array.isArray(artist.works)
            ? artist.works.filter(
                (w) => typeof w.image === "string" && w.image.trim().length > 0,
              )
            : []
        }
      />

      {/* Collections, pulled from the DB by artist slug. The seed
          getCollectionsByArtist() only filtered an empty seed array,
          so collections created in the artist portal never surfaced
          here; getCollectionsByArtistSlug() goes to Supabase. */}
      <CollectionsSection artistSlug={artist.slug} artistName={artist.name} />

      {/* CTA Block, hidden for artists viewing other artists */}
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

/**
 * Async section that fetches the artist's collections from Supabase
 * server-side and renders the grid. Filters out collections that
 * have no usable image so CollectionCard's <Image src=""> doesn't
 * crash the whole profile page render.
 *
 * Wrapped in a try so any DOM-level throw inside the grid (e.g. a
 * rogue prop on CollectionCard) becomes a logged warning + an
 * unrendered section, not a server-component crash that takes the
 * whole page down to the error boundary.
 */
async function CollectionsSection({
  artistSlug,
  artistName,
}: {
  artistSlug: string;
  artistName: string;
}) {
  try {
    const collections = await getCollectionsByArtistSlug(
      artistSlug,
      artistName,
    );
    // Drop collections with no usable image source, Next.js Image
    // throws on src="" / undefined, and the artist_collections
    // schema doesn't guarantee any of these three columns are set
    // (cover_image isn't even a real column on the table). One
    // image-less collection used to take the whole profile page
    // down to the global error boundary.
    const renderable = collections.filter(
      (c) => !!(c.thumbnail || c.bannerImage || c.coverImage),
    );
    if (renderable.length === 0) return null;
    return (
      <section className="py-10 lg:py-14 border-t border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-2xl mb-6">Collections</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {renderable.map((col) => (
              <CollectionCard key={col.id} collection={col} />
            ))}
          </div>
        </div>
      </section>
    );
  } catch (err) {
    console.warn(
      "[CollectionsSection] render failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
