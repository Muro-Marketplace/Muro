import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { artists } from "@/data/artists";
import { venues } from "@/data/venues";
import { DEMO_ARTIST_SLUG, DEMO_VENUE_SLUG } from "@/data/demo";

export const metadata: Metadata = {
  title: "Tour Wallplace, Demo Artist & Venue Accounts",
  description:
    "See Wallplace from the inside. Explore a fully built demo artist account and a fully built demo venue account before you sign up.",
};

/**
 * /demo, secondary funnel for visitors who want to see the platform
 * before committing. Two cards, each pointing into the relevant
 * experience for the demo account.
 *
 * Two-stage routing:
 *   1. Phase 2 (sandboxed portal tour configured): button links to
 *      `/api/demo/login?role=...&next=...` which signs the visitor in
 *      as the read-only demo user and redirects into the relevant
 *      portal landing page.
 *   2. Phase 1 fallback (no demo creds set): button links to the
 *      public artist / venue profile page. The /api/demo/login
 *      endpoint returns 503 in that mode so even a misconfigured
 *      browser can't get stuck.
 *
 * Both buttons render the Phase 2 URL, the login endpoint
 * gracefully degrades to the public profile if creds aren't set, via
 * server-side guard. We can't conditionally render server-only logic
 * here (this is an RSC), so the URL stays consistent.
 */
