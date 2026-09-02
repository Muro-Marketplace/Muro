"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Accordion from "@/components/Accordion";
import AnimateIn from "@/components/AnimateIn";
import ScrollButton from "@/components/ScrollButton";
import { CURATION_TIERS, PROGRAMME_LADDER, gbp } from "@/lib/curation-tiers";

// Wallplace Programmes plan, Task 3. This is the dedicated demand surface
// for the recurring, quoted `programme` tier: offices, hotels, restaurants,
// and any other space with a budget for its walls. /curated's Programmes
// card (CuratedClient.tsx) is the summary entry point into this page.

const WHATS_INCLUDED = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="20" height="20" rx="2" />
        <path d="M9 14.5l3 3 7-7" />
      </svg>
    ),
    title: "Curation",
    description: "A Wallplace curator selects original work to fit your space, your brand and your budget.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 25s9-8.5 9-14.5A9 9 0 105 10.5C5 16.5 14 25 14 25z" />
        <circle cx="14" cy="10.5" r="3" />
      </svg>
    ),
    title: "Original pieces from local artists",
    description: "Every piece is an original, not a print, made by an artist working near your site.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="3" width="10" height="4" rx="1" />
        <rect x="5" y="5" width="18" height="20" rx="2" />
        <path d="M9.5 16l3 3 6-7" />
      </svg>
    ),
    title: "Installation coordination",
    description: "Hanging is arranged and coordinated for you, not left for your team to work out.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="8" height="8" rx="1" />
        <path d="M16 6h8M16 10h8M4 18h20M4 22h14" />
      </svg>
    ),
    title: "Labels and QR cards",
    description: "Every piece carries the artist's name and a QR card, so anyone can find and buy the work.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 4v6h-6" />
        <path d="M5 20v-6h6" />
        <path d="M6.5 10a8 8 0 0113.7-4.3L23 10" />
        <path d="M21.5 18a8 8 0 01-13.7 4.3L5 18" />
      </svg>
    ),
    title: "Rotation through the year",
    description: "Pieces refresh on schedule, so the walls never go stale between visits.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="8" width="22" height="13" rx="2" />
        <circle cx="14" cy="14.5" r="3" />
        <path d="M6.5 8v13M21.5 8v13" />
      </svg>
    ),
    title: "Rent paid to every artist on the wall",
    description: "Every artist with work on your walls is paid monthly for as long as it's up, on top of their share if a piece sells.",
  },
];

// Review finding: these three images used to carry invented location
// captions ("Office reception, Manchester" and so on), and the same
// Unsplash photo IDs are captioned as different invented places on
// /curated and /venues. A sceptical buyer evaluating a 12-month
// commitment notices that, and it undermines the section's actual
// point, that the network is real. The images now run as unattributed
// atmosphere with no caption; the real, checkable proof is the link
// into /browse below, where every artist has a genuine portfolio.
//
// Nav-broadening plan: swapped the Unsplash stand-ins for Wallplace's
// own commissioned photography (an installation in progress, a QR
// scan, a working studio). Still no caption, same reasoning as above;
// alt text describes each scene honestly instead.
const PROOF_PLACEMENTS = [
  {
    src: "/images/programmes/programmes-installation.webp",
    alt: "Two people hanging a framed artwork on a wall, checking it with a spirit level",
  },
  {
    src: "/images/programmes/venues-qr-scan.webp",
    alt: "A café visitor scanning a QR code label beside a framed photograph on the wall",
  },
  {
    src: "/images/programmes/artists-studio.webp",
    alt: "A painter's studio with brushes, paint and canvases stacked against the wall",
  },
];

const FAQ_ITEMS = [
  {
    question: "What's the term?",
    answer: "Twelve months to start, then it rolls on until either side gives notice.",
  },
  {
    question: "How am I billed?",
    answer: "Whichever suits your business, monthly or quarterly.",
  },
  {
    question: "How often does the art rotate?",
    answer: "Twice a year is included. If you want fresher walls, quarterly rotation is available for an uplift agreed at quote time.",
  },
  {
    question: "What happens when a piece sells?",
    answer: "It's replaced at the next scheduled rotation, and the sale goes through Wallplace's normal artist split.",
  },
  {
    question: "Can staff buy what's on the wall?",
    answer: "Yes. Every piece carries a QR card. Scan it and staff or guests can buy the work directly, the same as anywhere else on Wallplace.",
  },
];

