"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";

type TierKey = "single_wall" | "full_space" | "bespoke" | "managed_monthly" | "managed_quarterly";

interface Tier {
  key: TierKey;
  label: string;
  priceLabel: string;
  strapline: string;
  bullets: string[];
  cta: string;
  group: "one_off" | "managed";
}

const ONE_OFF_TIERS: Tier[] = [
  {
    key: "single_wall",
    label: "Single wall",
    priceLabel: "£49",
    strapline: "One feature wall, hand-picked.",
    bullets: [
      "Shortlist of 5–8 works suited to your space",
      "Size, style and budget matched to your brief",
      "Delivered by email within 5 business days",
    ],
    cta: "Book for £49",
    group: "one_off",
  },
  {
    key: "full_space",
    label: "Full space",
    priceLabel: "£149",
    strapline: "Every wall in your venue, considered together.",
    bullets: [
      "Multi-wall shortlist with grouping notes",
      "Mood and palette guidance for a coherent look",
      "Optional revisions if you'd like alternatives",
      "Delivered within 5 business days",
    ],
    cta: "Book for £149",
    group: "one_off",
  },
  {
    key: "bespoke",
    label: "Bespoke project",
    priceLabel: "From £299",
    strapline: "For hotels, hospitality groups, offices, or larger venues.",
    bullets: [
      "Full curation plan tailored to your brand and space",
      "Artist shortlist + commissioned work if needed",
      "Rotation schedule and installation guidance",
      "Quote based on scope, just tell us what you need",
    ],
    cta: "Request a quote",
    group: "one_off",
  },
];

const MANAGED_TIERS: Tier[] = [
  {
    key: "managed_monthly",
    label: "Monthly rotation",
    priceLabel: "£79.99 / month",
    strapline: "New shortlist every month, walls kept fresh.",
    bullets: [
      "New curated shortlist each month",
      "Rotation suggestions tuned to season and traffic",
      "Priority support and swap coordination",
      "Cancel anytime",
    ],
    cta: "Start monthly, £79.99/mo",
    group: "managed",
  },
  {
    key: "managed_quarterly",
    label: "Quarterly refresh",
    priceLabel: "£199.99 / quarter",
    strapline: "Seasonal refresh, less admin.",
    bullets: [
      "One considered refresh every three months",
      "Works best paired with a rotating loan arrangement",
      "Seasonal mood guidance included",
      "Cancel anytime",
    ],
    cta: "Start quarterly, £199.99/qtr",
    group: "managed",
  },
];

const ALL_TIERS = [...ONE_OFF_TIERS, ...MANAGED_TIERS];

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

