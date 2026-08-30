"use client";

import { useState, useEffect } from "react";
import { ARRANGEMENT_LABEL } from "@/lib/arrangement-labels";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import Accordion from "@/components/Accordion";
import AnimateIn from "@/components/AnimateIn";
import ScrollButton from "@/components/ScrollButton";
import {
  CURATED_TIERS,
  CURATED_TIER_KEYS,
  type CuratedTier,
  type CuratedTierKey,
} from "@/lib/curated-tiers";
import { CURATION_TIERS, gbp } from "@/lib/curation-tiers";

const ONE_OFF_TIERS = CURATED_TIERS.filter((t) => t.group === "one_off");
const MANAGED_TIERS = CURATED_TIERS.filter((t) => t.group === "managed");

const VENUE_TYPES = [
  "Café",
  "Restaurant",
  "Hotel",
  "Bar / pub",
  "Office",
  "Co-working",
  "Retail",
  "Clinic",
  "Gallery",
  "Event space",
  "Other",
];

const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Brief",
    body: "Tell us about the space, audience, and the feel you want.",
  },
  {
    n: "02",
    title: "Curate",
    body: "A Wallplace curator hand-picks 5 to 8 works that fit your brief.",
  },
  {
    n: "03",
    title: "Place",
    body: "Pick what you love. We arrange placement or purchase.",
  },
];

/* Where curators place art — illustrative venue-type strip. Photos are
 * reused from /venues' "Where art goes up" set; both pages are venue
 * surfaces so a small overlap is acceptable. Captions are deliberately
 * generic ("Boutique hotel, Margate") and not real client claims —
 * replace with attributed placements once we have any. */
const VENUE_PLACEMENTS = [
  {
    caption: "Boutique hotel, Margate",
    image:
      "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&h=450&fit=crop&crop=center",
  },
  {
    caption: "Members' club, Soho",
    image:
      "https://images.unsplash.com/photo-1525610553991-2bede1a236e2?w=600&h=450&fit=crop&crop=center",
  },
  {
    caption: "Independent café, Peckham",
    image:
      "https://images.unsplash.com/photo-1559329007-40df8a9345d8?w=600&h=450&fit=crop&crop=center",
  },
];

const FAQ_ITEMS = [
  {
    question: "Who is this for?",
    answer:
      "Cafés, restaurants, hotels, bars, offices, co-working spaces, clinics, retail. Any venue with walls and a sense of how they want them to feel.",
  },
  {
    question: "How is this different from just browsing artists?",
    answer:
      "Browsing is free and works if you know what you want. Curated is for venues who want a Wallplace curator to do the picking and the artist matching.",
  },
  {
    question: "How long does it take?",
    answer:
      "Most shortlists land within 5 business days of your brief. Bespoke projects start with a 30-minute scope call and the timeline is set from there.",
  },
  {
    question: "What's NOT included in the price?",
    answer:
      "The artwork itself. Curated covers the curation. Getting the art on the wall (free QR-loan, paid loan, or outright purchase) is arranged separately.",
  },
  {
    question: "What if I don't love any of the shortlist?",
    answer:
      `The ${gbp(CURATION_TIERS.single_wall.priceGbp)} and ${gbp(CURATION_TIERS.full_space.priceGbp)} plans include one revision round. If nothing fits at all, we refund in full.`,
  },
  {
    question: "How does the art actually get on the wall?",
    answer:
      "You pick from three placement methods: free QR-loan (the artist gets a share of QR sales, you pay nothing for the art), paid loan (a monthly fee to display), or outright purchase.",
  },
  {
    question: "Can I cancel a managed plan?",
    answer:
      "Yes, any time, no notice period. You keep the last shortlist.",
  },
  {
    question: "Do you visit in person?",
    answer:
      `Not on ${gbp(CURATION_TIERS.single_wall.priceGbp)} to ${gbp(CURATION_TIERS.managed_quarterly.priceGbp)} plans. Bespoke projects include a scope call and, where it makes sense, an on-site walkthrough.`,
  },
];

