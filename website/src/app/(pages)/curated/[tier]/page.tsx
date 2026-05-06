"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * /curated/[tier], deep-dive page per curation tier.
 *
 * Each tier has its own detail page with (a) a prominent CTA at the top
 * that jumps straight into the /curated form with the tier pre-selected,
 * (b) a breakdown of what's included, (c) the typical journey, and (d)
 * FAQ. Keeps /curated itself scannable while giving buyers confidence
 * before they hand over £49+.
 *
 * Tier keys MUST match those in `CuratedClient.tsx` so deep-dive links
 * from the index resolve, and so a `?tier=...` round-trip from the
 * detail-page CTA back to the index can auto-select the correct card.
 */

type TierKey =
  | "single_wall"
  | "full_space"
  | "bespoke"
  | "managed_monthly"
  | "managed_quarterly";

const TIER_DETAILS: Record<
  TierKey,
  {
    label: string;
    priceLabel: string;
    strapline: string;
    highlights: string[];
    howItWorks: { title: string; body: string }[];
    faq: { q: string; a: string }[];
    cta: string;
  }
> = {
  single_wall: {
    label: "Single wall",
    priceLabel: "£49",
    strapline:
      "One feature wall, hand-picked. A curated shortlist tuned to your space, delivered in 5 business days.",
    highlights: [
      "A curator reviews your photos, brand, and tone",
      "Shortlist of 5–8 works suited to your space, with curator notes on each",
      "Sized, styled, and budget-matched to your brief",
      "One round of revisions if you'd like alternatives",
      "Clear next-step options — free QR-loan, paid loan, or outright purchase",
    ],
    howItWorks: [
      {
        title: "1. Tell us about the wall",
        body: "Share a photo, rough dimensions, and a short note on the space and the feel you're after.",
      },
      {
        title: "2. A curator reviews your brief",
        body: "A Wallplace curator matches available artists to your space — palette, scale, and audience.",
      },
      {
        title: "3. You get a shortlist",
        body: "5–8 works with curator notes, arrangement options, and price indications. Delivered by email within 5 business days.",
      },
      {
        title: "4. Pick and place",
        body: "Accept the ones you want and we set up the placement or purchase. You're never locked in.",
      },
    ],
    faq: [
      {
        q: "What if I don't love any of the shortlist?",
        a: "One free round of revisions is included. In the rare case nothing fits, we'll refund in full.",
      },
      {
        q: "Do I pay for the art on top of the £49?",
        a: "Arrangements vary by work. Many shortlists include free QR-loan options (zero ongoing cost, you share QR sales with the artist) and revenue-share arrangements. Paid-loan and outright purchase options are also shown — you pick what works for the space.",
      },
      {
        q: "When should I upgrade to Full space?",
        a: "When you have two or more walls and want them to feel coherent together. Full space (£149) considers grouping, palette, and flow across the whole venue, not just one wall.",
      },
    ],
    cta: "Book for £49",
  },
  full_space: {
    label: "Full space",
    priceLabel: "£149",
    strapline:
      "Every wall in your venue, considered together — palette, mood, and flow as one coherent look.",
    highlights: [
      "Multi-wall shortlist with grouping notes — which works belong side-by-side",
      "Mood and palette guidance so the venue feels intentional, not patchwork",
      "One revision round included if you'd like alternatives",
      "Best for venues with 2+ walls, adjoining rooms, corridors, or multi-room layouts",
      "Delivered within 5 business days",
    ],
    howItWorks: [
      {
        title: "1. Walk us through the venue",
        body: "Send photos and a short note on each wall, or a video walk-through. A curator uses this to plan flow between walls.",
      },
      {
        title: "2. Whole-venue plan returned in 5 business days",
        body: "A plan per wall with artist matches, grouping notes, and a unified palette across the rooms.",
      },
      {
        title: "3. Iterate together",
        body: "One revision round is included so you can swap, rebalance, or shift tone before committing.",
      },
      {
        title: "4. Place the whole set in one pass",
        body: "Once approved we handle the artist outreach, agreements, and installation pointers.",
      },
    ],
    faq: [
      {
        q: "Can I split the budget across walls?",
        a: "Yes — the £149 covers the curation. Each wall can independently use free QR-loan, paid loan, or purchase, depending on what suits the work and the room.",
      },
      {
        q: "How is this different from buying Single wall × N?",
        a: "Grouping. Single-wall shortlists are designed in isolation; Full space considers continuity, palette, and flow across the whole venue, so the rooms feel like one place rather than a collage.",
      },
      {
        q: "Do you visit in person?",
        a: "Not at this tier. If you need an on-site walkthrough, choose Bespoke instead.",
      },
    ],
    cta: "Book for £149",
  },
  bespoke: {
    label: "Bespoke project",
    priceLabel: "From £299 (scope dependent)",
    strapline:
      "Full curation plan for hotels, hospitality groups, offices, and larger venues.",
    highlights: [
      "Dedicated lead curator across the whole project",
      "Artist shortlist, including commissioned pieces if the brief needs it",
      "Rotation schedule so walls evolve with the seasons",
      "Installation and logistics guidance",
      "Flat quote based on scope, no hourly surprises",
    ],
    howItWorks: [
      {
        title: "1. Scope call",
        body: "A 30-minute call to understand the estate, brand, and constraints.",
      },
      {
        title: "2. Written proposal",
        body: "You get a flat quote, a timeline, and a proposed curator team.",
      },
      {
        title: "3. Execution in phases",
        body: "Discovery → shortlist → select → install → rotation. You approve at each phase.",
      },
      {
        title: "4. Ongoing rotation (optional)",
        body: "Seasonal refreshes keep walls from going stale. Priced separately.",
      },
    ],
    faq: [
      {
        q: "Is this suitable for a hotel chain?",
        a: "Yes — Bespoke scales from a single boutique hotel to a multi-site group.",
      },
      {
        q: "Can you work to a brand guideline?",
        a: "Yes. Share your brand guidelines and the curator will build matches within them.",
      },
    ],
    cta: "Request a quote",
  },
  managed_monthly: {
    label: "Monthly rotation",
    priceLabel: "£79.99 / month",
    strapline:
      "A new curated shortlist every month, keeping walls fresh without you lifting a finger.",
    highlights: [
      "One new shortlist per month with 3–5 fresh options",
      "Rotation suggestions tuned to season, traffic, and what's performing",
      "Priority artist coordination — we handle swaps end-to-end",
      "Cancel any time; no notice period",
    ],
    howItWorks: [
      {
        title: "Monthly drop",
        body: "On the same day each month you get a curated shortlist ready to review.",
      },
      {
        title: "You pick and place",
        body: "Accept the ones you want. We handle artist outreach and logistics.",
      },
      {
        title: "Swap + rotate",
        body: "If you're rotating existing work, we coordinate the collection and return.",
      },
    ],
    faq: [
      {
        q: "Do I pay for the art on top of £79.99?",
        a: "Curation is £79.99. The art itself follows whichever arrangement you pick — free QR-loan, paid loan, or outright purchase.",
      },
      {
        q: "What happens if I cancel?",
        a: "No fee. You keep the last shortlist and any live placements continue as normal.",
      },
    ],
    cta: "Start monthly, £79.99/mo",
  },
  managed_quarterly: {
    label: "Quarterly refresh",
    priceLabel: "£199.99 / quarter",
    strapline:
      "One considered seasonal refresh every three months — less admin than monthly.",
    highlights: [
      "One full shortlist every quarter (four per year)",
      "Seasonal mood and palette guidance",
      "Pairs well with a rotating loan arrangement",
      "Cancel any time; no notice period",
    ],
    howItWorks: [
      {
        title: "Quarterly drop",
        body: "Every three months you get a fresh shortlist with seasonal notes.",
      },
      {
        title: "Optionally rotate",
        body: "We can coordinate pickup of existing work and install of the new shortlist.",
      },
      {
        title: "Between quarters you're self-serve",
        body: "Keep browsing the marketplace any time if something catches your eye.",
      },
    ],
    faq: [
      {
        q: "Is this better than monthly?",
        a: "For most venues, yes. Monthly suits high-traffic / hospitality where walls are a brand asset. Quarterly is the norm for cafés, offices, and boutique retail.",
      },
      {
        q: "Do quarterly works cost extra?",
        a: "Curation is the £199.99. The art itself follows whichever arrangement you pick.",
      },
    ],
    cta: "Start quarterly, £199.99/qtr",
  },
};

