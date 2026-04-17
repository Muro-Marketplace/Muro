"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Footer from "@/components/Footer";
import ArtistCarousel from "@/components/ArtistCarousel";
import AnimateIn from "@/components/AnimateIn";
import { artists } from "@/data/artists";
import { venues } from "@/data/venues";
import { useAuth } from "@/context/AuthContext";

const featuredArtists = artists.slice(0, 6);

const navLinks = [
  { label: "Marketplace", href: "/browse" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Blog", href: "/blog" },
  { label: "Spaces", href: "/spaces-looking-for-art" },
  { label: "Waitlist", href: "/waitlist" },
];

export default function Home() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, userType, signOut } = useAuth();

  const portalBase = userType === "venue" ? "/venue-portal" : userType === "customer" ? "/customer-portal" : "/artist-portal";
  const portalLabel = userType === "venue" ? "Venue Portal" : userType === "customer" ? "Customer Portal" : "Artist Portal";

  function scrollToContent() {
    contentRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="relative">
      {/* ─── HERO ─── full screen with transparent nav */}
      <section className="relative min-h-[110vh] sm:min-h-screen flex flex-col">
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
            <Link href="/" className="font-serif text-2xl lg:text-3xl tracking-tight text-white">Wallplace</Link>
            <nav className="hidden lg:flex items-center gap-7">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} className="text-sm text-white/90 hover:text-white transition-colors duration-200">{link.label}</Link>
              ))}
            </nav>
            <div className="hidden lg:flex items-center gap-4">
              {user ? (
                <>
                  <Link href={portalBase} className="text-sm text-white/90 hover:text-white transition-colors">{portalLabel}</Link>
                  <button onClick={() => signOut()} className="text-sm text-white/50 hover:text-white transition-colors">Logout</button>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-sm text-white/90 hover:text-white transition-colors">Login</Link>
                  <Link href="/signup" className="text-sm px-5 py-2.5 bg-white text-foreground font-medium rounded-sm hover:bg-white/90 transition-colors">Sign Up</Link>
                </>
              )}
            </div>
            <button type="button" className="lg:hidden p-2 -mr-2 text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                {mobileMenuOpen ? (<><line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" /></>) : (<><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></>)}
              </svg>
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="lg:hidden bg-black/80 backdrop-blur-md border-t border-white/10 mt-4">
              <div className="px-6 py-6 space-y-6">
                <nav className="flex flex-col gap-4">
                  {navLinks.map((link) => (
                    <Link key={link.href} href={link.href} className="text-base text-white/70 hover:text-white transition-colors" onClick={() => setMobileMenuOpen(false)}>{link.label}</Link>
                  ))}
                </nav>
                <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
                  {user ? (
                    <>
                      <Link href={portalBase} className="text-center text-sm px-5 py-3 rounded-sm bg-white text-foreground font-medium hover:bg-white/90" onClick={() => setMobileMenuOpen(false)}>{portalLabel}</Link>
                      <button onClick={() => { signOut(); setMobileMenuOpen(false); }} className="text-center text-sm px-5 py-3 rounded-sm border border-white/20 text-white hover:bg-white/10">Logout</button>
                    </>
                  ) : (
                    <>
                      <Link href="/login" className="text-center text-sm px-5 py-3 rounded-sm border border-white/20 text-white hover:bg-white/10" onClick={() => setMobileMenuOpen(false)}>Login</Link>
                      <Link href="/signup" className="text-center text-sm px-5 py-3 rounded-sm bg-white text-foreground font-medium hover:bg-white/90" onClick={() => setMobileMenuOpen(false)}>Sign Up</Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Hero content */}
        <div className="flex-1 flex items-center justify-center px-6 lg:px-10 pb-28 sm:pb-32">
          <div className="max-w-[1400px] mx-auto w-full">
            <div className="max-w-2xl mx-auto text-center">
              <h1 className="font-serif text-[2.6rem] sm:text-5xl md:text-[4.5rem] lg:text-[5.5rem] leading-[0.9] tracking-[-0.02em] text-white mt-6 sm:mt-10 mb-7 sm:mb-6">
                WALLPLACE
              </h1>
              <p className="text-lg sm:text-xl lg:text-2xl text-white/90 font-light leading-snug mb-6 sm:mb-3">
                The curated art marketplace<br className="sm:hidden" /> for commercial spaces.
              </p>
              <p className="text-sm sm:text-base lg:text-lg text-white/50 leading-relaxed mb-14 sm:mb-10 max-w-lg mx-auto">
                Venues source original artwork risk-free. Artists access
                high-intent commercial demand.
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

        {/* Scroll indicator + trust bar – anchored to bottom, pushed up on mobile */}
        <div className="relative z-10 mt-auto mb-[13vh] sm:mb-0">
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
          {/* Dark trust bar — hidden on mobile */}
          <div className="hidden sm:block border-t border-white/10 bg-black/50 backdrop-blur-sm">
            <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-white/90 font-medium">Curated Artists</span>
                <span className="w-1 h-1 rounded-full bg-white/30" />
                <span className="text-white/60">Original Artworks</span>
                <span className="w-1 h-1 rounded-full bg-white/30" />
                <span className="text-white/60">Active Venues</span>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-xs text-white/40 tracking-widest uppercase">
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

                  {/* Mobile image strip */}
                  <div className="sm:hidden flex gap-2 overflow-x-auto -mx-6 px-6 pb-2 mb-6 scrollbar-hide">
                    <div className="w-40 h-28 relative rounded-sm overflow-hidden shrink-0">
                      <Image src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=280&fit=crop" alt="Art in café" fill className="object-cover" sizes="160px" />
                    </div>
                    <div className="w-40 h-28 relative rounded-sm overflow-hidden shrink-0">
                      <Image src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&h=280&fit=crop" alt="Art in restaurant" fill className="object-cover" sizes="160px" />
                    </div>
                    <div className="w-40 h-28 relative rounded-sm overflow-hidden shrink-0">
                      <Image src="https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=400&h=280&fit=crop" alt="Art in hotel lobby" fill className="object-cover" sizes="160px" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-8 sm:mb-10">
                    <DealCard title="Display" description="Art on your walls for free. Earn a share if it sells." />
                    <DealCard title="Purchase" description="Buy pieces outright for your permanent collection." />
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <Link href="/browse" className="inline-flex items-center justify-center px-5 sm:px-7 py-3 sm:py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                      Discover Art
                    </Link>
                    <Link href="/register-venue" className="inline-flex items-center justify-center px-5 sm:px-7 py-3 sm:py-3.5 border border-border text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-background transition-colors">
                      REGISTER YOUR VENUE
                    </Link>
                  </div>
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

          {/* ─── FOR ARTISTS ─── */}
          <section className="py-12 lg:py-28">
            <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
              <AnimateIn>
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div className="order-2 lg:order-1 grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2">
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
                    Your art, in the spaces people love.
                  </h2>
                  <p className="text-lg text-muted leading-relaxed mb-8">
                    Showcase, get discovered, and sell, all in one place.
                    Your Wallplace profile is your portfolio, your storefront,
                    and your route into the best commercial venues.
                  </p>

                  <ul className="space-y-3 mb-10">
                    <BulletPoint text="Get displayed in cafés, restaurants, hotels, and offices" />
                    <BulletPoint text="Sell directly online — every QR scan leads to your store" />
                    <BulletPoint text="3–15% platform fee. No gallery taking 50%." />
                  </ul>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <Link href="/apply" className="inline-flex items-center justify-center px-5 sm:px-7 py-3 sm:py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                      Apply to Join
                    </Link>
                    <Link href="/artists" className="inline-flex items-center justify-center px-5 sm:px-7 py-3 sm:py-3.5 border border-border text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-background transition-colors">
                      LEARN MORE
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
                How Wallplace works
              </h2>
              <div className="grid md:grid-cols-2 gap-16">
                <div className="flex flex-col">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent border-b border-white/10 pb-4 mb-8">For Venues</p>
                  <div className="space-y-8 flex-1">
                    <Step dark number="01" title="Browse &amp; Filter" description="Search curated artists by style, theme, and location. Free." />
                    <Step dark number="02" title="Enquire" description="Contact artists directly. Discuss terms and fit." />
                    <Step dark number="03" title="Arrange" description="Display art for free with optional revenue share, or purchase outright." />
                  </div>
                  <div className="mt-10">
                    <Link href="/register-venue" className="inline-flex items-center justify-center px-7 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                      Register Your Venue
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

          {/* ─── TESTIMONIALS ─── */}
          <section className="py-20 lg:py-28 bg-surface border-y border-border">
            <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
              <AnimateIn>
              <div className="text-center mb-14">
                <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">Testimonials</p>
                <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground">
                  Trusted by artists and venues
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  {
                    quote: "Wallplace made it incredibly easy to find artwork that fits our space. We went from bare walls to a rotating gallery in two weeks.",
                    name: "Sarah Mitchell",
                    role: "Owner, The Copper Kettle",
                    type: "Venue",
                  },
                  {
                    quote: "I've had more venue enquiries in three months on Wallplace than in two years trying to approach places myself. The platform just works.",
                    name: "James Okafor",
                    role: "Architectural Photographer",
                    type: "Artist",
                  },
                  {
                    quote: "The revenue share model is genius. We display beautiful art, the artist gets exposure, and when something sells we both benefit. Zero risk.",
                    name: "David Chen",
                    role: "Manager, Shoreditch Studios",
                    type: "Venue",
                  },
                ].map((t, i) => (
                  <div key={i} className="bg-background border border-border rounded-sm p-6 lg:p-8 flex flex-col">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-accent/30 mb-4 shrink-0">
                      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" fill="currentColor" />
                      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" fill="currentColor" />
                    </svg>
                    <p className="text-sm text-foreground/80 leading-relaxed flex-1 mb-6">
                      {t.quote}
                    </p>
                    <div className="flex items-center gap-3 pt-4 border-t border-border">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-accent">{t.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{t.name}</p>
                        <p className="text-xs text-muted">{t.role}</p>
                      </div>
                      <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-accent/60 bg-accent/5 px-2 py-0.5 rounded-sm">{t.type}</span>
                    </div>
                  </div>
                ))}
              </div>
              </AnimateIn>
            </div>
          </section>

          {/* ─── VENUE DEMAND ─── */}
          <section className="py-20 lg:py-28 relative overflow-hidden">
            <div className="absolute inset-0">
              <img src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1920&h=1200&fit=crop&crop=center" alt="" className="w-full h-full min-h-full object-cover" />
              <div className="absolute inset-0 bg-black/75" />
            </div>
            <div className="max-w-[1000px] mx-auto px-6 lg:px-10 text-center relative z-10">
              <AnimateIn>
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">Active Demand</p>
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-white mb-4">
                Venues are looking for art right now
              </h2>
              <p className="text-lg text-white/50 max-w-lg mx-auto mb-10">
                Cafés, restaurants, hotels, and offices actively seeking artwork to display. See what&rsquo;s available near you.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/spaces-looking-for-art" className="inline-flex items-center justify-center min-w-[220px] px-7 py-3 sm:py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                  See Venue Demand
                </Link>
                <Link href="/apply" className="inline-flex items-center justify-center min-w-[220px] px-7 py-3 sm:py-3.5 bg-white text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-white/90 transition-colors">
                  Apply to Join
                </Link>
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
                Whether you&rsquo;re looking for art, looking to be discovered, or looking to buy.
              </p>
              <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto items-stretch">
                <div className="bg-surface border border-border rounded-sm p-5 sm:p-8 text-center flex flex-col">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-3">Venues</p>
                  <h3 className="font-serif text-xl mb-3">Source artwork risk-free</h3>
                  <p className="text-sm text-muted mb-6 flex-1">Free to browse and enquire. No contracts.</p>
                  <Link href="/register-venue" className="inline-flex items-center justify-center w-full px-4 py-3.5 bg-accent text-white text-xs font-semibold tracking-wide uppercase rounded-sm hover:bg-accent-hover transition-colors whitespace-nowrap">
                    Register Your Venue
                  </Link>
                </div>
                <div className="bg-surface border border-border rounded-sm p-5 sm:p-8 text-center flex flex-col">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-3">Artists</p>
                  <h3 className="font-serif text-xl mb-3">Get discovered by venues</h3>
                  <p className="text-sm text-muted mb-6 flex-1">First month free. From &pound;9.99/month.</p>
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
