// Body of /artists, factored out so /how-it-works can render it as
// the "For artists" scroll section. Hero stays on /artists itself;
// this component starts at "What you get" and runs through to the
// final CTA.

import Image from "next/image";
import Link from "next/link";
import Accordion from "@/components/Accordion";
import ArtistPricingCards from "@/components/ArtistPricingCards";
import AnimateIn from "@/components/AnimateIn";
import { FOUNDING_OFFER_SHORT, foundingOfferLine } from "@/lib/pricing";

const valueBlocks = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" />
        <path d="M3 7l9 4 9-4M12 11v10" />
      </svg>
    ),
    title: "High-intent venue demand",
    description: "Real venues actively looking for art, cafés, restaurants, hotels, galleries, offices, and salons.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l2 2 4-4" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
    title: "Curated marketplace",
    description: "Every artist is reviewed. Your work is matched to relevant spaces that suit your style and medium.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    title: "Your own online storefront",
    description: "Your Wallplace page is a real shop with checkout built in. You get a short link to put in your bio, so the people already following you have somewhere to buy.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12h8M12 8v8" />
      </svg>
    ),
    title: "Venue + online visibility",
    description: "Two ways in. Venues find you by style and medium, and you send your own audience straight to your shop.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
    title: "Fair platform fees",
    description: "Flat 15% platform fee. No gallery taking half. You keep the majority of every sale.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h18v18H3zM3 9h18M9 3v18" />
      </svg>
    ),
    title: "QR to checkout in seconds",
    description: "Customers scan the label beside your work, browse your whole shop, and buy. Every scan lands on the same page your link does.",
  },
];

const pipelineSteps = [
  "Apply",
  "Get Accepted",
  "Choose Plan",
  "Get Discovered",
  "Get Placed & Sold",
];

const comparisonData = [
  {
    category: "Platform fee",
    gallery: "40 to 60%",
    marketplace: "15 to 30%",
    instagram: "N/A",
    wallplace: "15%",
  },
  {
    category: "Physical display",
    gallery: "Yes",
    marketplace: "No",
    instagram: "No",
    wallplace: "Yes",
  },
  {
    category: "Takes payment",
    gallery: "Yes",
    marketplace: "Yes",
    instagram: "Not in the UK",
    wallplace: "Yes",
  },
  {
    category: "Logistics",
    gallery: "You handle it",
    marketplace: "You handle it",
    instagram: "You handle it",
    wallplace: "You handle it",
  },
  {
    category: "Cost",
    gallery: "£200 to 1,000/week",
    marketplace: "Free to £30/month",
    instagram: "Free",
    wallplace: "£9.99 to £49.99/month",
  },
  {
    category: "Audience",
    gallery: "Gallery visitors",
    marketplace: "Online browsers",
    instagram: "Followers",
    wallplace: "Venue footfall and your own followers",
  },
  {
    category: "Curation",
    gallery: "Selective",
    marketplace: "Open",
    instagram: "None",
    wallplace: "Selective",
  },
];

