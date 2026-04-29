/**
 * /dev/profile-designs/[slug]
 *
 * Side-by-side design exploration for the public artist profile.
 * Renders four variants of the hero section using the same artist
 * data, stacked top-to-bottom. Use this to A/B the look without
 * touching the live /browse/[slug] page.
 *
 * Variants:
 *   A. No banner, gallery-website feel, profile photo big, bio
 *      gets full width.
 *   B. Slim banner with overlap, short banner, profile photo
 *      breaks the banner edge, identity in two columns.
 *   C. Glass card over banner, banner stays full-bleed but a
 *      blurred translucent card sits over it carrying the identity.
 *   D. Magazine split, banner image takes left half, identity
 *      block takes right half, very editorial.
 *
 * Pick the one you like and tell Claude to apply it to /browse/[slug].
 */

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArtistBySlug } from "@/lib/db/merged-data";
import { disciplineLabel, formatSubStyleLabel } from "@/data/categories";
import MessageArtistButton from "@/components/MessageArtistButton";
import { PlacementButton } from "@/components/PlacementCTA";
import type { Artist } from "@/data/artists";

export const dynamic = "force-dynamic";

function BoolCard({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full bg-accent/10 text-accent border border-accent/20">
      <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="2 7 5.5 10.5 12 3.5" />
      </svg>
      {label}
    </span>
  );
}

function getMeta(artist: Artist) {
  const offerings = [
    { label: "Originals", yes: artist.offersOriginals },
    { label: "Prints", yes: artist.offersPrints },
    { label: "Framed", yes: artist.offersFramed },
  ].filter((o) => o.yes);
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
  const bannerSrc =
    artist.bannerImage || artist.works[0]?.image || artist.image;
  return { offerings, terms, bannerSrc };
}

export default async function ProfileDesignsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artist = await getArtistBySlug(slug);
  if (!artist) notFound();

  return (
    <div className="bg-stone-100 min-h-screen pb-24">
      {/* Top bar */}
      <div className="sticky top-14 lg:top-16 z-40 bg-stone-900 text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-serif text-base">Profile design preview</span>
          <span className="text-white/50 text-xs">·</span>
          <span className="text-white/70 text-xs">{artist.name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link
            href={`/browse/${artist.slug}`}
            className="text-white/70 hover:text-white"
          >
            View live profile →
          </Link>
        </div>
      </div>

      {/* Anchor nav */}
      <div className="bg-white border-b border-border">
        <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center gap-5 text-xs">
          <span className="text-muted">Jump to:</span>
          <a href="#variant-a" className="text-foreground hover:text-accent">A, No banner</a>
          <a href="#variant-b" className="text-foreground hover:text-accent">B, Slim banner</a>
          <a href="#variant-c" className="text-foreground hover:text-accent">C, Glass card</a>
          <a href="#variant-d" className="text-foreground hover:text-accent">D, Magazine split</a>
        </div>
      </div>

      <VariantSection id="variant-a" label="A, No banner" notes="Gallery-website feel: no hero image at all. The artist's first work hits the page first when they scroll. Profile photo is the centrepiece. Cleanest, most timeless option.">
        <VariantA artist={artist} />
      </VariantSection>

      <VariantSection id="variant-b" label="B, Slim banner with overlap" notes="A short, tasteful banner strip that the profile circle breaks across, banner is wallpaper, not the centrepiece. Identity stays the focus.">
        <VariantB artist={artist} />
      </VariantSection>

      <VariantSection id="variant-c" label="C, Glass card over banner" notes="Banner stays full-bleed but a blurred translucent card sits over it carrying the identity block. Modern, hotel-website feel.">
        <VariantC artist={artist} />
      </VariantSection>

      <VariantSection id="variant-d" label="D, Magazine split" notes="Banner image and identity sit side-by-side on desktop (banner left, identity right). Very editorial; reads like a magazine spread.">
        <VariantD artist={artist} />
      </VariantSection>
    </div>
  );
}

// ── Variant scaffolding ────────────────────────────────────────────────

