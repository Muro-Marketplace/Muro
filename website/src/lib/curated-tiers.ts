/**
 * Single source of truth for Wallplace Curated tiers.
 *
 * Used by both `/curated` (CuratedClient.tsx, the landing/plan picker)
 * and `/curated/[tier]` (deep-dive page) so the tier set, prices, and
 * CTAs can never drift between the two surfaces.
 *
 * Task 9: this file is the source of truth for the tier *copy* only. Every
 * price figure it prints, in priceLabel, cta, or FAQ prose, is derived from
 * CURATION_TIERS in curation-tiers.ts (the billing truth, validated against
 * Stripe) via gbp(). Nothing here should ever hold a literal "£<number>";
 * tests/integration/one-curated-price-source.test.ts fails the build if it
 * does.
 */

import { CURATION_TIERS, gbp } from "./curation-tiers";

export type CuratedTierKey =
  | "single_wall"
  | "full_space"
  | "bespoke"
  | "programme";

export type CuratedTierGroup = "one_off" | "managed";

export interface CuratedTier {
  key: CuratedTierKey;
  label: string;
  priceLabel: string;
  cta: string;
  group: CuratedTierGroup;
  /** Surfaces a "Most popular" badge on the card. The middle one-off
   *  tier is the conversion target, venues with 2+ walls converge here
   *  and the price-quality ratio is the strongest of the five. */
  popular?: boolean;
  /** Short-form copy used on the landing-page tier cards. */
  summary: {
    strapline: string;
    bullets: string[];
  };
  /** Long-form copy used on /curated/[tier] deep-dives. */
  detail: {
    strapline: string;
    highlights: string[];
    howItWorks: { title: string; body: string }[];
    faq: { q: string; a: string }[];
  };
}