const faqItems = [
  {
    question: "I already have an Instagram following. What does Wallplace add?",
    answer:
      "Somewhere for them to buy. Instagram has no checkout in the UK, so a follower who wants a piece has to message you, and you handle the payment, the invoice and the paperwork yourself. Your Wallplace page is a real shop with a short link you can put in your bio, and it takes the payment, produces the invoice and sets the shipping options. We are not bringing you that audience, you already earned it. The venue side is what brings you people who have never heard of you.",
  },
  {
    question: "Will my work actually sell?",
    answer:
      "We can't guarantee sales, no honest platform can. What we do is connect you with venues that have real daily footfall and genuine interest in displaying art. Every piece gets a QR code linking to your sales page, and venues are matched to your style and medium. The rest is down to the work.",
  },
  {
    question: "Why should I pay for this?",
    answer:
      "Because a gallery would take 40 to 60% of every sale on top of significant upfront costs. Wallplace gives you a flat 15% platform fee, ongoing commercial visibility, sales infrastructure, and access to a growing network of venues, for less than the cost of a round of drinks per month.",
  },
  {
    question: "Do you handle delivery and installation?",
    answer:
      "Logistics are your responsibility as standard. We do offer optional installation add-on packages for artists who want that support. Once a venue expresses interest and you agree to place work there, we'll guide you through the process.",
  },
  {
    question: "Can I still sell through other channels?",
    answer:
      "Absolutely. Wallplace is an additional channel. You keep full control of your work and can sell through galleries, your own website, fairs, or anywhere else.",
  },
  {
    question: "What if I'm not accepted?",
    answer:
      "We give feedback where we can, and you're welcome to reapply after three months. A stronger portfolio edit or a clearer artist statement can change the outcome.",
  },
  {
    question: "What sizes work best?",
    answer:
      "Most venues suit work between A3 and A1. Once you're accepted and matched to a venue, we'll advise on sizing and presentation for that specific space.",
  },
  {
    question: "How does payment work when something sells?",
    answer:
      "The buyer pays through Wallplace. The funds are held until the artwork is confirmed delivered (or 14 days pass without a buyer dispute, whichever comes first), then we transfer your share, minus the platform fee, straight to your linked bank account.",
  },
  {
    question: "What happens if I cancel?",
    answer:
      "You can cancel with 30 days' notice, by email or from your account settings, and your membership stays active until the end of that period. You'll be responsible for collecting your work from venues within 30 days of cancelling. No cancellation fees, no hard feelings.",
  },
  {
    question: "Is my artwork protected?",
    answer:
      "Every image on Wallplace is served at reduced resolution with compressed quality, good enough for browsing, not enough for reproduction. Right-click saving is disabled, and images cannot be dragged or selected. The original high-resolution file never leaves your hands, we only display a web-optimised version. Our Terms of Service prohibit unauthorised reproduction, and every sale is tracked and attributed to you as the creator.",
  },
];

