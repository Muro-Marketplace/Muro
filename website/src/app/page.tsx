"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Footer from "@/components/Footer";
import ArtistCarousel from "@/components/ArtistCarousel";
import AnimateIn from "@/components/AnimateIn";
import { artists } from "@/data/artists";
import { venues } from "@/data/venues";

const featuredArtists = artists.slice(0, 6);

const navLinks = [
  { label: "Discover Art", href: "/browse" },
  { label: "For Venues", href: "/venues" },
  { label: "For Artists", href: "/artists" },
  { label: "Spaces", href: "/spaces" },
];

export default function Home() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function scrollToContent() {
    contentRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="relative">
      {/* ─── HERO ─── full screen with transparent nav */}
      <section className="relative min-h-screen flex flex-col">
        {/* Hero background image – scoped to hero only */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1920&h=1080&fit=crop&crop=center"
            alt="Gallery interior"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/40" />
        </div>
        {/* Transparent navbar */}
        <header className="relative z-50">
          <div className="flex items-center justify-between px-6 lg:px-10 pt-6 lg:pt-8">
            <Link
              href="/"
              className="font-serif text-2xl lg:text-3xl tracking-tight text-white"
            >
              Wallspace
            </Link>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-7">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-white/90 hover:text-white transition-colors duration-200"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Desktop CTAs */}
            <div className="hidden lg:flex items-center gap-4">
              <Link
                href="/login"
                className="text-sm text-white/90 hover:text-white transition-colors"
              >
                Login
              </Link>
              <Link
                href="/apply"
                className="text-sm px-5 py-2.5 bg-white text-foreground font-medium rounded-sm hover:bg-white/90 transition-colors"
              >
                Apply to Join
              </Link>
            </div>

            {/* Mobile menu toggle */}
            <button
              type="button"
              className="lg:hidden p-2 -mr-2 text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                {mobileMenuOpen ? (
                  <>
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="6" y1="18" x2="18" y2="6" />
                  </>
                ) : (
                  <>
                    <line x1="4" y1="7" x2="20" y2="7" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="17" x2="20" y2="17" />
                  </>
                )}
              </svg>
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden bg-black/80 backdrop-blur-md border-t border-white/10 mt-4">
              <div className="px-6 py-6 space-y-6">
                <nav className="flex flex-col gap-4">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="text-base text-white/70 hover:text-white transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>
                <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
                  <Link
                    href="/login"
                    className="text-center text-sm px-5 py-3 rounded-sm border border-white/20 text-white hover:bg-white/10"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Login
                  </Link>
                  <Link
                    href="/apply"
                    className="text-center text-sm px-5 py-3 rounded-sm bg-white text-foreground font-medium hover:bg-white/90"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Apply to Join
                  </Link>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Hero content */}
        <div className="flex-1 flex items-center px-6 lg:px-10 pb-32">
          <div className="max-w-[1400px] mx-auto w-full">
            <div className="max-w-2xl">
              <h1 className="font-serif text-[clamp(3rem,8vw,6rem)] leading-[0.9] tracking-[-0.02em] text-white mb-6">
                WALLSPACE
              </h1>
              <p className="text-xl lg:text-2xl text-white/90 font-light leading-snug mb-3">
                The curated art marketplace for commercial spaces.
              </p>
              <p className="text-base lg:text-lg text-white/60 leading-relaxed mb-10 max-w-lg">
                Venues source original artwork risk-free. Artists access
                high-intent commercial demand. Every artist reviewed. No
                AI-generated work.
              </p>
              <div className="flex items-center gap-3">
                <Link
                  href="/browse"
                  className="inline-flex items-center justify-center px-8 py-4 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors"
                >
                  Discover Art
                </Link>
                <Link
                  href="/apply"
                  className="inline-flex items-center justify-center px-8 py-4 bg-white text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-white/90 transition-colors"
                >
                  Apply to Join
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator + trust bar – anchored to bottom of hero */}
        <div className="relative z-10 mt-auto">
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
          {/* Dark trust bar */}
          <div className="border-t border-white/10 bg-black/50 backdrop-blur-sm">
            <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-white/60">
                <span className="text-white/90 font-medium">30+ curated artists</span>{" "}
                and growing
              </p>
              <div className="flex items-center gap-4 text-xs text-white/40 tracking-widest uppercase">
                <span>Original work only</span>
                <span className="w-1 h-1 rounded-full bg-white/30" />
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

          {/* ─── FOR VENUES ─── */}
          <section className="py-20 lg:py-28 bg-surface">
            <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
              <AnimateIn>
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div>
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">
                    For Venues
                  </p>
                  <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mb-6 leading-tight">
                    Art for your space. Zero risk.
                  </h2>
                  <p className="text-lg text-muted leading-relaxed mb-8">
                    Browse curated portfolios and source original artwork for
                    your caf&eacute;, restaurant, hotel, office, or bar.
                    Completely free to browse and enquire.
                  </p>

                  <div className="grid grid-cols-3 gap-3 mb-10">
                    <DealCard title="Free Loan" description="Display at no cost. Rotate any time." />
                    <DealCard title="Revenue Share" description="Earn a share if it sells from your wall." />
                    <DealCard title="Purchase" description="Buy outright for your collection." />
                  </div>

                  <div className="flex items-center gap-3">
                    <Link href="/browse" className="inline-flex items-center justify-center px-7 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                      Discover Art
                    </Link>
                    <Link href="/venues" className="inline-flex items-center justify-center px-7 py-3.5 border border-border text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-background transition-colors">
                      Learn More
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-5 grid-rows-4 gap-2 aspect-square">
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

          {/* ─── FOR ARTISTS ─── */}
          <section className="py-20 lg:py-28">
            <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
              <AnimateIn>
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div className="order-2 lg:order-1 grid grid-cols-3 gap-2">
                  {artists.slice(0, 6).map((a) => (
                    <Link key={a.slug} href={`/browse/${a.slug}`} className="aspect-[4/5] relative rounded-sm overflow-hidden group">
                      <Image src={a.image} alt={a.name} fill className="object-cover group-hover:scale-[1.03] transition-transform duration-500" sizes="20vw" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                      <p className="absolute bottom-2 left-2 text-white text-xs font-medium">{a.name}</p>
                    </Link>
                  ))}
                </div>

                <div className="order-1 lg:order-2">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">
                    For Artists
                  </p>
                  <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mb-6 leading-tight">
                    Get discovered by commercial spaces
                  </h2>
                  <p className="text-lg text-muted leading-relaxed mb-8">
                    Wallspace puts your work in front of venues that are
                    actively looking for art. No exclusivity. Keep selling
                    through your own channels.
                  </p>

                  <ul className="space-y-3 mb-10">
                    <BulletPoint text="Free loan, revenue share, or outright purchase arrangements" />
                    <BulletPoint text="0–10% platform fee. No gallery taking 50%." />
                    <BulletPoint text="First month free. First 20 artists get 6 months free." />
                  </ul>

                  <div className="flex items-center gap-3">
                    <Link href="/apply" className="inline-flex items-center justify-center px-7 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                      Apply to Join
                    </Link>
                    <Link href="/pricing" className="inline-flex items-center justify-center px-7 py-3.5 border border-border text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-background transition-colors">
                      View Pricing
                    </Link>
                  </div>
                </div>
              </div>
              </AnimateIn>
            </div>
          </section>

          {/* ─── HOW IT WORKS ─── */}
          <section className="py-20 lg:py-28 bg-foreground">
            <div className="max-w-[1000px] mx-auto px-6 lg:px-10">
              <AnimateIn>
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-white text-center mb-16">
                How Wallspace works
              </h2>
              <div className="grid md:grid-cols-2 gap-16">
                <div className="flex flex-col">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent border-b border-white/10 pb-4 mb-8">For Venues</p>
                  <div className="space-y-8 flex-1">
                    <Step dark number="01" title="Browse &amp; Filter" description="Search curated artists by style, theme, and location. Free." />
                    <Step dark number="02" title="Enquire" description="Contact artists directly. Discuss terms and fit." />
                    <Step dark number="03" title="Arrange" description="Agree on free loan, revenue share, or purchase." />
                  </div>
                  <div className="mt-10">
                    <Link href="/browse" className="inline-flex items-center justify-center px-7 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                      Start Browsing
                    </Link>
                  </div>
                </div>
                <div className="flex flex-col">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent border-b border-white/10 pb-4 mb-8">For Artists</p>
                  <div className="space-y-8 flex-1">
                    <Step dark number="01" title="Apply" description="Submit your portfolio. We respond within 5 business days." />
                    <Step dark number="02" title="Get Accepted" description="Pass our curation review. First month free." />
                    <Step dark number="03" title="Get Discovered" description="Your profile goes live. Venues enquire directly." />
                  </div>
                  <div className="mt-10">
                    <Link href="/apply" className="inline-flex items-center justify-center px-7 py-3.5 bg-white text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-white/90 transition-colors">
                      Apply to Join
                    </Link>
                  </div>
                </div>
              </div>
              </AnimateIn>
            </div>
          </section>

          {/* ─── FINAL CTA ─── */}
          <section className="py-24 lg:py-32">
            <div className="max-w-[1200px] mx-auto px-6 lg:px-10 text-center">
              <AnimateIn>
              <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl text-foreground mb-4">
                Ready to get started?
              </h2>
              <p className="text-muted text-lg mb-12 max-w-lg mx-auto">
                Whether you&rsquo;re looking for art or looking to be discovered.
              </p>
              <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto items-stretch">
                <div className="bg-surface border border-border rounded-sm p-8 text-center flex flex-col">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-3">Venues</p>
                  <h3 className="font-serif text-xl mb-3">Source artwork risk-free</h3>
                  <p className="text-sm text-muted mb-6 flex-1">Free to browse and enquire. No contracts.</p>
                  <Link href="/browse" className="inline-flex items-center justify-center w-full px-6 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                    Discover Art
                  </Link>
                </div>
                <div className="bg-surface border border-border rounded-sm p-8 text-center flex flex-col">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-3">Artists</p>
                  <h3 className="font-serif text-xl mb-3">Get discovered by venues</h3>
                  <p className="text-sm text-muted mb-6 flex-1">First month free. From &pound;9.99/month.</p>
                  <Link href="/apply" className="inline-flex items-center justify-center w-full px-6 py-3.5 bg-foreground text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-foreground/90 transition-colors">
                    Apply to Join
                  </Link>
                </div>
              </div>
              </AnimateIn>
            </div>
          </section>

          {/* ─── CURATED BANNER ─── */}
          <section className="relative h-48 lg:h-56 overflow-hidden">
            <Image src="https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=1920&h=400&fit=crop&crop=center" alt="Art being created" fill className="object-cover" />
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative h-full flex items-center justify-center text-center px-6">
              <div>
                <p className="text-white text-2xl lg:text-3xl font-serif mb-2">Curated, not crowded.</p>
                <p className="text-white/50 text-sm">Every artist personally reviewed. No AI art.</p>
              </div>
            </div>
          </section>

          <Footer />
      </div>
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