export default function CurationTierPage({
  params,
}: {
  params: Promise<{ tier: string }>;
}) {
  const { tier } = use(params);
  const detail = TIER_DETAILS[tier as TierKey];
  if (!detail) notFound();

  return (
    <div className="max-w-[900px] mx-auto px-6 py-14">
      {/* Sticky-ish CTA at the top of the page so the reader can jump
          straight into the form without scrolling back up. The hash
          (#brief) matches the form section id in CuratedClient.tsx; the
          ?tier= query lets the index auto-select this tier on arrival. */}
      <div className="sticky top-[72px] z-10 -mx-6 px-6 py-3 bg-background/90 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent">
              Wallplace Curated
            </p>
            <p className="text-sm text-foreground truncate">
              {detail.label} &middot;{" "}
              <span className="text-muted">{detail.priceLabel}</span>
            </p>
          </div>
          <Link
            href={`/curated?tier=${tier}#brief`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-sm font-semibold rounded-sm hover:bg-accent-hover transition-colors"
          >
            {detail.cta}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </div>

      <div className="mt-10">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent mb-3">
          {detail.priceLabel}
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-foreground leading-tight mb-4">
          {detail.label}
        </h1>
        <p className="text-lg text-muted leading-relaxed mb-10 max-w-xl">
          {detail.strapline}
        </p>
      </div>

      <section className="mb-12">
        <h2 className="text-sm font-medium text-foreground tracking-wider uppercase mb-5">
          What&rsquo;s included
        </h2>
        <ul className="space-y-3">
          {detail.highlights.map((h) => (
            <li key={h} className="flex gap-3 items-start">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              <span className="text-foreground/90 leading-relaxed">{h}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-sm font-medium text-foreground tracking-wider uppercase mb-5">
          How it works
        </h2>
        <ol className="space-y-5">
          {detail.howItWorks.map((s, i) => (
            <li key={i} className="grid grid-cols-[40px_1fr] gap-4">
              <span className="w-9 h-9 rounded-full bg-accent/10 text-accent flex items-center justify-center text-sm font-medium">
                {i + 1}
              </span>
              <div>
                <p className="text-foreground font-medium">{s.title}</p>
                <p className="text-sm text-muted leading-relaxed mt-0.5">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-12">
        <h2 className="text-sm font-medium text-foreground tracking-wider uppercase mb-5">
          FAQ
        </h2>
        <div className="space-y-5">
          {detail.faq.map((f) => (
            <div key={f.q}>
              <p className="text-foreground font-medium mb-1.5">{f.q}</p>
              <p className="text-sm text-muted leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="border-t border-border pt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-foreground font-medium">Ready to start?</p>
          <p className="text-sm text-muted">
            {detail.priceLabel} &middot; cancel any time.
          </p>
        </div>
        <Link
          href={`/curated?tier=${tier}#brief`}
          className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white text-sm font-semibold rounded-sm hover:bg-accent-hover transition-colors"
        >
          {detail.cta}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