export default function CuratedClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cancelled = searchParams.get("cancelled") === "1";
  const { userType, loading: authLoading } = useAuth();

  // Wallplace Curated is a venue product. Artists who land here see
  // a polite redirect explaining it's not for them rather than the
  // venue-targeted briefing form.
  if (!authLoading && userType === "artist") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-serif mb-3">Wallplace Curated is for venues</h1>
          <p className="text-sm text-muted leading-relaxed mb-6">
            Curated is our hand-pick service for venues looking for artwork.
            Artists are matched <em>through</em> Curated, not <em>for</em> it — keep building your portfolio and we&rsquo;ll surface you to venues that fit.
          </p>
          <Link href="/artist-portal" className="text-sm text-accent hover:underline">
            Back to your portal →
          </Link>
        </div>
      </div>
    );
  }

  const [selectedTier, setSelectedTier] = useState<TierKey | null>(null);
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
    // Placement method interest, maps to the three core Wallplace commercial
    // models. Multi-select because venues commonly consider two.
    wantsQrLoan: false,
    wantsPaidLoan: false,
    wantsDirectPurchase: false,
  });

  // Budget is only meaningful for arrangements where the venue actually
  // spends money, paid loan (monthly fee) or direct purchase (outright
  // buy). For a QR-enabled loan the artwork is free on the wall and the
  // venue only pays if a QR scan results in a sale.
  const budgetRelevant = form.wantsPaidLoan || form.wantsDirectPurchase;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTier) {
      const el = document.getElementById("brief");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedTier]);

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

  const inputCls = "w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60";
  const labelCls = "block text-xs font-medium text-muted uppercase tracking-wider mb-1";

  return (
    <div>
      {/* Hero, same banner image as the homepage */}
      <section className="relative -mt-14 lg:-mt-16 min-h-[70vh] lg:min-h-[80vh] flex items-center overflow-hidden bg-[#1A1A1A]">
        <div className="absolute inset-0 z-0">
          <Image
            src="https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1920&h=1080&fit=crop&crop=center"
            alt="Gallery interior"
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/55 to-black/45" />
        </div>
        <div className="relative z-10 max-w-[1000px] mx-auto px-6 text-center pt-28 pb-16 lg:pt-36 lg:pb-24 w-full">
          <p className="text-xs font-medium tracking-[0.25em] uppercase text-accent mb-5">
            Wallplace Curated
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-tight text-white mb-6">
            Art on your walls, chosen by experts.
          </h1>
          <p className="text-lg text-white/75 max-w-2xl mx-auto leading-relaxed">
            Tell us about your space, the style, the audience, the mood you want. Our curators hand-pick a shortlist of works from Wallplace artists that fit. You decide what goes on the wall.
          </p>
        </div>
      </section>

      {cancelled && (
        <div className="max-w-[1000px] mx-auto px-6 mb-8">
          <div className="bg-amber-50 border border-amber-200 rounded-sm px-4 py-3 text-sm text-amber-900">
            Checkout cancelled. Nothing has been charged, pick a tier below to try again.
          </div>
        </div>
      )}

      {/* One-off tiers, items-start keeps each card at its natural height
          with content aligned to the top, rather than stretching shorter
          cards and vertically centring the copy. */}
      <section className="pt-20 lg:pt-28 pb-10">
        <div className="max-w-[1100px] mx-auto px-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-serif text-2xl text-foreground">One-off curation</h2>
            <p className="text-xs text-muted">Pay once, we deliver your shortlist.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {ONE_OFF_TIERS.map((t) => (
              <TierCard key={t.key} tier={t} selected={selectedTier === t.key} onSelect={() => setSelectedTier(t.key)} />
            ))}
          </div>
        </div>
      </section>

      {/* Managed subscription tiers */}
      <section className="pb-16">
        <div className="max-w-[1100px] mx-auto px-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-serif text-2xl text-foreground">Managed curation</h2>
            <p className="text-xs text-muted">Ongoing rotation as a subscription. Cancel anytime.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {MANAGED_TIERS.map((t) => (
              <TierCard key={t.key} tier={t} selected={selectedTier === t.key} onSelect={() => setSelectedTier(t.key)} />
            ))}
          </div>
        </div>
      </section>

      {/* Brief form */}
      <section id="brief" className="pb-20">
        <div className="max-w-[800px] mx-auto px-6">
          <div className="bg-surface border border-border rounded-sm p-6 sm:p-8">
            <h2 className="font-serif text-2xl text-foreground mb-1">Tell us about your space</h2>
            <p className="text-sm text-muted mb-6">
              {!selectedTier
                ? "Pick a tier above first, then fill in the brief here."
                : selectedTier === "bespoke"
                  ? "We'll review your brief and email a tailored quote within 2 business days."
                  : selectedTier === "managed_monthly" || selectedTier === "managed_quarterly"
                    ? "We'll set up your subscription and send your first shortlist within 5 business days."
                    : "We'll confirm payment and email your shortlist within 5 business days."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Venue name *</label>
                  <input required value={form.venueName} onChange={(e) => update("venueName", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Venue type</label>
                  <select value={form.venueType} onChange={(e) => update("venueType", e.target.value)} className={inputCls + " cursor-pointer"}>
                    <option value="">Select…</option>
                    {VENUE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Your name *</label>
                  <input required value={form.contactName} onChange={(e) => update("contactName", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Email *</label>
                  <input type="email" required value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Phone</label>
                  <input type="tel" value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Location (town/city)</label>
                  <input value={form.location} onChange={(e) => update("location", e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* Placement method preferences. Three methods mirror the core
                  Wallplace commercial models: QR-enabled loan (free on
                  wall, venue earns a share of QR sales), paid loan (venue
                  pays a monthly fee to display), direct purchase (venue
                  buys outright). Venues can pick more than one. */}
              <div>
                <label className={labelCls}>How would you like to get the art?</label>
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
                    title="Paid loan"
                    desc="Pay the artist a monthly fee to display their work."
                  />
                  <MethodCheckbox
                    checked={form.wantsDirectPurchase}
                    onChange={(v) => update("wantsDirectPurchase", v)}
                    title="Direct purchase"
                    desc="Buy a piece outright for your permanent collection."
                  />
                </div>
              </div>

              <div className={`grid grid-cols-1 gap-4 ${budgetRelevant ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                <div>
                  <label className={labelCls}>Wall count</label>
                  <input type="number" min={0} value={form.wallCount} onChange={(e) => update("wallCount", e.target.value)} className={inputCls} placeholder="e.g. 3" />
                </div>
                {budgetRelevant && (
                  <div>
                    <label className={labelCls}>Budget (£)</label>
                    <input value={form.budgetGbp} onChange={(e) => update("budgetGbp", e.target.value)} className={inputCls} placeholder="e.g. 500 or 1000–2500" />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Timeframe</label>
                  <input value={form.timeframe} onChange={(e) => update("timeframe", e.target.value)} className={inputCls} placeholder="e.g. ASAP, within 2 weeks" />
                </div>
              </div>

              <div>
                <label className={labelCls}>Style you like</label>
                <textarea rows={2} value={form.styleNotes} onChange={(e) => update("styleNotes", e.target.value)} className={inputCls} placeholder="e.g. muted minimalist photography, bold colour abstracts, urban street scenes" />
              </div>

              <div>
                <label className={labelCls}>Audience / guests</label>
                <textarea rows={2} value={form.audienceNotes} onChange={(e) => update("audienceNotes", e.target.value)} className={inputCls} placeholder="Who's in your space, their taste, demographic, time of day" />
              </div>

              <div>
                <label className={labelCls}>Mood / atmosphere</label>
                <textarea rows={2} value={form.moodNotes} onChange={(e) => update("moodNotes", e.target.value)} className={inputCls} placeholder="Calm, energetic, cosy, clean, warm, considered…" />
              </div>

              <div>
                <label className={labelCls}>References, links, or anything else</label>
                <textarea rows={3} value={form.referencesNotes} onChange={(e) => update("referencesNotes", e.target.value)} className={inputCls} placeholder="Share Instagram links, Pinterest boards, or photos of the space (paste URLs)." />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
                <p className="text-xs text-muted">
                  {!selectedTier
                    ? "Select a tier above to continue."
                    : selectedTier === "bespoke"
                      ? "No charge yet, we'll email a tailored quote."
                      : selectedTier === "managed_monthly" || selectedTier === "managed_quarterly"
                        ? `You'll be sent to secure Stripe checkout. Subscription: ${ALL_TIERS.find((t) => t.key === selectedTier)?.priceLabel}. Cancel anytime.`
                        : `You'll be sent to secure Stripe checkout to pay ${ALL_TIERS.find((t) => t.key === selectedTier)?.priceLabel}.`}
                </p>
                <button
                  type="submit"
                  disabled={!selectedTier || submitting}
                  className="px-6 py-3 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting
                    ? "Submitting…"
                    : !selectedTier
                      ? "Select a tier"
                      : selectedTier === "bespoke"
                        ? "Request quote"
                        : selectedTier === "managed_monthly"
                          ? "Subscribe, £79.99/mo"
                          : selectedTier === "managed_quarterly"
                            ? "Subscribe, £199.99/qtr"
                            : `Pay ${ALL_TIERS.find((t) => t.key === selectedTier)?.priceLabel}`}
                </button>
              </div>
            </form>
          </div>

          <p className="text-xs text-muted text-center mt-6">
            Already on Wallplace?{" "}
            <Link href="/venue-portal" className="text-accent hover:underline">Log in to your venue portal</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}

function TierCard({ tier, selected, onSelect }: { tier: Tier; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left bg-white border rounded-sm p-6 transition-colors flex flex-col items-start h-full ${selected ? "border-accent ring-2 ring-accent/20" : "border-border hover:border-foreground/30"}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted mb-2">{tier.label}</p>
      <p className="font-serif text-3xl text-foreground mb-2">{tier.priceLabel}</p>
      <p className="text-sm text-foreground mb-4">{tier.strapline}</p>
      <ul className="space-y-2 mb-5">
        {tier.bullets.map((b) => (
          <li key={b} className="flex gap-2 text-sm text-muted">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinecap="round" className="mt-1 shrink-0"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <span className={`inline-flex items-center gap-1 text-sm font-medium ${selected ? "text-accent" : "text-foreground"}`}>
        {selected ? "Selected" : tier.cta}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
      </span>
    </button>
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
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="2 7 5.5 10.5 12 3.5" />
            </svg>
          )}
        </span>
        <div>
          <p className={`text-sm font-medium ${checked ? "text-accent" : "text-foreground"}`}>{title}</p>
          <p className="text-[11px] text-muted leading-snug mt-0.5">{desc}</p>
        </div>
      </div>
    </button>
  );
}
