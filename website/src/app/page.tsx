"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FeedbackBubble from "@/components/FeedbackBubble";
import ArtistCarousel from "@/components/ArtistCarousel";
import AnimateIn from "@/components/AnimateIn";
import SamplePill from "@/components/SamplePill";
import { useAuth } from "@/context/AuthContext";
import { CURATION_TIERS, PROGRAMME_LADDER, gbp } from "@/lib/curation-tiers";
import { FOUNDING_OFFER_SHORT } from "@/lib/pricing";


interface FeaturedArtist {
  slug: string;
  name: string;
  image: string;
  isSeedArtist?: boolean;
}

export default function Home() {
  const contentRef = useRef<HTMLDivElement>(null);
  const { user, userType } = useAuth();
  const [featured, setFeatured] = useState<FeaturedArtist[]>([]);

  // Launch audit, blocker 1, revised 2 September (owner: "more artist
  // photos"). The grid reads the endpoint /browse uses, which lists real
  // approved artists before the seed. Production has only a couple of real
  // artists with a profile photo, so seed artists fill the remaining tiles,
  // each carrying the Sample pill so nothing here passes a fictional artist
  // off as real. Empty until the fetch lands; hidden if there is nothing.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/browse-artists")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { artists?: FeaturedArtist[] } | null) => {
        if (cancelled || !data || !Array.isArray(data.artists)) return;
        setFeatured(data.artists.filter((a) => a.slug && a.name && a.image).slice(0, 6));
      })
      .catch(() => {
        /* No tiles is the honest fallback. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const portalBase = userType === "venue" ? "/venue-portal" : userType === "customer" ? "/customer-portal" : "/artist-portal";
  const portalLabel = userType === "venue" ? "Venue Portal" : userType === "customer" ? "Customer Portal" : "Artist Portal";

  function scrollToContent() {
    contentRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="relative">
      {/* A5: `/` lives outside the (pages) group and so renders its own shell.
          It was missing two things that layout provides everywhere else:
          the skip link and the feedback bubble. The busiest page on the
          site was the only one a keyboard user could not skip the nav on. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-sm focus:text-sm"
      >
        Skip to content
      </a>
      {/* Shared site Header, immersive mode on "/" keeps it transparent
          over the hero and fades to solid on scroll, matching the rest
          of the site so the logged-in nav (Marketplace / Spaces / More)
          and message / notification indicators are always available. */}
      <Header />

      <main id="main-content">
      {/* ─── HERO ─── full screen with transparent nav.
           Mobile is min-h-[110vh] so the background image extends ~10vh
           below the fold (matches the original design). The trust bar
           wrapper carries mb-[10vh] to keep its scroll-down button at
           the bottom of the visible viewport while the photo continues
           below. Together they preserve the banner length without
           shrinking the image. */}
      <section className="relative min-h-[110vh] sm:min-h-screen flex flex-col">
        {/* Hero background image – scoped to hero only */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1920&h=1080&fit=crop&crop=center"
            alt="Close-up of textured paint strokes on canvas"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/40" />
        </div>

        {/* Hero content. On mobile we use top padding instead of
            bottom padding so the centered logo + CTAs sit at the true
            vertical centre of the viewport, the previous pb-28 was
            visibly pulling them up into the top third because the
            trust-bar wrapper already takes ~10vh + scroll button at
            the bottom of the section. Desktop unchanged. */}
        <div className="flex-1 flex items-center justify-center px-6 lg:px-10 pt-12 pb-0 sm:pt-0 sm:pb-32">
          <div className="max-w-[1400px] mx-auto w-full">
            <div className="max-w-2xl mx-auto text-center sm:relative">
              <h1 className="font-serif text-[2.6rem] sm:text-5xl md:text-[4.5rem] lg:text-[5.5rem] leading-[0.9] tracking-[-0.02em] text-white mt-6 sm:mt-10 mb-7 sm:mb-6">
                WALLPLACE
              </h1>
              <p className="text-lg sm:text-xl lg:text-2xl text-white/90 font-light leading-snug mb-6 sm:mb-3">
                Original art, seen on real walls.
              </p>
              <p className="text-sm sm:text-base lg:text-lg text-white/50 leading-relaxed mb-14 sm:mb-10 max-w-lg mx-auto">
                Buyers take original art home. Venues source it risk-free.
                Artists get seen and get paid.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-sm sm:max-w-none mx-auto">
                <Link
                  href="/browse"
                  className="inline-flex items-center justify-center w-full sm:w-auto sm:min-w-[180px] px-8 py-3 sm:py-4 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors"
                >
                  Discover Art
                </Link>
                <Link
                  href={user ? portalBase : "/signup"}
                  className="inline-flex items-center justify-center w-full sm:w-auto sm:min-w-[180px] px-8 py-3 sm:py-4 bg-white text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-white/90 transition-colors"
                >
                  {user ? portalLabel : "Sign Up"}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator + trust bar, pulled up on mobile so the
            scroll-down chevron stays above the fold while the section
            continues to 110vh and the background photo extends below.
            On sm+ the trust bar sits at the natural bottom of the
            normal-height (100vh) hero. */}
        <div className="relative z-10 mt-auto mb-[14vh] sm:mb-0">
          {/* Scroll to see more */}
          <button
            onClick={scrollToContent}
            className="w-full flex flex-col items-center gap-2 py-4 text-white/50 hover:text-white transition-colors duration-300 cursor-pointer"
          >
            <span className="text-xs tracking-[0.2em] uppercase font-medium">Scroll to see more</span>
            <div className="w-8 h-8 rounded-full border border-white/25 flex items-center justify-center animate-bounce">
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7l5 5 5-5" />
              </svg>
            </div>
          </button>
          {/* Dark trust bar, hidden on mobile */}
          <div className="hidden sm:block border-t border-white/10 bg-black/50 backdrop-blur-sm">
            <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-accent">Founding artist offer</span>
                <span className="w-1 h-1 rounded-full bg-white/30" />
                <span className="text-white/80">{FOUNDING_OFFER_SHORT}</span>
                <Link href="/apply" className="text-white/60 hover:text-white underline underline-offset-4 decoration-white/30">
                  Apply
                </Link>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-xs text-white/40 tracking-widest uppercase">
                <span>No AI art</span>
                <span className="w-1 h-1 rounded-full bg-white/30" />
                <span>Every artist reviewed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CONTENT SECTIONS ─── */}
      <div ref={contentRef} className="bg-background">

          {/* ─── FOR ARTISTS ─── */}
          <section className="py-12 lg:py-28">
            <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
              <AnimateIn>
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div className={`order-2 lg:order-1 grid grid-cols-3 gap-1.5 sm:gap-2 ${featured.length === 0 ? "hidden" : ""}`}>
                  {featured.map((a) => (
                    <Link key={a.slug} href={`/browse/${a.slug}`} className="aspect-[4/5] relative rounded-sm overflow-hidden group">
                      <Image src={a.image} alt={a.name} fill className="object-cover group-hover:scale-[1.03] transition-transform duration-500" sizes="(max-width: 640px) 33vw, 12vw" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                      {a.isSeedArtist && <SamplePill className="absolute top-1.5 left-1.5" />}
                      <p className="absolute bottom-2 left-2 text-white text-xs font-medium">{a.name}</p>
                    </Link>
                  ))}
                </div>

                {/* Pinned to column 2 so the copy does not jump when the tile grid
                    (hidden until the featured fetch lands, and hidden for good if the
                    catalogue is empty) enters or leaves the grid. */}
                <div className="order-1 lg:order-2 lg:col-start-2">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">
                    For Artists
                  </p>
                  <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mb-6 leading-tight">
                    Your art, in the spaces people love.
                  </h2>
                  <p className="text-lg text-muted leading-relaxed mb-8">
                    Showcase, get discovered, and sell, all in one place.
                    Your Wallplace profile is your portfolio, your storefront,
                    and your route into the best commercial venues.
                  </p>

                  <ul className="space-y-3 mb-10">
                    <BulletPoint text="Get displayed in cafés, restaurants, hotels, and offices" />
                    <BulletPoint text="Sell directly online, every QR scan leads to your store" />
                    <BulletPoint text="Flat 15% platform fee. No gallery taking 50%." />
                  </ul>

                  <p className="text-sm font-medium text-accent mb-6">{FOUNDING_OFFER_SHORT}. Places confirmed at acceptance.</p>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <Link href="/apply" className="inline-flex items-center justify-center px-5 sm:px-7 py-3 sm:py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                      Apply to Join
                    </Link>
                    <Link href="/how-it-works?tab=artist" className="inline-flex items-center justify-center px-5 sm:px-7 py-3 sm:py-3.5 border border-border text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-background transition-colors">
                      LEARN MORE
                    </Link>
                  </div>
                </div>
              </div>
              </AnimateIn>
            </div>
          </section>

          {/* ─── FOR VENUES ─── */}
          <section className="py-12 lg:py-28 bg-surface border-b border-border">
            <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
              <AnimateIn>
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div>
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">
                    For Venues
                  </p>
                  <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mb-6 leading-tight">
                    Earn from your empty walls. Zero risk.
                  </h2>
                  <p className="text-lg text-muted leading-relaxed mb-8">
                    Browse curated portfolios and source original artwork for
                    your caf&eacute;, restaurant, hotel, office, or bar.
                    Completely free to browse and enquire.
                  </p>

                  {/* Three core ways venues can get art. Single warm-
                      tinted container with hairline dividers between
                      rows, gives the items a card presence so they're
                      visually distinct from the white section, but
                      lighter than three individually bordered boxes
                      (which read as the loudest thing on the section). */}
                  <ul className="mb-8 sm:mb-10 bg-background rounded-md divide-y divide-border/60">
                    <li className="flex gap-4 px-5 py-4">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 text-accent shrink-0">
                        <rect x="5" y="5" width="14" height="14" rx="1.5" /><path d="M9 9h.01M14 9h.01M9 14h.01M14 14h.01" />
                      </svg>
                      <div>
                        <p className="text-base font-medium text-foreground leading-snug">Revenue Share</p>
                        <p className="text-sm text-muted leading-relaxed mt-0.5">Free to display. Earn a share when a QR scan sells the work.</p>
                      </div>
                    </li>
                    <li className="flex gap-4 px-5 py-4">
                      <span className="mt-0.5 w-5 h-5 flex items-center justify-center text-accent shrink-0">
                        <span className="text-lg font-serif font-medium leading-none">&pound;</span>
                      </span>
                      <div>
                        <p className="text-base font-medium text-foreground leading-snug">Paid Loan</p>
                        <p className="text-sm text-muted leading-relaxed mt-0.5">Pay one artist a monthly fee to keep one piece on your wall.</p>
                      </div>
                    </li>
                    <li className="flex gap-4 px-5 py-4">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 text-accent shrink-0">
                        <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20" />
                      </svg>
                      <div>
                        <p className="text-base font-medium text-foreground leading-snug">Direct Purchase</p>
                        <p className="text-sm text-muted leading-relaxed mt-0.5">Buy pieces outright for your permanent collection.</p>
                      </div>
                    </li>
                  </ul>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <Link href="/browse" className="inline-flex items-center justify-center px-5 sm:px-7 py-3 sm:py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                      Discover Art
                    </Link>
                    <Link href="/signup/venue" className="inline-flex items-center justify-center px-5 sm:px-7 py-3 sm:py-3.5 border border-border text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-background transition-colors">
                      REGISTER YOUR VENUE
                    </Link>
                  </div>
                  <p className="mt-5 text-sm text-muted">
                    Want it handled for you?{" "}
                    <Link href="/programmes" className="text-accent hover:underline font-medium">
                      See Wallplace Programmes &rarr;
                    </Link>
                  </p>
                </div>

                <div className="hidden sm:grid grid-cols-5 grid-rows-4 gap-2 aspect-square">
                  <div className="col-span-3 row-span-2 relative rounded-sm overflow-hidden">
                    <Image src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&h=400&fit=crop" alt="Moody urban street photography" fill className="object-cover" sizes="25vw" />
                  </div>
                  <div className="col-span-2 row-span-1 relative rounded-sm overflow-hidden">
                    <Image src="https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=400&h=400&fit=crop" alt="Misty forest landscape" fill className="object-cover" sizes="15vw" />
                  </div>
                  <div className="col-span-2 row-span-1 relative rounded-sm overflow-hidden">
                    <Image src="https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=400&h=200&fit=crop" alt="Vintage film camera" fill className="object-cover" sizes="15vw" />
                  </div>
                  <div className="col-span-2 row-span-2 relative rounded-sm overflow-hidden">
                    <Image src="https://images.unsplash.com/photo-1484406566174-9da000fda645?w=400&h=400&fit=crop" alt="Deer in misty woodland" fill className="object-cover" sizes="15vw" />
                  </div>
                  <div className="col-span-3 row-span-2 relative rounded-sm overflow-hidden">
                    <Image src="https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&h=400&fit=crop" alt="Mountain landscape at night" fill className="object-cover" sizes="25vw" />
                  </div>
                </div>
              </div>
              </AnimateIn>
            </div>
          </section>

          {/* ─── PROGRAMMES ─── */}
          <section className="py-16 lg:py-24 bg-surface border-y border-border">
            <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
              <AnimateIn>
              <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
                <div className="lg:col-span-7">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">Wallplace Programmes</p>
                  <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mb-6 leading-tight">
                    Walls handled for you, from {gbp(CURATION_TIERS.programme.priceGbp)} a month.
                  </h2>
                  <p className="text-lg text-muted leading-relaxed mb-8">
                    For offices, hotels and restaurants that want the art dealt with.
                    We curate, install and rotate original work through the year,
                    and every artist on your walls is paid rent out of your fee.
                    Quoted per site, twelve-month term.
                  </p>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <Link href="/programmes" className="inline-flex items-center justify-center px-5 sm:px-7 py-3 sm:py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                      See Programmes
                    </Link>
                    <Link href="/curated" className="inline-flex items-center justify-center px-5 sm:px-7 py-3 sm:py-3.5 border border-border text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-foreground hover:text-white transition-colors">
                      One-off shortlist from {gbp(CURATION_TIERS.single_wall.priceGbp)}
                    </Link>
                  </div>
                </div>
                <div className="lg:col-span-5">
                  <ul className="bg-background rounded-md divide-y divide-border/60">
                    {PROGRAMME_LADDER.map((rung) => (
                      <li key={rung.pieces} className="flex items-baseline justify-between px-5 py-4">
                        <span className="text-sm text-foreground">{rung.pieces} pieces</span>
                        <span className="font-serif text-lg text-foreground">
                          {gbp(rung.monthlyGbp)}
                          <span className="text-xs text-muted font-sans"> a month</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted mt-3">
                    A guide to how pricing scales. Every site is quoted individually. Prices exclusive of VAT.
                  </p>
                </div>
              </div>
              </AnimateIn>
            </div>
          </section>

          {/* ─── HOW IT WORKS ─── */}
          <section className="py-20 lg:py-28 bg-foreground">
            <div className="max-w-[1100px] mx-auto px-6 lg:px-10">
              <AnimateIn>
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-white text-center mb-16">
                How Wallplace works
              </h2>
              <div className="grid md:grid-cols-3 gap-14 lg:gap-20">
                <div className="flex flex-col">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent border-b border-white/10 pb-4 mb-8">For Venues</p>
                  <div className="space-y-9 flex-1">
                    <Step dark number="01" title="Browse &amp; Filter" description="Search curated artists by style, theme, and location. Free." />
                    <Step dark number="02" title="Enquire" description="Contact artists directly. Discuss terms and fit." />
                    <Step dark number="03" title="Arrange" description="Display for free with optional revenue share, pay a monthly loan fee for one piece, or have the whole space handled on a Programme." />
                  </div>
                  <div className="mt-10">
                    <Link href="/signup/venue" className="inline-flex w-full max-w-[280px] items-center justify-center px-7 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                      Register Your Venue
                    </Link>
                  </div>
                </div>
                <div className="flex flex-col">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent border-b border-white/10 pb-4 mb-8">For Artists</p>
                  <div className="space-y-9 flex-1">
                    <Step dark number="01" title="Apply" description="Submit your portfolio. We respond within 5 business days." />
                    <Step dark number="02" title="Get Accepted" description={`Pass our curation review. ${FOUNDING_OFFER_SHORT}.`} />
                    <Step dark number="03" title="Get Discovered" description="Your profile goes live. Venues enquire directly." />
                  </div>
                  <div className="mt-10">
                    <Link href="/apply" className="inline-flex w-full max-w-[280px] items-center justify-center px-7 py-3.5 bg-white text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-white/90 transition-colors">
                      Apply to Join
                    </Link>
                  </div>
                </div>
                <div className="flex flex-col">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent border-b border-white/10 pb-4 mb-8">For Customers</p>
                  <div className="space-y-9 flex-1">
                    <Step dark number="01" title="Browse" description="Explore original work from independent artists, online or on a wall near you." />
                    <Step dark number="02" title="Buy" description="Scan the QR card beside the piece, or buy from the artist&rsquo;s page. Originals and prints." />
                    <Step dark number="03" title="Receive" description="Delivered to your door, or collect it from the venue where it hangs." />
                  </div>
                  <div className="mt-10">
                    <Link href="/browse" className="inline-flex w-full max-w-[280px] items-center justify-center px-7 py-3.5 border border-white/30 text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-white hover:text-foreground transition-colors">
                      Discover Art
                    </Link>
                  </div>
                </div>
              </div>
              </AnimateIn>
            </div>
          </section>


          {/* Testimonials removed pre-launch (QA flag A8): the quotes were
              placeholder copy with invented names and sales outcomes, which
              cannot appear as genuine reviews. Reinstate only with real,
              consented quotes. */}

          {/* ─── FINAL CTA ─── */}
          <section className="py-24 lg:py-32">
            <div className="max-w-[1200px] mx-auto px-6 lg:px-10 text-center">
              <AnimateIn>
              <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl text-foreground mb-4">
                Ready to get started?
              </h2>
              <p className="text-muted text-lg mb-12 max-w-lg mx-auto">
                Whether you&rsquo;re looking for art, looking to be discovered, or looking to buy.
              </p>
              <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto items-stretch">
                <div className="bg-surface border border-border rounded-sm p-5 sm:p-8 text-center flex flex-col">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-3">Venues</p>
                  <h3 className="font-serif text-xl mb-3">Source artwork risk-free</h3>
                  <p className="text-sm text-muted mb-6 flex-1">Free to browse and enquire. No contracts.</p>
                  <Link href="/signup/venue" className="inline-flex items-center justify-center w-full px-4 py-3.5 bg-accent text-white text-xs font-semibold tracking-wide uppercase rounded-sm hover:bg-accent-hover transition-colors whitespace-nowrap">
                    Register Your Venue
                  </Link>
                </div>
                <div className="bg-surface border border-border rounded-sm p-5 sm:p-8 text-center flex flex-col">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-3">Artists</p>
                  <h3 className="font-serif text-xl mb-3">Get discovered by venues</h3>
                  <p className="text-sm text-muted mb-6 flex-1">{FOUNDING_OFFER_SHORT}. From &pound;9.99/month.</p>
                  <Link href="/apply" className="inline-flex items-center justify-center w-full px-4 py-3.5 bg-foreground text-white text-xs font-semibold tracking-wide uppercase rounded-sm hover:bg-foreground/90 transition-colors whitespace-nowrap">
                    Apply to Join
                  </Link>
                </div>
                <div className="bg-surface border border-border rounded-sm p-5 sm:p-8 text-center flex flex-col">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-3">Customers</p>
                  <h3 className="font-serif text-xl mb-3">Buy original artwork</h3>
                  <p className="text-sm text-muted mb-6 flex-1">Browse and buy directly from independent artists.</p>
                  <Link href="/signup/customer" className="inline-flex items-center justify-center w-full px-4 py-3.5 bg-[#F5F3F0] border border-border text-foreground text-xs font-semibold tracking-wide uppercase rounded-sm hover:bg-[#EBE8E4] transition-colors whitespace-nowrap">
                    Sign Up
                  </Link>
                </div>
              </div>
              </AnimateIn>
            </div>
          </section>

          {/* ─── CURATED BANNER ─── */}
          <section className="relative h-56 lg:h-72 overflow-hidden">
            <Image src="https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=1920&h=400&fit=crop&crop=center" alt="Art being created" fill className="object-cover" />
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative h-full flex items-center justify-center text-center px-6">
              <div>
                <p className="text-white text-2xl lg:text-3xl font-serif mb-2">Curated, not crowded.</p>
                <p className="text-white/50 text-sm">Every artist personally reviewed. No AI art.</p>
              </div>
            </div>
          </section>

      </div>
      </main>

      <Footer />
      <FeedbackBubble />
    </div>
  );
}

/* ─── Sub-components ─── */

function NavCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 p-6 bg-surface border border-border rounded-sm hover:border-accent/40 hover:shadow-sm transition-all duration-300"
    >
      <div className="text-accent shrink-0 mt-0.5">{icon}</div>
      <div>
        <h3 className="font-medium text-foreground text-base mb-1 group-hover:text-accent transition-colors">
          {title}
        </h3>
        <p className="text-sm text-muted leading-relaxed">{description}</p>
      </div>
    </Link>
  );
}

function DealCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-4 rounded-sm border border-border bg-background hover:border-accent hover:bg-accent/5 transition-colors duration-200 group">
      <p className="text-sm font-semibold mb-1 text-foreground group-hover:text-accent transition-colors duration-200">
        {title}
      </p>
      <p className="text-xs text-muted leading-relaxed">{description}</p>
    </div>
  );
}

function BulletPoint({ text, dark }: { text: string; dark?: boolean }) {
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
      <span className={`${dark ? "text-white/80" : "text-foreground/80"} leading-relaxed`}>{text}</span>
    </li>
  );
}

function Step({
  number,
  title,
  description,
  dark,
}: {
  number: string;
  title: string;
  description: string;
  dark?: boolean;
}) {
  return (
    <div className="flex gap-5">
      <span className="flex-shrink-0 text-xs font-medium tracking-widest text-accent mt-1">
        {number}
      </span>
      <div>
        <p className={`font-serif text-lg ${dark ? "text-white" : "text-foreground"}`}>{title}</p>
        <p className={`mt-1.5 text-sm ${dark ? "text-white/50" : "text-muted"} leading-relaxed`}>
          {description}
        </p>
      </div>
    </div>
  );
}

function ValueBlock({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="font-serif text-2xl text-foreground">{title}</h3>
      <p className="mt-3 text-muted leading-relaxed">{description}</p>
    </div>
  );
}