export const CURATED_TIERS: CuratedTier[] = [
  {
    key: "single_wall",
    label: "Single wall",
    priceLabel: gbp(CURATION_TIERS.single_wall.priceGbp),
    cta: `Book for ${gbp(CURATION_TIERS.single_wall.priceGbp)}`,
    group: "one_off",
    summary: {
      strapline: "One feature wall, hand-picked.",
      bullets: [
        "Shortlist of 5 to 8 works suited to your space",
        "Size, style and budget matched to your brief",
        "Delivered by email within 5 business days",
      ],
    },
    detail: {
      strapline:
        "One feature wall, hand-picked. A curated shortlist tuned to your space, delivered in 5 business days.",
      highlights: [
        "A curator reviews your photos, brand, and tone",
        "Shortlist of 5 to 8 works suited to your space, with curator notes on each",
        "Sized, styled, and budget-matched to your brief",
        "One round of revisions if you'd like alternatives",
        "Clear next-step options, free QR-loan, paid loan, or outright purchase",
      ],
      howItWorks: [
        {
          title: "1. Tell us about the wall",
          body: "Share a photo, rough dimensions, and a short note on the space and the feel you're after.",
        },
        {
          title: "2. A curator reviews your brief",
          body: "A Wallplace curator matches available artists to your space, palette, scale, and audience.",
        },
        {
          title: "3. You get a shortlist",
          body: "5 to 8 works with curator notes, arrangement options, and price indications. Delivered by email within 5 business days.",
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
          q: `Do I pay for the art on top of the ${gbp(CURATION_TIERS.single_wall.priceGbp)}?`,
          a: "Arrangements vary by work. Many shortlists include free QR-loan options (zero ongoing cost, you share QR sales with the artist) and revenue-share arrangements. Paid-loan and outright purchase options are also shown, you pick what works for the space.",
        },
        {
          q: "When should I upgrade to Full space?",
          a: `When you have two or more walls and want them to feel coherent together. Full space (${gbp(CURATION_TIERS.full_space.priceGbp)}) considers grouping, palette, and flow across the whole venue, not just one wall.`,
        },
      ],
    },
  },
  {
    key: "full_space",
    label: "Full space",
    priceLabel: gbp(CURATION_TIERS.full_space.priceGbp),
    cta: `Book for ${gbp(CURATION_TIERS.full_space.priceGbp)}`,
    group: "one_off",
    popular: true,
    summary: {
      strapline: "Every wall in your venue, considered together.",
      bullets: [
        "Multi-wall shortlist with grouping notes",
        "Mood and palette guidance for a coherent look",
        "Optional revisions if you'd like alternatives",
        "Delivered within 5 business days",
      ],
    },
    detail: {
      strapline:
        "Every wall in your venue, considered together, palette, mood, and flow as one coherent look.",
      highlights: [
        "Multi-wall shortlist with grouping notes, which works belong side-by-side",
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
          a: `Yes, the ${gbp(CURATION_TIERS.full_space.priceGbp)} covers the curation. Each wall can independently use free QR-loan, paid loan, or purchase, depending on what suits the work and the room.`,
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
    },
  },
  {
    key: "bespoke",
    label: "Bespoke project",
    priceLabel: `From ${gbp(CURATION_TIERS.bespoke.priceGbp)}`,
    cta: "Request a quote",
    group: "one_off",
    summary: {
      strapline: "For hotels, hospitality groups, offices, or larger venues.",
      bullets: [
        "Full curation plan tailored to your brand and space",
        "Artist shortlist + commissioned work if needed",
        "Rotation schedule and installation guidance",
        "Quote based on scope, just tell us what you need",
      ],
    },
    detail: {
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
          a: "Yes, Bespoke scales from a single boutique hotel to a multi-site group.",
        },
        {
          q: "Can you work to a brand guideline?",
          a: "Yes. Share your brand guidelines and the curator will build matches within them.",
        },
      ],
    },
  },
  {
    key: "programme",
    label: "Programmes",
    priceLabel: `From ${gbp(CURATION_TIERS.programme.priceGbp)} per site per month`,
    cta: "Request a programme quote",
    group: "managed",
    summary: {
      strapline: "Original art on your walls all year, with rent paid to every artist.",
      bullets: [
        "Original art from local artists, rotated through the year",
        "Installed and labelled, with a QR card for every piece",
        "Rent paid to every artist on the wall",
        "Quoted per site on a twelve month term",
      ],
    },
    detail: {
      strapline:
        "Original art from local artists on your walls all year, rotated, installed and labelled, with rent paid to every artist on the wall. Quoted per site on a twelve month term. For offices, hotels, restaurants and any space that wants its walls handled.",
      highlights: [
        "Original art from local artists on your walls, all year round",
        "Rotated, installed and labelled, so pieces stay fresh without you lifting a finger",
        "Rent paid to every artist on the wall, not just a one-off fee",
        `Quoted per site once we understand your space, from ${gbp(CURATION_TIERS.programme.priceGbp)} a month`,
        "A twelve month term, built for offices, hotels, restaurants, and any space that wants its walls handled",
      ],
      howItWorks: [
        {
          title: "1. Tell us about your site",
          body: "Share the space, wall count, and the kind of art you want on show.",
        },
        {
          title: "2. We send a quote",
          body: "A tailored monthly or quarterly price for your site, usually within 2 business days.",
        },
        {
          title: "3. Install and label",
          body: "Original pieces go up, labelled with a QR card so guests can find and buy the artist's work.",
        },
        {
          title: "4. Rotate through the year",
          body: "Pieces refresh on schedule, and rent is paid to every artist on the wall for as long as their work is up.",
        },
      ],
      faq: [
        {
          q: "How is the price worked out?",
          a: `Every programme is quoted for your site, from ${gbp(CURATION_TIERS.programme.priceGbp)} a month depending on how many pieces and walls are involved.`,
        },
        {
          q: "Do the artists get paid, or just Wallplace?",
          a: "Every artist with a piece on your walls is paid rent for as long as it's up, alongside their share if a piece sells.",
        },
      ],
    },
  },
];

export const CURATED_TIER_KEYS = new Set<CuratedTierKey>(
  CURATED_TIERS.map((t) => t.key),
);

export function getCuratedTier(key: string): CuratedTier | undefined {
  return CURATED_TIERS.find((t) => t.key === key);
}

/**
 * The note under the "Ready to start?" footer on /curated/[tier].
 *
 * E38: this used to read "cancel any time" for every tier, including the
 * one-off tiers where there is no subscription and nothing to cancel. Only
 * the managed (recurring) tiers may promise cancellation; the one-off tiers
 * state what the payment actually is.
 *
 * Wallplace Programmes plan: the managed group's only member is now the
 * quoted `programme` tier, a termed arrangement rather than a self-serve
 * subscription, so the managed branch no longer promises "cancel any time"
 * either. The E38 bug (a false term of sale on a purchase-decision surface)
 * cuts both ways; this branch would repeat it in the other direction.
 */
export function curatedTierFooterNote(group: CuratedTierGroup): string {
  return group === "managed"
    ? "quoted per site, on a twelve month term."
    : "a one-off payment, no subscription.";
}
