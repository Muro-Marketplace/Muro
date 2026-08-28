"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { curatedTierFooterNote, getCuratedTier } from "@/lib/curated-tiers";

/**
 * /curated/[tier], deep-dive page per curation tier.
 *
 * Each tier has its own detail page with (a) a prominent CTA at the top
 * that jumps straight into the /curated form with the tier pre-selected,
 * (b) a breakdown of what's included, (c) the typical journey, and (d)
 * FAQ. Keeps /curated itself scannable while giving buyers confidence
 * before they hand over £49+.
 *
 * The tier set lives in `src/lib/curated-tiers.ts` so deep-dive links
 * from the index resolve, and so a `?tier=...` round-trip from the
 * detail-page CTA back to the index can auto-select the correct card.
 */

export default function CurationTierPage({
  params,
}: {
  params: Promise<{ tier: string }>;
}) {
  const { tier } = use(params);
  const tierData = getCuratedTier(tier);
  if (!tierData) notFound();
  const { label, priceLabel, cta, detail, group } = tierData;

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
              {label} &middot;{" "}
              <span className="text-muted">{priceLabel}</span>
            </p>
          </div>
          <Link
            href={`/curated?tier=${tier}#brief`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-sm font-semibold rounded-sm hover:bg-accent-hover transition-colors"
          >
            {cta}
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
          {priceLabel}
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-foreground leading-tight mb-4">
          {label}
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
            {priceLabel} &middot; {curatedTierFooterNote(group)}
          </p>
        </div>
        <Link
          href={`/curated?tier=${tier}#brief`}
          className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white text-sm font-semibold rounded-sm hover:bg-accent-hover transition-colors"
        >
          {cta}
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