function VariantSection({
  id,
  label,
  notes,
  children,
}: {
  id: string;
  label: string;
  notes: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-b-8 border-stone-200">
      <div className="bg-stone-50 border-y border-stone-200 px-6 py-4">
        <div className="max-w-[1200px] mx-auto">
          <h2 className="font-serif text-xl text-foreground">{label}</h2>
          <p className="text-xs text-muted mt-1 max-w-2xl">{notes}</p>
        </div>
      </div>
      <div className="bg-background">{children}</div>
    </section>
  );
}

// ── Variant A: No banner ───────────────────────────────────────────────

function VariantA({ artist }: { artist: Artist }) {
  const { offerings, terms } = getMeta(artist);
  return (
    <div className="pt-12 pb-16">
      <div className="max-w-[1200px] mx-auto px-6">
        <Link
          href="/browse"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground mb-8"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11L5 7l4-4" />
          </svg>
          Back to Marketplace
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-10 lg:gap-14 items-start">
          {/* LEFT, square photo */}
          <div>
            <div className="relative aspect-square w-full max-w-[280px] rounded-sm overflow-hidden bg-stone-100 border border-border">
              <Image
                src={artist.image || `https://picsum.photos/seed/${artist.slug}/600/600`}
                alt={artist.name}
                fill
                className="object-cover"
                sizes="280px"
              />
            </div>
            {artist.instagram && (
              <a
                href={`https://instagram.com/${artist.instagram.replace("@", "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors mt-3"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
                {artist.instagram}
              </a>
            )}
          </div>

          {/* RIGHT, identity */}
          <div>
            <p className="text-[11px] text-muted uppercase tracking-[0.18em] mb-3">
              {disciplineLabel(artist.primaryMedium, artist.discipline)}
            </p>
            <h1 className="font-serif text-4xl lg:text-5xl text-foreground leading-tight tracking-tight mb-2">
              {artist.name}
            </h1>
            <p className="text-muted text-sm mb-6">{artist.location}</p>

            {(artist.subStyles && artist.subStyles.length > 0) && (
              <div className="flex flex-wrap gap-1.5 mb-6">
                {artist.subStyles.slice(0, 6).map((s) => (
                  <span key={s} className="inline-block px-2.5 py-1 text-[11px] font-medium text-foreground/70 bg-surface border border-border rounded-full">
                    {formatSubStyleLabel(s)}
                  </span>
                ))}
              </div>
            )}

            <p className="text-foreground/85 leading-relaxed text-[15px] max-w-2xl mb-6">
              {artist.shortBio}
            </p>

            <div className="flex flex-wrap gap-2 mb-8">
              <MessageArtistButton artistSlug={artist.slug} artistName={artist.name} variant="accent" size="md" />
              <PlacementButton artistSlug={artist.slug} artistName={artist.name} />
            </div>

            {/* Inline facts row, no card */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 pt-6 border-t border-border max-w-2xl">
              <Fact label="Location" value={artist.location} />
              <Fact label="Delivery" value={artist.deliveryRadius} />
              <Fact label="Suited for" value={artist.venueTypesSuitedFor.slice(0, 3).join(", ") || "Any venue"} />
            </div>

            {(offerings.length > 0 || terms.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6 mt-6 border-t border-border max-w-2xl">
                {offerings.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Sells</p>
                    <div className="flex flex-wrap gap-1.5">
                      {offerings.map((o) => <BoolCard key={o.label} label={o.label} />)}
                    </div>
                  </div>
                )}
                {terms.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Terms</p>
                    <div className="flex flex-wrap gap-1.5">
                      {terms.map((t) => <BoolCard key={t.label} label={t.label} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Variant B: Slim banner with overlap ───────────────────────────────

function VariantB({ artist }: { artist: Artist }) {
  const { offerings, terms, bannerSrc } = getMeta(artist);
  return (
    <div>
      {/* Banner, short strip */}
      <div className="relative h-44 lg:h-56 overflow-hidden">
        <Image
          src={bannerSrc}
          alt=""
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
        <div className="absolute top-4 left-0 right-0">
          <div className="max-w-[1200px] mx-auto px-6">
            <Link href="/browse" className="text-xs text-white/80 hover:text-white">
              ← Back to Marketplace
            </Link>
          </div>
        </div>
      </div>

      {/* Identity row, photo overlapping banner edge */}
      <div className="max-w-[1200px] mx-auto px-6 -mt-14 lg:-mt-16 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 lg:gap-14 items-start">
          <div className="min-w-0">
            <div className="relative w-28 h-28 lg:w-32 lg:h-32 rounded-full overflow-hidden bg-stone-200 border-4 border-background shadow-md mb-4">
              <Image
                src={artist.image || `https://picsum.photos/seed/${artist.slug}/400/400`}
                alt={artist.name}
                fill
                className="object-cover"
                sizes="128px"
              />
            </div>
            <h1 className="font-serif text-3xl lg:text-4xl text-foreground leading-tight mb-1">
              {artist.name}
            </h1>
            <p className="text-muted text-sm mb-1">
              {disciplineLabel(artist.primaryMedium, artist.discipline)} · {artist.location}
            </p>
            {(artist.subStyles && artist.subStyles.length > 0) && (
              <div className="flex flex-wrap gap-1.5 mt-3 mb-5">
                {artist.subStyles.slice(0, 6).map((s) => (
                  <span key={s} className="inline-block px-2.5 py-0.5 text-[11px] text-muted bg-surface border border-border rounded-full">
                    {formatSubStyleLabel(s)}
                  </span>
                ))}
              </div>
            )}
            <p className="text-foreground/85 leading-relaxed max-w-2xl text-base mb-5">
              {artist.shortBio}
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-5">
              {artist.styleTags.slice(0, 5).map((tag) => (
                <span key={tag} className="text-[11px] text-muted">
                  {formatSubStyleLabel(tag)}
                </span>
              ))}
              {artist.instagram && (
                <a
                  href={`https://instagram.com/${artist.instagram.replace("@", "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
                  {artist.instagram}
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <MessageArtistButton artistSlug={artist.slug} artistName={artist.name} variant="accent" size="md" />
              <PlacementButton artistSlug={artist.slug} artistName={artist.name} />
            </div>
          </div>

          {/* Right rail, no card chrome, just data with hairlines */}
          <div className="lg:mt-32">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Fact label="Location" value={artist.location} />
              <Fact label="Delivery" value={artist.deliveryRadius} />
              <div className="col-span-2">
                <Fact label="Suited for" value={artist.venueTypesSuitedFor.slice(0, 3).join(", ") || "Any venue type"} />
              </div>
            </div>
            {offerings.length > 0 && (
              <div className="mt-5 pt-5 border-t border-border">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Sells</p>
                <div className="flex flex-wrap gap-1.5">
                  {offerings.map((o) => <BoolCard key={o.label} label={o.label} />)}
                </div>
              </div>
            )}
            {terms.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Terms</p>
                <div className="flex flex-wrap gap-1.5">
                  {terms.map((t) => <BoolCard key={t.label} label={t.label} />)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Variant C: Glass card over banner ─────────────────────────────────

function VariantC({ artist }: { artist: Artist }) {
  const { offerings, terms, bannerSrc } = getMeta(artist);
  return (
    <div>
      <div className="relative h-[520px] overflow-hidden bg-stone-900">
        <Image
          src={bannerSrc}
          alt=""
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/60" />
        <div className="absolute top-4 left-0 right-0">
          <div className="max-w-[1200px] mx-auto px-6">
            <Link href="/browse" className="text-xs text-white/80 hover:text-white">
              ← Back to Marketplace
            </Link>
          </div>
        </div>

        {/* Glass card */}
        <div className="absolute inset-x-0 bottom-0">
          <div className="max-w-[1200px] mx-auto px-6 pb-8">
            <div className="bg-white/90 backdrop-blur-md border border-white/40 rounded-xl shadow-2xl p-6 lg:p-8 max-w-3xl">
              <div className="flex items-start gap-5">
                <div className="relative w-20 h-20 lg:w-24 lg:h-24 rounded-full overflow-hidden bg-stone-200 border-2 border-white shadow-md shrink-0">
                  <Image
                    src={artist.image || `https://picsum.photos/seed/${artist.slug}/400/400`}
                    alt={artist.name}
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted uppercase tracking-[0.18em] mb-1">
                    {disciplineLabel(artist.primaryMedium, artist.discipline)}
                  </p>
                  <h1 className="font-serif text-3xl lg:text-4xl text-foreground leading-tight tracking-tight mb-1">
                    {artist.name}
                  </h1>
                  <p className="text-muted text-sm mb-3">{artist.location}</p>
                  {(artist.subStyles && artist.subStyles.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {artist.subStyles.slice(0, 5).map((s) => (
                        <span key={s} className="inline-block px-2.5 py-0.5 text-[11px] text-foreground/70 bg-white border border-border rounded-full">
                          {formatSubStyleLabel(s)}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-foreground/85 leading-relaxed text-sm line-clamp-3 mb-4">
                    {artist.shortBio}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <MessageArtistButton artistSlug={artist.slug} artistName={artist.name} variant="accent" size="md" />
                    <PlacementButton artistSlug={artist.slug} artistName={artist.name} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Below-banner facts */}
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <Fact label="Location" value={artist.location} />
          <Fact label="Delivery" value={artist.deliveryRadius} />
          <Fact label="Suited for" value={artist.venueTypesSuitedFor.slice(0, 2).join(", ") || "Any venue"} />
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Instagram</p>
            <p className="text-sm font-medium text-foreground">{artist.instagram || "–"}</p>
          </div>
        </div>
        {(offerings.length > 0 || terms.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8 pt-8 border-t border-border">
            {offerings.length > 0 && (
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Sells</p>
                <div className="flex flex-wrap gap-1.5">
                  {offerings.map((o) => <BoolCard key={o.label} label={o.label} />)}
                </div>
              </div>
            )}
            {terms.length > 0 && (
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Terms</p>
                <div className="flex flex-wrap gap-1.5">
                  {terms.map((t) => <BoolCard key={t.label} label={t.label} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Variant D: Magazine split ─────────────────────────────────────────

function VariantD({ artist }: { artist: Artist }) {
  const { offerings, terms, bannerSrc } = getMeta(artist);
  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Image side */}
        <div className="relative h-72 lg:h-[560px] bg-stone-200">
          <Image
            src={bannerSrc}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        </div>

        {/* Text side */}
        <div className="p-8 lg:p-14 bg-background flex flex-col justify-center">
          <Link href="/browse" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground mb-8">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11L5 7l4-4" /></svg>
            Back to Marketplace
          </Link>

          <div className="flex items-center gap-4 mb-5">
            <div className="relative w-16 h-16 rounded-full overflow-hidden bg-stone-200 shrink-0">
              <Image
                src={artist.image || `https://picsum.photos/seed/${artist.slug}/400/400`}
                alt={artist.name}
                fill
                className="object-cover"
                sizes="64px"
              />
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-[0.18em]">
                {disciplineLabel(artist.primaryMedium, artist.discipline)}
              </p>
              <p className="text-muted text-xs mt-0.5">{artist.location}</p>
            </div>
          </div>

          <h1 className="font-serif text-4xl lg:text-5xl text-foreground leading-[1.05] tracking-tight mb-5">
            {artist.name}
          </h1>

          {(artist.subStyles && artist.subStyles.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {artist.subStyles.slice(0, 5).map((s) => (
                <span key={s} className="inline-block px-2.5 py-1 text-[11px] font-medium text-foreground/70 bg-surface border border-border rounded-full">
                  {formatSubStyleLabel(s)}
                </span>
              ))}
            </div>
          )}

          <p className="text-foreground/85 leading-relaxed text-base mb-6 max-w-md">
            {artist.shortBio}
          </p>

          <div className="flex flex-wrap gap-2 mb-8">
            <MessageArtistButton artistSlug={artist.slug} artistName={artist.name} variant="accent" size="md" />
            <PlacementButton artistSlug={artist.slug} artistName={artist.name} />
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-6 border-t border-border max-w-md mb-6">
            <Fact label="Delivery" value={artist.deliveryRadius} />
            <Fact label="Suited for" value={artist.venueTypesSuitedFor.slice(0, 2).join(", ") || "Any venue"} />
          </div>

          {(offerings.length > 0 || terms.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-md">
              {offerings.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Sells</p>
                  <div className="flex flex-wrap gap-1.5">
                    {offerings.map((o) => <BoolCard key={o.label} label={o.label} />)}
                  </div>
                </div>
              )}
              {terms.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Terms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {terms.map((t) => <BoolCard key={t.label} label={t.label} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-medium text-foreground">{value || "–"}</p>
    </div>
  );
}