export default function CuratedClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cancelled = searchParams.get("cancelled") === "1";
  const { userType, loading: authLoading } = useAuth();

  const [selectedTier, setSelectedTier] = useState<CuratedTierKey | null>(null);
  const [form, setForm] = useState({
    venueName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    venueType: "",
    location: "",
    wallCount: "",
    budgetGbp: "",
    timeframe: "",
    styleNotes: "",
    audienceNotes: "",
    moodNotes: "",
    referencesNotes: "",
    // Placement method interest, maps to the three core Wallplace
    // commercial models. Multi-select because venues commonly consider
    // two.
    wantsQrLoan: false,
    wantsPaidLoan: false,
    wantsDirectPurchase: false,
  });

  // Budget is only meaningful for arrangements where the venue actually
  // spends money — paid loan (monthly fee) or direct purchase (outright
  // buy). For a QR-enabled loan the artwork is free on the wall and the
  // venue only pays if a QR scan results in a sale.
  const budgetRelevant = form.wantsPaidLoan || form.wantsDirectPurchase;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-select the tier when arriving from a /curated/[tier] CTA, e.g.
  // /curated?tier=full_space#brief. The downstream scroll-to-brief
  // effect (below) will then bring the form into view automatically.
  useEffect(() => {
    const tierParam = searchParams.get("tier");
    if (tierParam && CURATED_TIER_KEYS.has(tierParam as CuratedTierKey)) {
      setSelectedTier(tierParam as CuratedTierKey);
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedTier) {
      const el = document.getElementById("brief");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedTier]);

  // Wallplace Curated is a venue product. Artists who land here see
  // a polite redirect explaining it's not for them rather than the
  // venue-targeted briefing form. Hooks above must run before this
  // early return so React's hooks order stays consistent across
  // renders (otherwise auth-loading → loaded would change hook count).
  if (!authLoading && userType === "artist") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-serif mb-3">
            Wallplace Curated is for venues
          </h1>
          <p className="text-sm text-muted leading-relaxed mb-6">
            Curated is our hand-pick service for venues looking for artwork.
            Artists are matched <em>through</em> Curated, not <em>for</em> it.
            Keep building your portfolio and we&rsquo;ll surface you to
            venues that fit.
          </p>
          <Link
            href="/artist-portal"
            className="text-sm text-accent hover:underline"
          >
            Back to your portal →
          </Link>
        </div>
      </div>
    );
  }

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTier) return;
    if (!form.venueName.trim() || !form.contactName.trim() || !form.contactEmail.trim()) {
      setError("Please fill the venue, your name, and email.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/curation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: selectedTier,
          venueName: form.venueName,
          contactName: form.contactName,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone,
          venueType: form.venueType,
          location: form.location,
          wallCount: form.wallCount ? Number(form.wallCount) : undefined,
          budgetGbp: budgetRelevant ? form.budgetGbp : "",
          timeframe: form.timeframe,
          styleNotes: form.styleNotes,
          audienceNotes: form.audienceNotes,
          moodNotes: form.moodNotes,
          referencesNotes: form.referencesNotes,
          placementMethods: [
            form.wantsQrLoan ? "qr_loan" : null,
            form.wantsPaidLoan ? "paid_loan" : null,
            form.wantsDirectPurchase ? "direct_purchase" : null,
          ].filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not submit. Please try again.");
        setSubmitting(false);
        return;
      }
      if (data.mode === "checkout" && data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.mode === "enquiry") {
        router.push("/curated/enquiry-sent");
        return;
      }
      setError("Unexpected response. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60";
  const labelCls =
    "block text-xs font-medium text-muted uppercase tracking-wider mb-1";

  const selectedTierData = selectedTier
    ? CURATED_TIERS.find((t) => t.key === selectedTier)
    : null;

  return (
    <div className="relative">
      {/* Immersive hero — pulls behind the header with negative margin
          and matches the /artists & /venues hero pattern (full-bleed
          dark photo, dual CTA, trust strip on the dark band at the
          bottom). Gallery-interior shot with multiple framed artworks
          under spotlights — closer to what Curated actually delivers
          (a placed, lit hang) than the previous abstract close-up.
          Plan G Task 13 may still ship a custom brand asset later. */}
      <section className="relative -mt-14 lg:-mt-16 min-h-screen flex flex-col pt-28 lg:pt-32 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <Image
            src="/images/auth-bg.jpg"
            alt="Mt. Fitz Roy, Patagonia"
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/55 to-black/40" />
        </div>

        <div className="flex-1 flex items-center pb-24 lg:pb-28">
          <div className="max-w-[1200px] mx-auto px-6 w-full">
            <div className="max-w-2xl">
              <p className="text-xs font-medium tracking-[0.25em] uppercase text-accent mb-5">
                Wallplace Curated
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-tight text-white leading-[1.05] mb-6">
                Hand-picked art for your space.
              </h1>
              <p className="text-lg lg:text-xl text-white/65 leading-relaxed max-w-xl mb-10">
                Tell us about your space, audience, and the feel you want.
                Our curators hand-pick a shortlist of works from Wallplace
                artists that fit. From {gbp(CURATION_TIERS.single_wall.priceGbp)}.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Link
                  href="#plans"
                  className="inline-flex items-center justify-center w-full sm:w-auto sm:min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
                >
                  PICK A PLAN
                </Link>
                <Link
                  href="#how"
                  className="inline-flex items-center justify-center w-full sm:w-auto sm:min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-white/10 text-white border border-white/30 rounded-sm hover:bg-white/15 transition-colors backdrop-blur-sm"
                >
                  HOW IT WORKS
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator + trust strip on the dark band, matches the
            /artists hero pattern. */}
        <div className="relative z-10 mt-auto">
          <div className="py-3 flex justify-center">
            <ScrollButton
              targetId="curated-content"
              label="See how it works"
              inline
            />
          </div>
          <div className="border-t border-white/10 bg-black/50 backdrop-blur-sm">
            <div className="max-w-[1200px] mx-auto px-6 py-3.5 flex items-center justify-center gap-3 text-xs text-white/40 tracking-wider uppercase flex-wrap">
              <span>From {gbp(CURATION_TIERS.single_wall.priceGbp)}</span>
              <span className="w-1 h-1 rounded-full bg-white/30" />
              <span>Delivered in 5 business days</span>
              <span className="w-1 h-1 rounded-full bg-white/30" />
              <span>Cancel managed plans anytime</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stripe checkout cancellation banner. Surfaces between hero and
          page content rather than inside it so it reads as a status
          notification rather than a content section. */}
      {cancelled && (
        <div className="max-w-[1100px] mx-auto px-6 pt-8">
          <div className="bg-amber-50 border border-amber-200 rounded-sm px-4 py-3 text-sm text-amber-900">
            Checkout cancelled. Nothing has been charged. Pick a plan below
            to try again.
          </div>
        </div>
      )}

      <div id="curated-content" className="bg-background">
        {/* How it works — 3-step strip, demystifies the service in 10s */}
        <section id="how" className="py-20 lg:py-28">
          <div className="max-w-[1200px] mx-auto px-6">
            <AnimateIn>
              <h2 className="text-3xl md:text-4xl mb-12">How it works</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
                {HOW_IT_WORKS.map((step) => (
                  <div key={step.n}>
                    <span className="text-accent text-sm font-medium tracking-wider">
                      {step.n}
                    </span>
                    <h3 className="text-xl mt-2 mb-3 text-foreground">
                      {step.title}
                    </h3>
                    <p className="text-muted text-sm leading-relaxed">
                      {step.body}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-10 text-sm text-muted italic">
                Typical turnaround: 5 business days from brief to shortlist.
              </p>
            </AnimateIn>
          </div>
        </section>

        {/* Plans — equalised tier cards with "Most popular" + Read more */}
        <section id="plans" className="py-20 lg:py-28 bg-surface">
          <div className="max-w-[1200px] mx-auto px-6">
            <AnimateIn>
              <div className="mb-12 max-w-2xl">
                <h2 className="text-3xl md:text-4xl mb-3">Plans</h2>
                <p className="text-muted leading-relaxed">
                  One-off curation when you need it. Managed rotation when
                  you don&rsquo;t.
                </p>
              </div>

              {/* One-off group */}
              <div className="mb-12">
                <div className="flex items-baseline justify-between mb-5 flex-wrap gap-2">
                  <h3 className="font-serif text-2xl text-foreground">
                    One-off curation
                  </h3>
                  <p className="text-xs text-muted">
                    Pay once, we deliver your shortlist.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
                  {ONE_OFF_TIERS.map((t) => (
                    <TierCard
                      key={t.key}
                      tier={t}
                      selected={selectedTier === t.key}
                      onSelect={() => setSelectedTier(t.key)}
                    />
                  ))}
                </div>
              </div>

              {/* Managed group */}
              <div className="mb-14">
                <div className="flex items-baseline justify-between mb-5 flex-wrap gap-2">
                  <h3 className="font-serif text-2xl text-foreground">
                    Managed curation
                  </h3>
                  <p className="text-xs text-muted">
                    Ongoing rotation as a subscription. Cancel anytime.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                  {MANAGED_TIERS.map((t) => (
                    <TierCard
                      key={t.key}
                      tier={t}
                      selected={selectedTier === t.key}
                      onSelect={() => setSelectedTier(t.key)}
                    />
                  ))}
                </div>
              </div>

              {/* Value clarifier — Included / Priced separately / Upgrade */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
                <div className="bg-background border border-border rounded-sm p-5">
                  <p className="text-xs font-medium uppercase tracking-widest text-accent mb-2">
                    Included in any plan
                  </p>
                  <p className="text-sm text-foreground/85 leading-relaxed">
                    {`A curator’s time and judgement. A delivered shortlist with notes. One revision round on ${gbp(CURATION_TIERS.single_wall.priceGbp)} and ${gbp(CURATION_TIERS.full_space.priceGbp)} plans. Refund in full if nothing fits.`}
                  </p>
                </div>
                <div className="bg-background border border-border rounded-sm p-5">
                  <p className="text-xs font-medium uppercase tracking-widest text-accent mb-2">
                    Priced separately
                  </p>
                  <p className="text-sm text-foreground/85 leading-relaxed">
                    The artwork itself, free QR-loan, paid loan, or
                    direct purchase, your choice. Installation. Rotation
                    logistics on Bespoke.
                  </p>
                </div>
                <div className="bg-background border border-border rounded-sm p-5">
                  <p className="text-xs font-medium uppercase tracking-widest text-accent mb-2">
                    When to upgrade
                  </p>
                  <p className="text-sm text-foreground/85 leading-relaxed">
                    Single wall → Full space when you have 2+ walls or
                    want continuity across them. One-off → Managed when
                    refresh frequency matters more than spend.
                  </p>
                </div>
              </div>
            </AnimateIn>
          </div>
        </section>

        {/* Quote band — curator-voice line, NOT a fabricated testimonial */}
        <section className="relative h-64 lg:h-80 overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=1920&h=400&fit=crop&crop=center"
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-black/55" />
          <div className="relative h-full flex items-center justify-center text-center px-6">
            <div className="max-w-xl">
              <p className="text-white/85 text-lg lg:text-xl font-serif italic leading-relaxed">
                &ldquo;Walls do something to a room. We help you choose
                what.&rdquo;
              </p>
              <p className="mt-3 text-xs tracking-[0.25em] uppercase text-white/50">
                Wallplace curators
              </p>
            </div>
          </div>
        </section>

        {/* Where curators place art — illustrative venue-types strip */}
        <section className="py-20 lg:py-28">
          <div className="max-w-[1200px] mx-auto px-6">
            <AnimateIn>
              <h2 className="text-3xl md:text-4xl mb-3">
                Where curators place art
              </h2>
              <p className="text-muted leading-relaxed mb-12 max-w-xl">
                Examples of the kind of spaces Curated is designed for.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {VENUE_PLACEMENTS.map((v) => (
                  <div key={v.caption} className="group">
                    <div className="aspect-[4/3] rounded-sm overflow-hidden relative">
                      <Image
                        src={v.image}
                        alt={v.caption}
                        fill
                        className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                    </div>
                    <p className="mt-3 text-sm text-muted">{v.caption}</p>
                  </div>
                ))}
              </div>
            </AnimateIn>
          </div>
        </section>

        {/* FAQ — cross-cutting questions, surfaced on the index because
            tier-detail FAQs alone leave too many bounces. */}
        <section className="py-20 lg:py-28 bg-surface">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-3xl md:text-4xl mb-10 text-center">
                Common questions
              </h2>
              <Accordion items={FAQ_ITEMS} />
            </div>
          </div>
        </section>

        {/* Brief form — kept as-is structurally; gains a status banner
            at the top of the form panel showing the selected tier so
            the user always knows what they&rsquo;re submitting. */}
        <section id="brief" className="py-20 lg:py-28">
          <div className="max-w-[800px] mx-auto px-6">
            <div className="bg-surface border border-border rounded-sm p-6 sm:p-8">
              {/* In-panel status banner. NOT page-sticky — sits inside
                  the form card so the user can see it while filling
                  fields without it floating over the rest of the page. */}
              {selectedTierData ? (
                <div className="flex items-center justify-between gap-3 bg-accent/5 border border-accent/30 rounded-sm px-4 py-3 mb-6 flex-wrap">
                  <div className="text-sm">
                    <span className="text-muted">Selected: </span>
                    <span className="font-medium text-foreground">
                      {selectedTierData.label}
                    </span>
                    <span className="text-muted"> · </span>
                    <span className="font-medium text-accent">
                      {selectedTierData.priceLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTier(null)}
                    className="text-xs text-muted hover:text-accent underline underline-offset-2"
                  >
                    Change plan
                  </button>
                </div>
              ) : (
                <div className="bg-background border border-border rounded-sm px-4 py-3 mb-6 text-sm text-muted">
                  <Link href="#plans" className="text-accent hover:underline">
                    Pick a plan above
                  </Link>{" "}
                  first, then fill in the brief here.
                </div>
              )}

              <h2 className="font-serif text-2xl text-foreground mb-1">
                Tell us about your space
              </h2>
              <p className="text-sm text-muted mb-6">
                {!selectedTier
                  ? "We'll build a curated shortlist tuned to your space."
                  : selectedTier === "bespoke"
                    ? "We'll review your brief and email a tailored quote within 2 business days."
                    : selectedTier === "managed_monthly" ||
                      selectedTier === "managed_quarterly"
                      ? "We'll set up your subscription and send your first shortlist within 5 business days."
                      : "We'll confirm payment and email your shortlist within 5 business days."}
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Venue name *</label>
                    <input
                      required
                      value={form.venueName}
                      onChange={(e) => update("venueName", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Venue type</label>
                    <select
                      value={form.venueType}
                      onChange={(e) => update("venueType", e.target.value)}
                      className={inputCls + " cursor-pointer"}
                    >
                      <option value="">Select…</option>
                      {VENUE_TYPES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Your name *</label>
                    <input
                      required
                      value={form.contactName}
                      onChange={(e) => update("contactName", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Email *</label>
                    <input
                      type="email"
                      required
                      value={form.contactEmail}
                      onChange={(e) => update("contactEmail", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input
                      type="tel"
                      value={form.contactPhone}
                      onChange={(e) => update("contactPhone", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Location (town/city)</label>
                    <input
                      value={form.location}
                      onChange={(e) => update("location", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Placement method preferences. Three methods mirror the
                    core Wallplace commercial models: QR-enabled loan
                    (free on wall, venue earns a share of QR sales), paid
                    loan (venue pays a monthly fee to display), direct
                    purchase (venue buys outright). Venues can pick more
                    than one. */}
                <div>
                  <label className={labelCls}>
                    How would you like to get the art?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <MethodCheckbox
                      checked={form.wantsQrLoan}
                      onChange={(v) => update("wantsQrLoan", v)}
                      title="QR-enabled loan"
                      desc="Free on your wall. Share QR sales with the artist."
                    />
                    <MethodCheckbox
                      checked={form.wantsPaidLoan}
                      onChange={(v) => update("wantsPaidLoan", v)}
                      title={ARRANGEMENT_LABEL.paid_loan}
                      desc="Pay the artist a monthly fee to display their work."
                    />
                    <MethodCheckbox
                      checked={form.wantsDirectPurchase}
                      onChange={(v) => update("wantsDirectPurchase", v)}
                      title={ARRANGEMENT_LABEL.purchase}
                      desc="Buy a piece outright for your permanent collection."
                    />
                  </div>
                </div>

                <div
                  className={`grid grid-cols-1 gap-4 ${budgetRelevant ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
                >
                  <div>
                    <label className={labelCls}>Wall count</label>
                    <input
                      type="number"
                      min={0}
                      value={form.wallCount}
                      onChange={(e) => update("wallCount", e.target.value)}
                      className={inputCls}
                      placeholder="e.g. 3"
                    />
                  </div>
                  {budgetRelevant && (
                    <div>
                      <label className={labelCls}>Budget (£)</label>
                      <input
                        value={form.budgetGbp}
                        onChange={(e) => update("budgetGbp", e.target.value)}
                        className={inputCls}
                        placeholder="e.g. 500 or 1000 to 2500"
                      />
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>Timeframe</label>
                    <input
                      value={form.timeframe}
                      onChange={(e) => update("timeframe", e.target.value)}
                      className={inputCls}
                      placeholder="e.g. ASAP, within 2 weeks"
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Style you like</label>
                  <textarea
                    rows={2}
                    value={form.styleNotes}
                    onChange={(e) => update("styleNotes", e.target.value)}
                    className={inputCls}
                    placeholder="e.g. muted minimalist photography, bold colour abstracts, urban street scenes"
                  />
                </div>

                <div>
                  <label className={labelCls}>Audience / guests</label>
                  <textarea
                    rows={2}
                    value={form.audienceNotes}
                    onChange={(e) => update("audienceNotes", e.target.value)}
                    className={inputCls}
                    placeholder="Who's in your space, their taste, demographic, time of day"
                  />
                </div>

                <div>
                  <label className={labelCls}>Mood / atmosphere</label>
                  <textarea
                    rows={2}
                    value={form.moodNotes}
                    onChange={(e) => update("moodNotes", e.target.value)}
                    className={inputCls}
                    placeholder="Calm, energetic, cosy, clean, warm, considered…"
                  />
                </div>

                <div>
                  <label className={labelCls}>
                    References, links, or anything else
                  </label>
                  <textarea
                    rows={3}
                    value={form.referencesNotes}
                    onChange={(e) =>
                      update("referencesNotes", e.target.value)
                    }
                    className={inputCls}
                    placeholder="Share Instagram links, Pinterest boards, or photos of the space (paste URLs)."
                  />
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
                  <p className="text-xs text-muted">
                    {!selectedTier
                      ? "Select a plan above to continue."
                      : selectedTier === "bespoke"
                        ? "No charge yet, we'll email a tailored quote."
                        : selectedTier === "managed_monthly" ||
                          selectedTier === "managed_quarterly"
                          ? `You'll be sent to secure Stripe checkout. Subscription: ${selectedTierData?.priceLabel}. Cancel anytime.`
                          : `You'll be sent to secure Stripe checkout to pay ${selectedTierData?.priceLabel}.`}
                  </p>
                  <button
                    type="submit"
                    disabled={!selectedTier || submitting}
                    className="px-6 py-3 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting
                      ? "Submitting…"
                      : !selectedTier
                        ? "Select a plan"
                        : selectedTier === "bespoke"
                          ? "Request quote"
                          : selectedTier === "managed_monthly"
                            ? `Subscribe, ${gbp(CURATION_TIERS.managed_monthly.priceGbp)}/mo`
                            : selectedTier === "managed_quarterly"
                              ? `Subscribe, ${gbp(CURATION_TIERS.managed_quarterly.priceGbp)}/qtr`
                              : `Pay ${selectedTierData?.priceLabel}`}
                  </button>
                </div>
              </form>
            </div>

            <p className="text-xs text-muted text-center mt-6">
              Already on Wallplace?{" "}
              <Link
                href="/venue-portal"
                className="text-accent hover:underline"
              >
                Log in to your venue portal
              </Link>
              .
            </p>
          </div>
        </section>

        {/* Final CTA — dark band matching /artists & /venues final CTAs */}
        <section className="py-20 lg:py-28 bg-foreground">
          <div className="max-w-[1200px] mx-auto px-6 text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl mb-4 max-w-2xl mx-auto text-white">
              Hand-picked art for your space.
            </h2>
            <p className="text-white/60 max-w-lg mx-auto mb-10 leading-relaxed">
              From {gbp(CURATION_TIERS.single_wall.priceGbp)} · 5 business days · No long-term commitment.
            </p>
            <Link
              href="#plans"
              className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-white/90 transition-colors"
            >
              PICK A PLAN
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function TierCard({
  tier,
  selected,
  onSelect,
}: {
  tier: CuratedTier;
  selected: boolean;
  onSelect: () => void;
}) {
  // Two affordances per card:
  //  - inner <button> = primary "select this plan" action; selecting
  //    auto-scrolls to the brief form below.
  //  - separate footer <Link> = secondary "Read more →" navigation to
  //    /curated/{key} for the deep-dive page.
  // These live as siblings inside a styled wrapper rather than nested,
  // because nesting an <a> inside a <button> is invalid HTML and would
  // also conflate the two intents.
  return (
    <div
      className={`relative bg-white border rounded-sm flex flex-col h-full transition-colors ${
        selected
          ? "border-accent ring-2 ring-accent/20"
          : "border-border hover:border-foreground/30"
      }`}
    >
      {tier.popular && (
        <span className="absolute top-3 right-3 text-[10px] font-medium uppercase tracking-[0.15em] bg-accent text-white px-2 py-1 rounded-sm">
          Most popular
        </span>
      )}
      <button
        type="button"
        onClick={onSelect}
        className="text-left p-6 flex-1 flex flex-col items-start cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm"
      >
        <p className="text-xs font-medium uppercase tracking-wider text-muted mb-2">
          {tier.label}
        </p>
        <p className="font-serif text-3xl text-foreground mb-2">
          {tier.priceLabel}
        </p>
        <p className="text-sm text-foreground mb-4">{tier.summary.strapline}</p>
        <ul className="space-y-2 mb-5">
          {tier.summary.bullets.map((b) => (
            <li key={b} className="flex gap-2 text-sm text-muted">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="#C17C5A"
                strokeWidth="2"
                strokeLinecap="round"
                className="mt-1 shrink-0"
              >
                <polyline points="2 7 5.5 10.5 12 3.5" />
              </svg>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <span
          className={`mt-auto inline-flex items-center gap-1 text-sm font-medium ${
            selected ? "text-accent" : "text-foreground"
          }`}
        >
          {selected ? "Selected" : tier.cta}
          <svg
            width="13"
            height="13"
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
        </span>
      </button>
      <div className="px-6 py-3 border-t border-border/60">
        <Link
          href={`/curated/${tier.key}`}
          className="text-xs text-muted hover:text-accent transition-colors inline-flex items-center gap-1"
        >
          Read the full plan
          <svg
            width="11"
            height="11"
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

function MethodCheckbox({
  checked,
  onChange,
  title,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`text-left p-3 rounded-sm border transition-colors ${
        checked
          ? "bg-accent/5 border-accent ring-1 ring-accent/20"
          : "bg-background border-border hover:border-foreground/30"
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 w-4 h-4 shrink-0 rounded-[3px] border flex items-center justify-center ${
            checked ? "bg-accent border-accent" : "border-border"
          }`}
        >
          {checked && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 14 14"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <polyline points="2 7 5.5 10.5 12 3.5" />
            </svg>
          )}
        </span>
        <div>
          <p
            className={`text-sm font-medium ${checked ? "text-accent" : "text-foreground"}`}
          >
            {title}
          </p>
          <p className="text-[11px] text-muted leading-snug mt-0.5">{desc}</p>
        </div>
      </div>
    </button>
  );
}