const SECTORS = ["Office", "Hotel", "Restaurant", "Co-working", "Retail", "Other"];

const ROTATION_OPTIONS: { value: "biannual" | "quarterly" | "none"; label: string }[] = [
  { value: "biannual", label: "Twice a year (included)" },
  { value: "quarterly", label: "Every quarter" },
  { value: "none", label: "Not sure yet" },
];

export default function ProgrammesClient() {
  const router = useRouter();

  const [form, setForm] = useState({
    venueName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    sector: "",
    siteCount: "",
    piecesEstimate: "",
    rotationCadence: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.venueName.trim() || !form.contactName.trim() || !form.contactEmail.trim()) {
      setError("Please fill in your company name, your name and email.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Reuses the Task 2 intake path exactly as /curated does (same
      // endpoint, same request/response contract), rather than a second
      // submission mechanism. tier is fixed to "programme"; there is
      // nothing to pick on this page.
      const res = await fetch("/api/curation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: "programme",
          venueName: form.venueName,
          contactName: form.contactName,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone,
          sector: form.sector || undefined,
          siteCount: form.siteCount ? Number(form.siteCount) : undefined,
          piecesEstimate: form.piecesEstimate ? Number(form.piecesEstimate) : undefined,
          rotationCadence: form.rotationCadence || undefined,
          referencesNotes: form.notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not submit. Please try again.");
        setSubmitting(false);
        return;
      }
      if (data.mode === "enquiry") {
        // Same outcome page /curated sends a programme enquiry to; the
        // copy there already reads correctly for a quote-first tier.
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
  const labelCls = "block text-xs font-medium text-muted uppercase tracking-wider mb-1";

  return (
    <div className="relative">
      {/* Hero. Leads with the audience that has the budget for this
          (offices, hotels, restaurants), matching /venues and /curated's
          immersive full-bleed hero pattern. One CTA into the intake form
          below; the from-price sits on the trust strip rather than the
          headline, so the opening line sells the offer, not the anchor. */}
      <section className="relative -mt-14 lg:-mt-16 min-h-screen flex flex-col pt-28 lg:pt-32 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          {/* Nav-broadening plan: real Wallplace-commissioned photography
              (a hotel lounge, the kind of site a programme is quoted
              for) replaces the earlier Unsplash stand-in. */}
          <Image
            src="/images/programmes/programmes-hotel-lounge.webp"
            alt="A hotel lounge with a large bare wall, ready for original art"
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
                Wallplace Programmes
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-tight text-white leading-[1.05] mb-6">
                Original art on rotation. The artist gets paid every month their work is up.
              </h1>
              <p className="text-lg lg:text-xl text-white/65 leading-relaxed max-w-xl mb-10">
                A quoted monthly programme for offices, hotels and restaurants that want their
                walls handled properly. Curated original pieces from local artists, installed,
                labelled and rotated through the year. Every artist on your wall is paid rent for
                as long as their work is up, not a one-off fee.
              </p>
              <Link
                href="#enquire"
                className="inline-flex items-center justify-center w-full sm:w-auto sm:min-w-[260px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
              >
                REQUEST A PROGRAMME QUOTE
              </Link>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-auto">
          <div className="py-3 flex justify-center">
            <ScrollButton targetId="programmes-content" label="See what's included" inline />
          </div>
          <div className="border-t border-white/10 bg-black/50 backdrop-blur-sm">
            <div className="max-w-[1200px] mx-auto px-6 py-3.5 flex items-center justify-center gap-3 text-xs text-white/40 tracking-wider uppercase flex-wrap">
              <span>From {gbp(CURATION_TIERS.programme.priceGbp)} per site, per month</span>
              <span className="w-1 h-1 rounded-full bg-white/30" />
              <span>Quoted within 2 business days</span>
            </div>
          </div>
        </div>
      </section>

      <div id="programmes-content" className="bg-background">
        {/* What's included */}
        <section className="py-20 lg:py-28">
          <div className="max-w-[1200px] mx-auto px-6">
            <AnimateIn>
              <div className="mb-10">
                <span className="text-xs font-medium text-accent uppercase tracking-wider">
                  What&rsquo;s included
                </span>
                <h2 className="text-3xl md:text-4xl mt-2">
                  Everything it takes to keep your walls working
                </h2>
                <p className="text-muted leading-relaxed mt-4 max-w-xl">
                  One quoted price per site, per month. Here&rsquo;s what it covers.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-5">
                {WHATS_INCLUDED.map((item) => (
                  <div
                    key={item.title}
                    className="flex items-start gap-4 bg-surface border border-border rounded-sm p-5 hover:shadow-sm transition-shadow duration-300"
                  >
                    <div className="text-accent shrink-0 mt-0.5">{item.icon}</div>
                    <div>
                      <h3 className="text-base font-medium mb-1">{item.title}</h3>
                      <p className="text-muted text-sm leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </AnimateIn>
          </div>
        </section>

        {/* Size guide, generated from PROGRAMME_LADDER. Adding a rung to
            that array is the only change a future repricing needs; this
            grid has no hand-written rows. */}
        <section className="py-20 lg:py-28 bg-surface">
          <div className="max-w-[1200px] mx-auto px-6">
            <AnimateIn>
              <div className="mb-10 max-w-2xl">
                <span className="text-xs font-medium text-accent uppercase tracking-wider">
                  Size guide
                </span>
                <h2 className="text-3xl md:text-4xl mt-2 mb-3">What a site costs</h2>
                <p className="text-muted leading-relaxed">
                  Every site is quoted individually. This is the shape pricing usually takes,
                  from a single feature wall to a fully dressed venue.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-5">
                {PROGRAMME_LADDER.map((rung) => (
                  <div
                    key={rung.pieces}
                    className="bg-white border border-border rounded-sm p-6 text-center"
                  >
                    <p className="font-serif text-4xl text-foreground">{rung.pieces}</p>
                    <p className="text-xs text-muted uppercase tracking-wider mt-1 mb-4">
                      {rung.pieces === 1 ? "piece" : "pieces"}
                    </p>
                    <p className="text-xl font-medium text-accent">{gbp(rung.monthlyGbp)}</p>
                    <p className="text-xs text-muted mt-0.5">a month</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted mt-6 max-w-xl">
                A guide to how pricing scales with the number of pieces. Your site gets its own
                quote and may land between rungs.
              </p>
              <p className="text-xs text-muted mt-2 max-w-xl">
                Prices are exclusive of VAT. If Wallplace becomes VAT registered, VAT will be
                added at the prevailing rate.
              </p>
            </AnimateIn>
          </div>
        </section>

        {/* Why it's different. Dark band for contrast, same weight as the
            page's most important claim. */}
        <section className="bg-foreground text-white py-20 lg:py-28">
          <div className="max-w-[1200px] mx-auto px-6">
            <AnimateIn>
              <div className="max-w-2xl">
                <p className="text-xs font-medium tracking-[0.25em] uppercase text-accent mb-4">
                  Why it&rsquo;s different
                </p>
                <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-white leading-[1.1] mb-6">
                  Agencies rent stock. We pay artists.
                </h2>
                <p className="text-white/70 leading-relaxed text-lg mb-5">
                  Most art-for-business suppliers are rental agencies. They license stock prints
                  or rotate a pool of anonymous work, take a monthly fee, and nobody local sees a
                  penny of it.
                </p>
                <p className="text-white/70 leading-relaxed text-lg">
                  Wallplace Programmes works differently. Every piece is an original, made by a
                  named local artist, and that artist is paid rent for as long as it&rsquo;s on
                  your wall, not a one-off fee. If a member of staff or a guest wants to buy
                  what&rsquo;s on display, they scan the QR card and the artist gets paid again.
                </p>
              </div>
            </AnimateIn>
          </div>
        </section>

        {/* Proof: every artist has a real, checkable portfolio. The
            images below are unattributed atmosphere, not claims about
            any specific venue; the actual proof is the link into
            /browse, where the portfolios are real and open to check. */}
        <section className="py-20 lg:py-28">
          <div className="max-w-[1200px] mx-auto px-6">
            <AnimateIn>
              <span className="text-xs font-medium text-accent uppercase tracking-wider">
                See it for yourself
              </span>
              <h2 className="text-3xl md:text-4xl mt-2 mb-3">Every artist has a real portfolio</h2>
              <p className="text-muted leading-relaxed mb-10 max-w-xl">
                No stock libraries and no anonymous pool. Every piece on Wallplace comes from a
                named artist with their own portfolio, open for you to look through before you
                commit to a programme.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {PROOF_PLACEMENTS.map((p) => (
                  <div key={p.src} className="aspect-[4/3] rounded-sm overflow-hidden relative">
                    <Image
                      src={p.src}
                      alt={p.alt}
                      fill
                      className="object-cover hover:scale-[1.03] transition-transform duration-500"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  </div>
                ))}
              </div>
              <Link
                href="/browse"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover transition-colors"
              >
                Browse the network
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            </AnimateIn>
          </div>
        </section>

        {/* Enquire, the Task 2 intake. Fixed to tier "programme"; nothing
            to pick, so no plan-selection UI like /curated needs. */}
        <section id="enquire" className="py-20 lg:py-28 bg-surface">
          <div className="max-w-[800px] mx-auto px-6">
            <div className="bg-surface border border-border rounded-sm p-6 sm:p-8">
              <h2 className="font-serif text-2xl text-foreground mb-1">Tell us about your site</h2>
              <p className="text-sm text-muted mb-6">
                Share a few details and we&rsquo;ll come back with a tailored quote within 2
                business days. Nothing is charged at this stage.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="venueName" className={labelCls}>Company or venue name *</label>
                    <input
                      id="venueName"
                      required
                      value={form.venueName}
                      onChange={(e) => update("venueName", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor="sector" className={labelCls}>Sector</label>
                    <select
                      id="sector"
                      value={form.sector}
                      onChange={(e) => update("sector", e.target.value)}
                      className={inputCls + " cursor-pointer"}
                    >
                      <option value="">Select…</option>
                      {SECTORS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="contactName" className={labelCls}>Your name *</label>
                    <input
                      id="contactName"
                      required
                      value={form.contactName}
                      onChange={(e) => update("contactName", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor="contactEmail" className={labelCls}>Work email *</label>
                    <input
                      id="contactEmail"
                      type="email"
                      required
                      value={form.contactEmail}
                      onChange={(e) => update("contactEmail", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="contactPhone" className={labelCls}>Phone</label>
                    <input
                      id="contactPhone"
                      type="tel"
                      value={form.contactPhone}
                      onChange={(e) => update("contactPhone", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor="siteCount" className={labelCls}>Number of sites</label>
                    <input
                      id="siteCount"
                      type="number"
                      min={1}
                      max={50}
                      value={form.siteCount}
                      onChange={(e) => update("siteCount", e.target.value)}
                      className={inputCls}
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div>
                    <label htmlFor="piecesEstimate" className={labelCls}>Roughly how many pieces?</label>
                    <input
                      id="piecesEstimate"
                      type="number"
                      min={1}
                      max={60}
                      value={form.piecesEstimate}
                      onChange={(e) => update("piecesEstimate", e.target.value)}
                      className={inputCls}
                      placeholder="e.g. 8"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="rotationCadence" className={labelCls}>Rotation preference</label>
                  <select
                    id="rotationCadence"
                    value={form.rotationCadence}
                    onChange={(e) => update("rotationCadence", e.target.value)}
                    className={inputCls + " cursor-pointer"}
                  >
                    <option value="">Select…</option>
                    {ROTATION_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="notes" className={labelCls}>Anything else?</label>
                  <textarea
                    id="notes"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    className={inputCls}
                    placeholder="Tell us about the space, the brand, or anything else useful for a quote."
                  />
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex items-center justify-between gap-4 pt-3 border-t border-border">
                  <p className="text-xs text-muted">
                    No charge at this stage. We&rsquo;ll email a tailored quote.
                  </p>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-3 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Submitting…" : "Request a programme quote"}
                  </button>
                </div>
              </form>
            </div>

            <p className="text-xs text-muted text-center mt-6">
              Only need one wall, not a programme?{" "}
              <Link href="/curated" className="text-accent hover:underline">
                See Wallplace Curated
              </Link>
              .
            </p>
          </div>
        </section>

        {/* Final CTA */}
        {/* FAQ */}
        <section className="py-20 lg:py-28">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-3xl md:text-4xl mb-10 text-center">Common questions</h2>
              <Accordion items={FAQ_ITEMS} />
            </div>
          </div>
        </section>

        <section className="py-20 lg:py-28 bg-foreground">
          <div className="max-w-[1200px] mx-auto px-6 text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl mb-4 max-w-2xl mx-auto text-white">
              Ready to put art to work?
            </h2>
            <p className="text-white/60 max-w-lg mx-auto mb-10 leading-relaxed">
              Quoted for your space. From {gbp(CURATION_TIERS.programme.priceGbp)} a site, per
              month, with a named artist paid every month their work is up.
            </p>
            <Link
              href="#enquire"
              className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-white/90 transition-colors"
            >
              REQUEST A PROGRAMME QUOTE
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
