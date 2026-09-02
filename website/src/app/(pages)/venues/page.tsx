import { Metadata } from "next";
import VenueArtistToggle from "@/components/VenueArtistToggle";
import Image from "next/image";
import Link from "next/link";
import ScrollButton from "@/components/ScrollButton";
import VenueGuide from "@/components/marketing/VenueGuide";
import { CURATION_TIERS, gbp } from "@/lib/curation-tiers";

export const metadata: Metadata = {
  title: "For Venues",
  description:
    "Discover original artwork for your space. Browse curated artist portfolios, filter by style and location, and enquire directly. Free for independent venues.",
};

export default function VenuesPage() {
  return (
    <div className="relative">
      <VenueArtistToggle />
      {/* Immersive Hero, pulls behind the header with negative margin */}
      <section className="relative -mt-14 lg:-mt-16 min-h-screen flex flex-col pt-28 lg:pt-32">
        {/* Hero background image */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1572947650440-e8a97ef053b2?w=1920&h=1080&fit=crop&crop=center"
            alt="Art displayed on venue walls"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/65 via-black/50 to-black/35" />
        </div>
        <div className="flex-1 flex items-center pb-24 lg:pb-28">
          <div className="max-w-[1200px] mx-auto px-6 w-full">
            <div className="max-w-2xl">
              <p className="text-xs font-medium tracking-[0.25em] uppercase text-accent mb-5">
                For Venues
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-tight text-white leading-[1.05] mb-6">
                Display curated art for free. Earn when it sells.
              </h1>
              <p className="text-lg lg:text-xl text-white/60 leading-relaxed max-w-xl mb-10">
                Browse portfolios from independent artists. Pick what fits your space.
                Art goes on your wall at zero cost, and if a visitor buys via the QR label, you earn a share.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Link href="/browse" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors">
                  DISCOVER ART
                </Link>
                <Link href="/signup/venue" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-white text-foreground rounded-sm hover:bg-white/90 transition-colors">
                  REGISTER YOUR VENUE
                </Link>
              </div>
              <p className="mt-6 text-sm text-white/60">
                Want your walls handled for you?{" "}
                <Link href="/programmes" className="text-white underline underline-offset-2 hover:text-white/80">
                  See Wallplace Programmes
                </Link>
                , from {gbp(CURATION_TIERS.programme.priceGbp)} a month.
              </p>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="relative z-10 mt-auto py-3 flex justify-center">
          <ScrollButton targetId="venue-content" label="See what you get" inline />
        </div>
      </section>

      {/* Body — sections share with /how-it-works's For Venues panel. */}
      <div id="venue-content">
        <VenueGuide />

        {/* Second fork, for the visitor who wants art handled rather
            than browsed. Sits below VenueGuide's own final CTA so the
            free pitch reads first, in full, unweakened, this is a
            secondary path, not a replacement for it. Price is quoted
            per site; the from-anchor is derived from
            CURATION_TIERS.programme.priceGbp via gbp(), the single
            source pinned by
            tests/integration/one-curated-price-source.test.ts, never a
            hand-typed pound figure. */}
        <section className="py-20 lg:py-28 bg-surface border-t border-border">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="max-w-2xl mx-auto text-center">
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">
                Prefer it handled?
              </p>
              <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-5 leading-tight">
                Or let Wallplace run your walls for you
              </h2>
              <p className="text-muted leading-relaxed text-lg mb-8">
                Wallplace Programmes is a quoted monthly service for spaces
                that want it handled end to end: curation, installation, and
                rotation through the year, arranged for you rather than
                browsed and enquired about one piece at a time. Every artist
                on your wall is paid rent for as long as their work is up.
                Quoted per site, from {gbp(CURATION_TIERS.programme.priceGbp)} a month.
              </p>
              <Link
                href="/programmes"
                className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-foreground text-white rounded-sm hover:bg-foreground/90 transition-colors"
              >
                EXPLORE WALLPLACE PROGRAMMES
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