export default function ArtistGuide() {
  return (
    <div className="bg-background">
      {/* What You Get */}
      <section className="py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateIn>
            <h2 className="text-3xl md:text-4xl mb-10">What you get</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
              {valueBlocks.map((block) => (
                <div
                  key={block.title}
                  className="bg-surface border border-border rounded-sm p-4 sm:p-6 hover:shadow-sm transition-shadow duration-300"
                >
                  <div className="text-accent mb-3">{block.icon}</div>
                  <h3 className="text-base font-medium mb-1.5">{block.title}</h3>
                  <p className="text-muted text-sm leading-relaxed">
                    {block.description}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-sm text-muted max-w-2xl">
              We review every application for quality, consistency, and commercial viability. No AI-generated work. This is how we maintain venue trust and ensure your work reaches spaces that genuinely want it.
            </p>
          </AnimateIn>
        </div>
      </section>

      {/* Sell to your own audience. The storefront used to be described only
          as somewhere a venue QR code lands, so an artist arriving with an
          existing following was never told the one thing that would matter
          most to them. Server-rendered and static: no fabricated QR image,
          because a decorative code that does not scan is worse than none. */}
      <section className="py-20 lg:py-28 bg-surface border-y border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateIn>
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              <div>
                <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">
                  Sell to the people you already have
                </p>
                <h2 className="text-3xl md:text-4xl mb-6 leading-tight">
                  Instagram cannot take the money. Your shop can.
                </h2>
                <p className="text-muted leading-relaxed mb-4">
                  If someone already follows your work, they are the easiest sale
                  you will ever make. The bit that is missing is a checkout. Right
                  now that sale happens in your DMs, and you handle the payment,
                  the invoice and the chasing.
                </p>
                <p className="text-muted leading-relaxed mb-8">
                  Your Wallplace page is a real shop, and it works the day you are
                  accepted, with or without a placement. We are not claiming to
                  bring you that audience. You already earned it. The venues are
                  what bring you people who have never heard of you.
                </p>
                <ul className="space-y-3">
                  <li className="flex gap-3 text-sm">
                    <span className="text-accent mt-0.5">1.</span>
                    <span className="text-muted">
                      <span className="text-foreground font-medium">A short link.</span>{" "}
                      One line for your bio, and it goes straight to your work.
                    </span>
                  </li>
                  <li className="flex gap-3 text-sm">
                    <span className="text-accent mt-0.5">2.</span>
                    <span className="text-muted">
                      <span className="text-foreground font-medium">A QR code for your shop.</span>{" "}
                      Download it for a stall, a fair, or a story.
                    </span>
                  </li>
                  <li className="flex gap-3 text-sm">
                    <span className="text-accent mt-0.5">3.</span>
                    <span className="text-muted">
                      <span className="text-foreground font-medium">Ready-made posts.</span>{" "}
                      Pick a piece and the portal builds the image and the caption.
                    </span>
                  </li>
                </ul>
              </div>

              {/* A picture of the toolkit, drawn rather than screenshotted so it
                  cannot go stale against the portal. */}
              <div className="bg-background border border-border rounded-sm p-5 sm:p-6">
                <p className="text-[11px] font-medium tracking-wider uppercase text-muted mb-3">
                  In your artist portal
                </p>
                <div className="flex items-center gap-2 mb-5">
                  <code className="flex-1 min-w-0 truncate bg-surface border border-border rounded-sm px-3 py-2 text-sm text-foreground">
                    wallplace.co.uk/your-name
                  </code>
                  <span className="shrink-0 px-3 py-2 text-xs font-medium text-white bg-foreground rounded-sm">
                    Copy link
                  </span>
                </div>
                <p className="text-[11px] font-medium tracking-wider uppercase text-muted mb-2">
                  Caption, written for you
                </p>
                <div className="bg-surface border border-border rounded-sm p-4">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                    {'"Low Tide" by your name.\n\nOriginal work, available now in my shop.\nwallplace.co.uk/your-name'}
                  </p>
                </div>
                <p className="text-xs text-muted mt-4 leading-relaxed">
                  Plus a downloadable QR code for the same page, and a post image
                  sized for a feed, a story or a reel cover.
                </p>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* The Process. Renamed from "How it works" because the hero
          tabs already have a "01/02/03" how-it-works summary; this
          section is a timeline of the full artist journey from
          application to first sale, so "The Process" reads more
          accurately and avoids visually duplicating the hero label. */}
      <section className="py-20 lg:py-28 bg-foreground">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateIn>
            <h2 className="text-3xl md:text-4xl mb-14 text-white">The Process</h2>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-0">
              {pipelineSteps.map((step, i) => (
                <div key={step} className="flex items-center gap-4 md:gap-0">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-10 h-10 rounded-full bg-white text-foreground text-sm font-medium shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium whitespace-nowrap text-white">
                      {step}
                    </span>
                  </div>
                  {i < pipelineSteps.length - 1 && (
                    <div className="hidden md:block w-12 lg:w-16 h-px bg-white/20 mx-4" />
                  )}
                </div>
              ))}
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 lg:py-28">
        <AnimateIn>
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl mb-4">Membership</h2>
              <p className="text-muted max-w-lg mx-auto leading-relaxed">
                Less than the cost of a day at an art fair. Ongoing commercial visibility in independent venues.
              </p>
            </div>

            {/* Founding Artist Offer, derived from src/lib/pricing.ts */}
            <div className="border-2 border-accent rounded-sm p-6 md:p-8 mb-10 bg-accent/5 text-center">
              <p className="text-sm font-medium text-accent uppercase tracking-wider mb-2">
                Founding Artist Offer
              </p>
              <p className="text-2xl md:text-3xl font-serif text-accent">
                {FOUNDING_OFFER_SHORT}
              </p>
              <p className="mt-2 text-muted">
                {foundingOfferLine()}{" "}Places are confirmed when your application is accepted.
              </p>
            </div>

            {/* Pricing Cards, shared component with annual toggle */}
            <ArtistPricingCards ctaLabel="APPLY TO JOIN" />
          </div>
        </AnimateIn>
      </section>

      {/* Value Anchoring */}
      <section className="py-20 lg:py-28 bg-foreground">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-3xl md:text-4xl mb-10 text-white text-center">
            What &pound;9.99 a month gets you
          </h2>
          <div className="max-w-xl mx-auto space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div>
                <p className="text-sm font-medium text-white/60">
                  Gallery hire
                </p>
                <p className="text-sm text-white/40">
                  &pound;200 to 1,000/week
                </p>
              </div>
              <span className="text-red-400 text-lg">&times;</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div>
                <p className="text-sm font-medium text-white/60">
                  Art fair table
                </p>
                <p className="text-sm text-white/40">&pound;300 to 500/day</p>
              </div>
              <span className="text-red-400 text-lg">&times;</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div>
                <p className="text-sm font-medium text-white/60">
                  Instagram promotion
                </p>
                <p className="text-sm text-white/40">
                  &pound;50 to 200/month, no physical presence
                </p>
              </div>
              <span className="text-red-400 text-lg">&times;</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div>
                <p className="text-sm font-medium text-accent">
                  Wallplace Core
                </p>
                <p className="text-sm text-white/40">
                  &pound;9.99/month. Venue placements + your own online store. Free trial included.
                </p>
              </div>
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-accent"
              >
                <path d="M4 10.5l4.5 4.5L16 5" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-20 lg:py-28 bg-surface border-y border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-3xl md:text-4xl mb-10">
            How this is different
          </h2>
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 pr-4 font-medium text-muted text-xs uppercase tracking-wider w-1/5">
                    &nbsp;
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">
                    Galleries
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">
                    Online Marketplaces
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">
                    Instagram
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-accent text-xs uppercase tracking-wider">
                    Wallplace
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row) => (
                  <tr key={row.category} className="border-b border-border/60">
                    <td className="py-3.5 pr-4 font-medium text-foreground">
                      {row.category}
                    </td>
                    <td className="py-3.5 px-4 text-muted">{row.gallery}</td>
                    <td className="py-3.5 px-4 text-muted">
                      {row.marketplace}
                    </td>
                    <td className="py-3.5 px-4 text-muted">{row.instagram}</td>
                    <td className="py-3.5 px-4 text-foreground font-medium">
                      {row.wallplace}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Image Break */}
      <section className="relative h-64 lg:h-80 overflow-hidden">
        <Image src="https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=1920&h=400&fit=crop&crop=center" alt="Artist painting" fill className="object-cover" />
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative h-full flex items-center justify-center text-center px-6">
          <p className="text-white/80 text-lg lg:text-xl font-serif italic max-w-xl">&ldquo;Your studio is not a showroom. Independent venues are.&rdquo;</p>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl mb-10 text-center">
              Frequently asked questions
            </h2>
            <Accordion items={faqItems} />
          </div>
        </div>
      </section>

      {/* Venue Demand */}
      <section className="py-16 lg:py-20 bg-accent/5 border-y border-accent/10">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">Venues</p>
          <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-3">See the venues on Wallplace</h2>
          <p className="text-muted max-w-lg mx-auto mb-8">
            Venues on Wallplace and the styles and arrangements each one is open to. Enter your postcode to see who is near you.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/spaces" className="inline-flex items-center justify-center min-w-[200px] px-7 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
              SEE VENUES
            </Link>
            {/* Row A L163: this was a second differently-labelled button to
                the SAME /spaces URL, so the pair read as two things and did
                one. The postcode search lives on that page, so the second CTA
                is the quieter route to it rather than a rival to the first. */}
            <Link href="/spaces#postcode" className="inline-flex items-center justify-center min-w-[200px] px-7 py-3.5 border border-foreground/25 text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:border-foreground/50 transition-colors">
              SEARCH BY POSTCODE
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 lg:py-28 bg-foreground">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl mb-4 max-w-2xl mx-auto text-white">
            Your portfolio. Your storefront. Your venues. All in one place.
          </h2>
          <div className="mt-8">
            <Link href="/apply" className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-white/90 transition-colors">
              APPLY TO JOIN
            </Link>
          </div>
          <p className="mt-6 text-sm text-white/40">
            {FOUNDING_OFFER_SHORT}. Membership from &pound;9.99/month.
          </p>
          <p className="mt-2 text-[11px] text-white/40">
            Applications reviewed within 5 business days.
          </p>
        </div>
      </section>
    </div>
  );
}