export default function DemoLandingPage() {
  const demoArtist = artists.find((a) => a.slug === DEMO_ARTIST_SLUG) || artists[0];
  const demoVenue = venues.find((v) => v.slug === DEMO_VENUE_SLUG) || venues[0];

  // Decide whether the Phase 2 portal-tour login is available. When
  // it is, buttons hit the login endpoint; otherwise they fall back
  // to the public profile pages (Phase 1 behaviour).
  const portalTourEnabled = Boolean(
    process.env.DEMO_ARTIST_EMAIL && process.env.DEMO_VENUE_EMAIL,
  );
  const artistHref = portalTourEnabled
    ? `/api/demo/login?role=artist`
    : `/browse/${demoArtist.slug}`;
  const venueHref = portalTourEnabled
    ? `/api/demo/login?role=venue`
    : `/venues/${demoVenue.slug}`;

  return (
    <div className="bg-background min-h-screen">
      {/* Hero */}
      <section className="relative px-6 lg:px-10 pt-12 sm:pt-20 pb-10 sm:pb-14 border-b border-border bg-surface">
        <div className="max-w-[1100px] mx-auto text-center">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">
            See it from the inside
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] leading-[1.05] text-foreground mb-5">
            Tour Wallplace before you sign up.
          </h1>
          <p className="text-base sm:text-lg text-muted leading-relaxed max-w-2xl mx-auto">
            Two fully-built sample accounts, one artist, one venue, that show
            what a successful Wallplace presence looks like. Real portfolios,
            real terms, real venue pages. No account needed.
          </p>
        </div>
      </section>

      {/* Two demo cards */}
      <section className="px-6 lg:px-10 py-12 sm:py-16">
        <div className="max-w-[1100px] mx-auto grid md:grid-cols-2 gap-5 sm:gap-7">
          {/* Demo artist */}
          <Link
            href={artistHref}
            prefetch={false}
            className="group block bg-surface border border-border rounded-sm overflow-hidden hover:border-accent/50 hover:shadow-sm transition-all"
          >
            <div className="aspect-[5/4] relative overflow-hidden bg-border/20">
              <Image
                src={demoArtist.image}
                alt={demoArtist.name}
                fill
                className="object-cover group-hover:scale-[1.02] transition-transform duration-700"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm text-[10px] font-semibold tracking-wider uppercase text-foreground shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                Demo Artist
              </div>
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-white font-serif text-xl sm:text-2xl leading-tight">
                  {demoArtist.name}
                </p>
                <p className="text-white/80 text-xs mt-0.5">
                  {demoArtist.location}
                </p>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-2">
                Artist experience
              </p>
              <h2 className="font-serif text-lg sm:text-xl text-foreground mb-2">
                What a successful artist account looks like
              </h2>
              <p className="text-sm text-muted leading-relaxed mb-5">
                Polished profile, full portfolio, commercial terms set up the way
                venues respond to. Exactly the view a venue sees when they&rsquo;re
                shopping the marketplace.
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent group-hover:gap-2.5 transition-all">
                Tour the artist account
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </span>
            </div>
          </Link>

          {/* Demo venue */}
          <Link
            href={venueHref}
            prefetch={false}
            className="group block bg-surface border border-border rounded-sm overflow-hidden hover:border-accent/50 hover:shadow-sm transition-all"
          >
            <div className="aspect-[5/4] relative overflow-hidden bg-border/20">
              <Image
                src={demoVenue.image}
                alt={demoVenue.name}
                fill
                className="object-cover group-hover:scale-[1.02] transition-transform duration-700"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm text-[10px] font-semibold tracking-wider uppercase text-foreground shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                Demo Venue
              </div>
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-white font-serif text-xl sm:text-2xl leading-tight">
                  {demoVenue.name}
                </p>
                <p className="text-white/80 text-xs mt-0.5">
                  {demoVenue.location}
                </p>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-2">
                Venue experience
              </p>
              <h2 className="font-serif text-lg sm:text-xl text-foreground mb-2">
                What a successful venue page looks like
              </h2>
              <p className="text-sm text-muted leading-relaxed mb-5">
                Real venue images, available walls, the way artists discover spaces
                worth showing in. The same surface artists see before they request
                a placement.
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent group-hover:gap-2.5 transition-all">
                Tour the venue account
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </span>
            </div>
          </Link>
        </div>

        {/* What you'll see */}
        <div className="max-w-[1100px] mx-auto mt-14 sm:mt-20">
          <div className="grid md:grid-cols-2 gap-10 sm:gap-14">
            <div>
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">
                Inside the artist tour
              </p>
              <ul className="space-y-3">
                <DemoBullet text="A complete portfolio with multiple bodies of work" />
                <DemoBullet text="Commercial terms, revenue share, paid loan, direct purchase" />
                <DemoBullet text="Real pricing across formats (originals, prints, framed)" />
                <DemoBullet text="The artist statement and bio that wins venue trust" />
                <DemoBullet text="The exact view venues see when shopping the marketplace" />
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">
                Inside the venue tour
              </p>
              <ul className="space-y-3">
                <DemoBullet text="Polished venue profile with real space photography" />
                <DemoBullet text="Available walls open for placement requests" />
                <DemoBullet text="Footfall, vibe and demographic context for artists" />
                <DemoBullet text="The kind of venue page that gets quality requests" />
                <DemoBullet text="The exact view artists see when looking for spaces" />
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 lg:px-10 py-14 sm:py-20 border-t border-border bg-surface">
        <div className="max-w-[800px] mx-auto text-center">
          <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl text-foreground mb-4">
            Ready to build your own?
          </h2>
          <p className="text-muted leading-relaxed mb-8 max-w-lg mx-auto">
            Apply as an artist or register your venue and we&rsquo;ll get you set
            up with a profile that looks every bit as good as the demos above.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-md sm:max-w-none mx-auto">
            <Link
              href="/apply"
              className="inline-flex items-center justify-center w-full sm:w-auto sm:min-w-[180px] px-7 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors"
            >
              Apply as Artist
            </Link>
            <Link
              href="/register-venue"
              className="inline-flex items-center justify-center w-full sm:w-auto sm:min-w-[180px] px-7 py-3.5 bg-foreground text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-foreground/90 transition-colors"
            >
              Register Your Venue
            </Link>
          </div>
          <p className="text-xs text-muted/70 mt-6">
            Already a member?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

function DemoBullet({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-accent shrink-0 mt-0.5"
      >
        <polyline points="4 9 7.5 12.5 14 5.5" />
      </svg>
      <span className="text-sm text-foreground/80 leading-relaxed">{text}</span>
    </li>
  );
}
