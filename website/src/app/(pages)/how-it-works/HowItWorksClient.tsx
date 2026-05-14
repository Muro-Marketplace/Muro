"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/Button";

type Audience = "venue" | "artist" | "buyer";

const audiences: { id: Audience; label: string }[] = [
  { id: "venue", label: "For venues" },
  { id: "artist", label: "For artists" },
  { id: "buyer", label: "For buyers" },
];

export default function HowItWorksClient() {
  const [audience, setAudience] = useState<Audience>("venue");

  return (
    <main className="max-w-4xl mx-auto px-6 py-16 lg:py-20">
      <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-3">
        How it works
      </p>
      <h1 className="font-serif text-3xl lg:text-5xl mb-10">
        How Wallplace works
      </h1>

      <div role="tablist" aria-label="How Wallplace works for" className="flex gap-1 mb-10 border-b border-border">
        {audiences.map(({ id, label }) => {
          const active = audience === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              aria-controls={`hiw-panel-${id}`}
              id={`hiw-tab-${id}`}
              onClick={() => setAudience(id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
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
      >
        {audience === "venue" && <VenueExplainer />}
        {audience === "artist" && <ArtistExplainer />}
        {audience === "buyer" && <BuyerExplainer />}
      </section>
    </main>
  );
}

function VenueExplainer() {
  return (
    <Explainer
      lede="You have a wall. We have a curated network of artists actively looking for somewhere to hang their work. Browsing and enquiring is free."
      steps={[
        {
          number: "01",
          title: "Browse & Filter",
          description:
            "Search curated artist portfolios by style, theme, and location. Free, no signup needed.",
        },
        {
          number: "02",
          title: "Enquire",
          description:
            "Contact artists directly through Wallplace to discuss work, terms, and fit for your space.",
        },
        {
          number: "03",
          title: "Arrange",
          description:
            "Display work for free with an optional revenue share on sales, or purchase pieces outright for your permanent collection.",
        },
      ]}
      cta={{ href: "/signup/venue", label: "Register your venue" }}
      secondaryCta={{ href: "/curated", label: "Or explore Curated, a managed selection from £49" }}
    />
  );
}

function ArtistExplainer() {
  return (
    <Explainer
      lede="Apply to join Wallplace's curated roster. We accept around half. Accepted artists get their first month free, then choose any tier."
      steps={[
        {
          number: "01",
          title: "Apply",
          description:
            "Submit your portfolio. We review every application personally and respond within 5 business days.",
        },
        {
          number: "02",
          title: "Get Accepted",
          description:
            "Pass curation review and your profile goes live. First month free on any plan.",
        },
        {
          number: "03",
          title: "Display & Sell",
          description:
            "Venues enquire directly. Display work in their spaces, sell originals through your QR-coded display, or sell prints from your storefront.",
        },
      ]}
      cta={{ href: "/apply", label: "Apply to join, first month free if accepted" }}
      secondaryCta={{ href: "/pricing", label: "See pricing" }}
    />
  );
}

function BuyerExplainer() {
  return (
    <Explainer
      lede="Buy original artwork directly from independent artists, through a venue display you've spotted in person, or from the artist's storefront online."
      steps={[
        {
          number: "01",
          title: "Discover",
          description:
            "Find work in person at a venue showing Wallplace artists, or browse artist storefronts online.",
        },
        {
          number: "02",
          title: "Buy",
          description:
            "Pay securely through Wallplace. Every piece comes with a certificate of authenticity from the artist.",
        },
        {
          number: "03",
          title: "Receive",
          description:
            "Pickup from the venue or have it shipped. Track the order through your account until it arrives.",
        },
      ]}
      cta={{ href: "/browse", label: "Browse artwork" }}
    />
  );
}

type ExplainerProps = {
  lede: string;
  steps: { number: string; title: string; description: string }[];
  cta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
};

function Explainer({ lede, steps, cta, secondaryCta }: ExplainerProps) {
  return (
    <div>
      <p className="text-lg text-muted leading-relaxed mb-10 max-w-2xl">{lede}</p>
      <ol className="space-y-8 mb-12">
        {steps.map((step) => (
          <li key={step.number} className="flex gap-5">
            <span className="flex-shrink-0 text-xs font-medium tracking-widest text-accent mt-1">
              {step.number}
            </span>
            <div>
              <p className="font-serif text-lg text-foreground">{step.title}</p>
              <p className="mt-1.5 text-sm text-muted leading-relaxed max-w-xl">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Button href={cta.href} size="md">
          {cta.label}
        </Button>
        {secondaryCta && (
          <Link
            href={secondaryCta.href}
            className="text-sm text-muted underline hover:text-foreground"
          >
            {secondaryCta.label}
          </Link>
        )}
      </div>
    </div>
  );
}
