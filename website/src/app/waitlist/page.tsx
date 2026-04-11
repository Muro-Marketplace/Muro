"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";

type UserType = "artist" | "venue" | null;

export default function WaitlistPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [userType, setUserType] = useState<UserType>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const howItWorksRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !userType) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, userType }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  function scrollToHowItWorks() {
    howItWorksRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="relative">
      {/* Fixed background image that persists through the entire page */}
      <div className="fixed inset-0 -z-10">
        <Image
          src="https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1920&h=1080&fit=crop&crop=center"
          alt="Gallery interior"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/60 to-black/50" />
      </div>

      {/* ─── HERO / WAITLIST ─── */}
      <section className="relative min-h-screen flex flex-col">
        {/* Main content */}
        <div className="flex-1 flex items-center justify-center px-6 pb-28 pt-8">
          <div className="w-full max-w-md lg:max-w-lg text-center">
            {submitted ? (
              <SuccessState />
            ) : (
              <>
                {/* Logo */}
                <h2 className="font-serif text-4xl lg:text-5xl tracking-tight text-white mb-8">
                  Wallspace
                </h2>

                {/* Headline */}
                <h1 className="font-serif text-[clamp(2rem,5vw,3.25rem)] lg:text-[2.75rem] leading-[1.05] tracking-[-0.02em] text-white mb-3">
                  The art marketplace for commercial spaces.
                </h1>

                {/* Subhead */}
                <p className="text-base text-white/60 leading-relaxed mb-8 mx-auto max-w-sm">
                  Connecting artists with venues that want
                  original work on their walls. Join the waitlist to be first
                  in.
                </p>

                {/* Form card */}
                <form
                  onSubmit={handleSubmit}
                  className="bg-black/30 backdrop-blur-md border border-white/10 rounded-sm p-4 sm:p-6 lg:p-8 space-y-3 sm:space-y-4 text-left"
                >
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-medium text-white/50 tracking-wider uppercase mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full px-4 py-3 bg-white/10 border border-white/15 rounded-sm text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 transition-colors duration-200"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-medium text-white/50 tracking-wider uppercase mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-4 py-3 bg-white/10 border border-white/15 rounded-sm text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 transition-colors duration-200"
                    />
                  </div>

                  {/* Type toggle */}
                  <div>
                    <label className="block text-xs font-medium text-white/50 tracking-wider uppercase mb-2">
                      I am a
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setUserType("artist")}
                        className={`py-3 px-4 text-sm font-medium rounded-sm border transition-all duration-200 ${
                          userType === "artist"
                            ? "bg-white text-foreground border-white"
                            : "bg-white/10 text-white/70 border-white/15 hover:border-white/30 hover:text-white"
                        }`}
                      >
                        Artist
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserType("venue")}
                        className={`py-3 px-4 text-sm font-medium rounded-sm border transition-all duration-200 ${
                          userType === "venue"
                            ? "bg-white text-foreground border-white"
                            : "bg-white/10 text-white/70 border-white/15 hover:border-white/30 hover:text-white"
                        }`}
                      >
                        Venue
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <p className="text-red-400 text-sm text-center">{error}</p>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={!name || !email || !userType || submitting}
                    className="w-full mt-2 py-3.5 px-6 bg-white text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-white/90 transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Joining..." : "Join the Waitlist"}
                  </button>
                </form>

                <p className="text-center mt-4">
                  <Link
                    href="/login"
                    className="text-xs text-white/30 hover:text-white/60 transition-colors duration-200"
                  >
                    Already have access? Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>

        {/* Scroll indicator – larger and more prominent */}
        <button
          onClick={scrollToHowItWorks}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-3 text-white/60 hover:text-white transition-colors duration-300 cursor-pointer"
        >
          <span className="text-xs tracking-[0.2em] uppercase font-medium">
            See how it works
          </span>
          <div className="w-10 h-10 rounded-full border border-white/30 flex items-center justify-center animate-bounce">
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7l5 5 5-5" />
            </svg>
          </div>
        </button>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <div ref={howItWorksRef}>
        <HowItWorks />
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * HOW IT WORKS – scroll-reveal sections with shared background
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function HowItWorks() {
  return (
    <div className="relative text-white">
      {/* Semi-transparent dark overlay so text is readable over the fixed bg */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

      <div className="relative">
        {/* Intro */}
        <FadeInSection>
          <section className="py-24 lg:py-32">
            <div className="max-w-[900px] mx-auto px-6 lg:px-10 text-center">
              <p className="text-xs font-medium tracking-[0.25em] uppercase text-white/40 mb-6">
                How Wallspace Works
              </p>
              <h2 className="font-serif text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.1] tracking-[-0.02em] text-white mb-6">
                A curated marketplace. Two sides. Zero risk.
              </h2>
              <p className="text-lg text-white/50 leading-relaxed max-w-xl mx-auto">
                Wallspace connects artists who want commercial
                exposure with venues that want original art on their walls —
                with flexible, risk-free arrangements for both sides.
              </p>
            </div>
          </section>
        </FadeInSection>

        {/* Divider */}
        <div className="max-w-[900px] mx-auto px-6 lg:px-10">
          <div className="h-px bg-white/10" />
        </div>

        {/* ─── FOR PHOTOGRAPHERS (first) ─── */}
        <FadeInSection>
          <section className="py-24 lg:py-32">
            <div className="max-w-[1100px] mx-auto px-6 lg:px-10">
              <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
                {/* Left: copy */}
                <div>
                  <p className="text-xs font-medium tracking-[0.25em] uppercase text-accent mb-5">
                    For Artists
                  </p>
                  <h3 className="font-serif text-3xl lg:text-4xl text-white mb-6 leading-[1.15]">
                    Get your work seen. Get paid fairly.
                  </h3>
                  <p className="text-base text-white/50 leading-relaxed mb-10">
                    Your prints displayed in cafés, restaurants, hotels, and
                    galleries – reaching people who actually buy art. Not another
                    social feed. Real, physical walls.
                  </p>

                  <div className="space-y-6">
                    <Step
                      number="01"
                      title="Apply"
                      description="Submit your portfolio for review. We respond within 5 business days. No AI art."
                    />
                    <Step
                      number="02"
                      title="Get Curated"
                      description="Your profile goes live. Venues browse, filter, and reach out to you directly."
                    />
                    <Step
                      number="03"
                      title="Earn"
                      description="Sell prints outright, offer bundles, take commissions, or arrange revenue-share deals – all through the marketplace."
                    />
                  </div>
                </div>

                {/* Right: value props – 3 cards with icons */}
                <div className="space-y-4 lg:pt-14">
                  <DealCard
                    icon={
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                    title="Commercial Exposure"
                    description="Your work in front of hundreds of daily visitors in high-footfall venues across the UK."
                  />
                  <DealCard
                    icon={
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    }
                    title="First 20 Artists: Free Access for Life"
                    description="Core plans otherwise start from £9.99/month. No commitments. Cancel any time."
                  />
                  <DealCard
                    icon={
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                    }
                    title="0–10% Platform Fee on Sales"
                    description="No gallery taking 50%. Transparent, fair pricing. Keep most of what you earn."
                  />
                </div>
              </div>
            </div>
          </section>
        </FadeInSection>

        {/* Divider */}
        <div className="max-w-[900px] mx-auto px-6 lg:px-10">
          <div className="h-px bg-white/10" />
        </div>

        {/* ─── FOR VENUES (second) ─── */}
        <FadeInSection>
          <section className="py-24 lg:py-32">
            <div className="max-w-[1100px] mx-auto px-6 lg:px-10">
              <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
                {/* Left: copy */}
                <div>
                  <p className="text-xs font-medium tracking-[0.25em] uppercase text-accent mb-5">
                    For Venues
                  </p>
                  <h3 className="font-serif text-3xl lg:text-4xl text-white mb-6 leading-[1.15]">
                    Art for your space. No upfront cost.
                  </h3>
                  <p className="text-base text-white/50 leading-relaxed mb-10">
                    Whether you run a café, restaurant, hotel, office, or salon
                    – browse curated artist portfolios and source original
                    work for your walls on terms that work for you.
                  </p>

                  <div className="space-y-6">
                    <Step
                      number="01"
                      title="Browse &amp; Filter"
                      description="Search curated portfolios by location, style, and theme. Completely free."
                    />
                    <Step
                      number="02"
                      title="Enquire Directly"
                      description="Message artists through the platform. Discuss what you need and agree terms."
                    />
                    <Step
                      number="03"
                      title="Get Art on Your Walls"
                      description="Arrange free loan, revenue share, or direct purchase. Swap or rotate any time."
                    />
                  </div>
                </div>

                {/* Right: deal cards */}
                <div className="space-y-4 lg:pt-14">
                  <DealCard
                    icon={
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    }
                    title="Free Loan"
                    description="Display artwork at no cost. Return or rotate any time. Zero financial risk."
                  />
                  <DealCard
                    icon={
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
                    }
                    title="Revenue Share"
                    description="If a customer buys art from your wall, you earn a share of the sale."
                  />
                  <DealCard
                    icon={
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/></svg>
                    }
                    title="Direct Purchase"
                    description="Buy artwork outright for your permanent collection at transparent prices."
                  />
                </div>
              </div>
            </div>
          </section>
        </FadeInSection>

        {/* Divider */}
        <div className="max-w-[900px] mx-auto px-6 lg:px-10">
          <div className="h-px bg-white/10" />
        </div>

        {/* ─── FINAL CTA ─── */}
        <FadeInSection>
          <section className="py-28 lg:py-36">
            <div className="max-w-[700px] mx-auto px-6 lg:px-10 text-center">
              <h2 className="font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.1] tracking-[-0.02em] text-white mb-5">
                Be first in when we launch.
              </h2>
              <p className="text-base text-white/40 leading-relaxed mb-10 max-w-md mx-auto">
                Wallspace is in private beta. Join the waitlist and we&rsquo;ll
                notify you when we open the doors.
              </p>
              <button
                onClick={() =>
                  window.scrollTo({ top: 0, behavior: "smooth" })
                }
                className="inline-flex items-center justify-center px-10 py-4 bg-white text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-white/90 transition-colors duration-200"
              >
                Join the Waitlist
              </button>
            </div>
          </section>
        </FadeInSection>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Sub-components
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function FadeInSection({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      {children}
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-5">
      <span className="flex-shrink-0 text-xs font-medium tracking-widest text-accent mt-1">
        {number}
      </span>
      <div>
        <p className="font-serif text-lg text-white">{title}</p>
        <p className="mt-1 text-sm text-white/40 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

function DealCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-sm border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors duration-300">
      <div className="flex items-start gap-4">
        <div className="text-accent shrink-0 mt-0.5">{icon}</div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">{title}</p>
          <p className="text-sm text-white/40 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function ValueCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-sm border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors duration-300">
      <p className="text-sm font-semibold text-white mb-1">{title}</p>
      <p className="text-sm text-white/40 leading-relaxed">{description}</p>
    </div>
  );
}

function SuccessState() {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full border border-white/20 bg-white/10 mb-8">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <h2 className="font-serif text-3xl lg:text-4xl text-white mb-4">
        You&rsquo;re on the list.
      </h2>
      <p className="text-white/50 text-base leading-relaxed max-w-xs mx-auto">
        We&rsquo;ll be in touch before launch. Thanks for your interest in
        Wallspace.
      </p>
    </div>
  );
}
