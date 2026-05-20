"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import VenueGuide from "@/components/marketing/VenueGuide";
import ArtistGuide from "@/components/marketing/ArtistGuide";
import CustomerGuide from "@/components/marketing/CustomerGuide";

type Audience = "venue" | "artist" | "customer";

const audiences: { id: Audience; label: string }[] = [
  { id: "venue", label: "For venues" },
  { id: "artist", label: "For artists" },
  { id: "customer", label: "For customers" },
];

const tabContent: Record<Audience, {
  lede: string;
  steps: { number: string; title: string; description: string }[];
  cta: { href: string; label: string };
  secondary?: { href: string; label: string };
}> = {
  venue: {
    lede: "You have a wall. We have a curated network of artists actively looking for somewhere to hang their work. Browsing and enquiring is free.",
    steps: [
      { number: "01", title: "Browse & Filter", description: "Search curated artist portfolios by style, theme, and location. Free, no signup needed." },
      { number: "02", title: "Enquire", description: "Contact artists directly through Wallplace to discuss work, terms, and fit for your space." },
      { number: "03", title: "Arrange", description: "Display work for free with an optional revenue share on sales, or purchase pieces outright for your permanent collection." },
    ],
    cta: { href: "/signup/venue", label: "Register your venue" },
    secondary: { href: "/curated", label: "Or explore Curated, a managed selection from £49" },
  },
  artist: {
    lede: "Apply to join Wallplace's curated roster. We accept around half. Accepted artists get their first month free, then choose any tier.",
    steps: [
      { number: "01", title: "Apply", description: "Submit your portfolio. We review every application personally and respond within 5 business days." },
      { number: "02", title: "Get Accepted", description: "Pass curation review and your profile goes live. First month free on any plan." },
      { number: "03", title: "Display & Sell", description: "Venues enquire directly. Display work in their spaces, sell originals through your QR-coded display, or sell prints from your storefront." },
    ],
    cta: { href: "/apply", label: "Apply to join, first month free if accepted" },
    secondary: { href: "/pricing", label: "See pricing" },
  },
  customer: {
    lede: "Buy original artwork directly from independent artists. Spot a piece on a wall in a venue and scan the QR, or browse hundreds of storefronts online.",
    steps: [
      { number: "01", title: "Discover", description: "Find work in person at a venue showing Wallplace artists, or browse artist storefronts online." },
      { number: "02", title: "Buy", description: "Pay securely through Wallplace. Every piece comes with a certificate of authenticity from the artist." },
      { number: "03", title: "Receive", description: "Pickup from the venue or have it shipped. Track the order through your account until it arrives." },
    ],
    cta: { href: "/browse", label: "Browse artwork" },
    secondary: { href: "/customer", label: "Learn more for customers" },
  },
};

export default function HowItWorksClient() {
  const [audience, setAudience] = useState<Audience>("venue");
  const active = tabContent[audience];

  return (
    <div className="bg-background">
      {/* Hero, dark art-related background with a heavy gradient so the
          tabbed copy stays legible on top of the image. The negative
          top margin pulls the section under the fixed header so the
          image fills the full viewport. `isolate` keeps the -z-10
          image stack inside this section so the dark fallback bg sits
          underneath it (and shows immediately, even before the image
          finishes loading or if it fails entirely). */}
      <section className="relative isolate -mt-14 lg:-mt-16 min-h-screen flex flex-col pt-28 lg:pt-32 pb-24 text-white bg-foreground">
        {/* The hero is min-h-screen so it grows when the selected
            audience's copy runs longer (artist and customer tabs both
            push past venue's). If the background image fills that
            growing section, `object-cover` scales it up to keep
            covering — so the artwork visibly zooms in the moment a
            taller tab is selected. Pin the image container to exactly
            100vh (h-screen) so the crop is identical for every tab;
            any overflow below sits on the section's bg-foreground
            base, which fades out the bottom gradient cleanly. */}
        <div className="absolute inset-x-0 top-0 -z-10 h-screen overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=1920&h=1080&fit=crop&crop=center"
            alt="Curated gallery interior with framed artwork"
            fill
            priority
            className="object-cover"
          />
          {/* Two layers of darkening: a solid base so even the bright
              parts of the image don't blow out the tab content, plus
              a vertical gradient to push extra contrast under the
              text block. */}
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/70" />
        </div>

        <div className="flex-1 flex items-center">
          <div className="max-w-4xl mx-auto px-6 w-full">
            <p className="text-xs font-medium tracking-[0.25em] uppercase text-accent mb-4">
              How it works
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-white leading-[1.05] mb-10">
              How Wallplace works
            </h1>

            <div
              role="tablist"
              aria-label="How Wallplace works for"
              className="flex flex-wrap gap-1 mb-10 border-b border-white/15"
            >
              {audiences.map(({ id, label }) => {
                const isActive = audience === id;
                return (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`hiw-panel-${id}`}
                    id={`hiw-tab-${id}`}
                    onClick={() => setAudience(id)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      isActive
                        ? "border-accent text-white"
                        : "border-transparent text-white/60 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <section
              role="tabpanel"
              id={`hiw-panel-${audience}`}
              aria-labelledby={`hiw-tab-${audience}`}
              className="max-w-3xl"
            >
              <p className="text-lg text-white/75 leading-relaxed mb-10 max-w-2xl">
                {active.lede}
              </p>
              <ol className="space-y-7 mb-10">
                {active.steps.map((step) => (
                  <li key={step.number} className="flex gap-5">
                    <span className="flex-shrink-0 text-xs font-medium tracking-widest text-accent mt-1">
                      {step.number}
                    </span>
                    <div>
                      <p className="font-serif text-lg text-white">{step.title}</p>
                      <p className="mt-1.5 text-sm text-white/65 leading-relaxed max-w-xl">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <Link
                  href={active.cta.href}
                  className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
                >
                  {active.cta.label}
                </Link>
                {active.secondary && (
                  <Link
                    href={active.secondary.href}
                    className="text-sm text-white/70 underline underline-offset-2 hover:text-white"
                  >
                    {active.secondary.label}
                  </Link>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* Scroll affordance, anchored at the bottom of the hero so it
            sits just above the fold. Clicking takes the user to the
            audience-by-audience detail below. */}
        <div className="relative z-10 mt-auto pt-10 flex justify-center">
          <a
            href="#hiw-detail"
            className="group inline-flex flex-col items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/60 hover:text-white transition-colors"
          >
            <span>Scroll to see more</span>
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/30 group-hover:border-white/70 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </a>
        </div>
      </section>

      {/* Audience-targeted scroll content. The selected tab drives
          BOTH the hero's brief (01/02/03 steps) and the deep guide
          below, so a visitor on the "For artists" tab sees only the
          artist guide on scroll, not all three stacked. No transition
          banner between hero and guide: the hero's tabbed eyebrow
          already labels the audience, an extra band underneath read
          as filler. */}
      <div id="hiw-detail">
        {audience === "venue" && <VenueGuide />}
        {audience === "artist" && <ArtistGuide />}
        {audience === "customer" && <CustomerGuide />}
      </div>
    </div>
  );
}
