import { Metadata } from "next";
import Image from "next/image";
import Button from "@/components/Button";
import Accordion from "@/components/Accordion";
import AnimateIn from "@/components/AnimateIn";
import ScrollButton from "@/components/ScrollButton";

export const metadata: Metadata = {
  title: "For Artists – Wallplace",
  description:
    "Access high-intent venue demand. Get discovered by cafés, restaurants, hotels, galleries, and offices. Curated visibility for commercial spaces.",
};

const valueBlocks = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" />
        <path d="M3 7l9 4 9-4M12 11v10" />
      </svg>
    ),
    title: "High-intent venue demand",
    description: "Real venues actively looking for art – cafés, restaurants, hotels, galleries, offices, and salons.",
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
    title: "Sales infrastructure",
    description: "QR codes, online listings, payment processing – everything a buyer needs to purchase your work.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12h8M12 8v8" />
      </svg>
    ),
    title: "Commercial visibility",
    description: "Your profile seen by venues filtering for your style. Curated visibility, not algorithmic noise.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
    title: "Fair platform fees",
    description: "0–10% platform fee. No gallery taking half. You keep the majority of every sale.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h18v18H3zM3 9h18M9 3v18" />
      </svg>
    ),
    title: "Real commercial channel",
    description: "Physical spaces, not another feed. Daily footfall from people who are already there.",
  },
];

const pipelineSteps = [
  "Apply",
  "Get Accepted",
  "Choose Plan",
  "Get Discovered",
  "Get Placed & Sold",
];

const coreFeatures = [
  "Marketplace profile",
  "Up to 5 works listed",
  "Venue enquiry inbox",
  "QR codes & payment processing",
  "Basic analytics",
  "10% platform fee on sales",
];

const premiumFeatures = [
  "Everything in Core",
  "Up to 15 works listed",
  "Featured profile placement",
  "Priority venue matching",
  "Full analytics dashboard",
  "Dedicated social feature monthly",
  "5% platform fee on sales",
];

const proFeatures = [
  "Everything in Premium",
  "Unlimited works listed",
  "Top-tier profile placement",
  "AI-powered venue matching",
  "White-glove onboarding",
  "0% platform fee on sales",
];

const comparisonData = [
  {
    category: "Platform fee",
    gallery: "40–60%",
    marketplace: "15–30%",
    instagram: "N/A",
    wallplace: "0–10%",
  },
  {
    category: "Physical display",
    gallery: "Yes",
    marketplace: "No",
    instagram: "No",
    wallplace: "Yes",
  },
  {
    category: "Logistics",
    gallery: "You handle it",
    marketplace: "You handle it",
    instagram: "You handle it",
    wallplace: "You handle it (add-on packages available)",
  },
  {
    category: "Cost",
    gallery: "£200–1,000/week",
    marketplace: "Free–£30/month",
    instagram: "Free",
    wallplace: "£14.99–£59.99/month",
  },
  {
    category: "Audience",
    gallery: "Gallery visitors",
    marketplace: "Online browsers",
    instagram: "Followers",
    wallplace: "Daily venue footfall",
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
    question: "Will my work actually sell?",
    answer:
      "We can't guarantee sales – no honest platform can. What we do is connect you with venues that have real daily footfall and genuine interest in displaying art. Every piece gets a QR code linking to your sales page, and venues are matched to your style and medium. The rest is down to the work.",
  },
  {
    question: "Why should I pay for this?",
    answer:
      "Because a gallery would take 40–60% of every sale on top of significant upfront costs. Wallplace gives you a platform fee of 0–10%, ongoing commercial visibility, sales infrastructure, and access to a growing network of venues – for less than the cost of a round of drinks per month.",
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
      "We provide feedback on every application. You're welcome to reapply after three months. Many successful artists are accepted on their second application.",
  },
  {
    question: "What sizes work best?",
    answer:
      "Most venues suit work between A3 and A1. Once you're accepted and matched to a venue, we'll advise on sizing and presentation for that specific space.",
  },
  {
    question: "How does payment work when something sells?",
    answer:
      "The buyer pays through Wallplace. We deduct the platform fee and pay you within 14 days via bank transfer. Simple and transparent.",
  },
  {
    question: "What happens if I cancel?",
    answer:
      "You can cancel any time. You'll be responsible for collecting your work from venues you've placed in. No penalties, no hard feelings.",
  },
];

export default function ArtistsPage() {
  return (
    <div className="relative">
      {/* Immersive Hero */}
      <section className="relative -mt-14 lg:-mt-16 min-h-screen flex flex-col pt-28 lg:pt-32">
        {/* Hero background image */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=1920&h=1080&fit=crop&crop=center"
            alt="Photographer with camera"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/65 to-black/50" />
        </div>
        <div className="flex-1 flex items-center">
          <div className="max-w-[1200px] mx-auto px-6 w-full">
            <div className="max-w-2xl">
              <p className="text-xs font-medium tracking-[0.25em] uppercase text-accent mb-5">
                For Artists
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-tight text-white leading-[1.05] mb-6">
                Your work, matched to spaces that want it.
              </h1>
              <p className="text-lg lg:text-xl text-white/60 leading-relaxed max-w-xl mb-10">
                Wallplace is the curated art marketplace for independent venues.
                Access high-intent venue demand. Get discovered by cafés, restaurants,
                hotels, galleries, offices, and salons looking for original artwork.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button href="/apply" size="lg" variant="accent">
                  Apply to Join
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Dark banner */}
        <div className="relative z-10 mt-auto">
          <div className="py-3 flex justify-center">
            <ScrollButton targetId="artist-content" label="See what you get" inline />
          </div>
          <div className="border-t border-white/10 bg-black/50 backdrop-blur-sm">
            <div className="max-w-[1200px] mx-auto px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4">
              <p className="text-sm text-white/90 font-medium">
                First 20 artists: free access for life
              </p>
              <div className="flex items-center gap-3 text-xs text-white/40 tracking-wider uppercase">
                <span>1 month free trial</span>
                <span className="w-1 h-1 rounded-full bg-white/30" />
                <span>Cancel anytime</span>
                <span className="w-1 h-1 rounded-full bg-white/30" />
                <span>From £14.99/mo</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content sections */}
      <div id="artist-content" className="bg-background">

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

      {/* How It Works */}
      <section className="py-20 lg:py-28 bg-foreground">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateIn>
          <h2 className="text-3xl md:text-4xl mb-14 text-white">How it works</h2>
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

          {/* First Month Free Banner */}
          <div className="border-2 border-accent rounded-sm p-6 md:p-8 mb-10 bg-accent/5 text-center">
            <p className="text-sm font-medium text-accent uppercase tracking-wider mb-2">
              Founding Artist Offer
            </p>
            <p className="text-lg md:text-xl font-serif">
              First month free for all artists.
            </p>
            <p className="mt-2 text-2xl md:text-3xl font-serif text-accent">
              First 20 approved artists get 6 months free.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Core */}
            <div className="bg-surface border border-border rounded-sm p-5 sm:p-6 md:p-8 flex flex-col">
              <h3 className="text-2xl mb-1">Core</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-serif text-foreground">
                  &pound;14.99
                </span>
                <span className="text-muted text-sm">/month</span>
              </div>
              <p className="text-sm text-muted mb-6">
                15% platform fee on sales
              </p>
              <ul className="space-y-3 mb-8 flex-1">
                {coreFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-foreground/80"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-accent mt-0.5 shrink-0"
                    >
                      <path d="M3 8.5l3.5 3.5L13 4" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Button href="/apply" size="md" variant="secondary">
                Apply to Join
              </Button>
            </div>

            {/* Premium */}
            <div className="bg-surface border-2 border-accent rounded-sm p-5 sm:p-6 md:p-8 flex flex-col relative">
              <div className="absolute -top-3 left-6 bg-accent text-white text-xs font-medium px-3 py-1 rounded-sm">
                Most Popular
              </div>
              <h3 className="text-2xl mb-1">Premium</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-serif text-foreground">
                  &pound;34.99
                </span>
                <span className="text-muted text-sm">/month</span>
              </div>
              <p className="text-sm text-muted mb-6">
                8% platform fee on sales
              </p>
              <ul className="space-y-3 mb-8 flex-1">
                {premiumFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-foreground/80"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-accent mt-0.5 shrink-0"
                    >
                      <path d="M3 8.5l3.5 3.5L13 4" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Button href="/apply" size="md">
                Apply to Join
              </Button>
            </div>

            {/* Pro */}
            <div className="bg-surface border border-border rounded-sm p-5 sm:p-6 md:p-8 flex flex-col">
              <h3 className="text-2xl mb-1">Pro</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-serif text-foreground">
                  &pound;59.99
                </span>
                <span className="text-muted text-sm">/month</span>
              </div>
              <p className="text-sm text-muted mb-6">
                3% platform fee on sales
              </p>
              <ul className="space-y-3 mb-8 flex-1">
                {proFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-foreground/80"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-accent mt-0.5 shrink-0"
                    >
                      <path d="M3 8.5l3.5 3.5L13 4" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Button href="/apply" size="md" variant="secondary">
                Apply to Join
              </Button>
            </div>
          </div>
        </div>
        </AnimateIn>
        </section>

      {/* Value Anchoring */}
      <section className="py-20 lg:py-28 bg-foreground">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-3xl md:text-4xl mb-10 text-white text-center">
            What &pound;14.99 a month gets you
          </h2>
          <div className="max-w-xl mx-auto space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div>
                <p className="text-sm font-medium text-white/60">
                  Gallery hire
                </p>
                <p className="text-sm text-white/40">
                  &pound;200&ndash;1,000/week
                </p>
              </div>
              <span className="text-red-400 text-lg">&times;</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div>
                <p className="text-sm font-medium text-white/60">
                  Art fair table
                </p>
                <p className="text-sm text-white/40">&pound;300&ndash;500/day</p>
              </div>
              <span className="text-red-400 text-lg">&times;</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div>
                <p className="text-sm font-medium text-white/60">
                  Instagram promotion
                </p>
                <p className="text-sm text-white/40">
                  &pound;50&ndash;200/month, no physical presence
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
                  &pound;14.99/month. Access high-intent venue demand. First month free.
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
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">Active Demand</p>
          <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-3">Venues are looking for art right now</h2>
          <p className="text-muted max-w-lg mx-auto mb-8">
            Real commercial spaces actively seeking artwork to display. Enter your postcode to see demand in your area.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="/spaces-looking-for-art" className="inline-flex items-center justify-center px-7 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
              See Venue Demand
            </a>
            <a href="/spaces-looking-for-art" className="inline-flex items-center justify-center px-7 py-3.5 border border-border text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-background transition-colors">
              Search by Postcode
            </a>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 lg:py-28 bg-foreground">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl mb-4 max-w-2xl mx-auto text-white">
            Apply to Wallplace. Get discovered by the spaces that want your work.
          </h2>
          <div className="mt-8">
            <a href="/apply" className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-white/90 transition-colors">
              Apply to Join
            </a>
          </div>
          <p className="mt-6 text-sm text-white/40">
            First month free. First 20 approved artists get 6 months free. Membership from &pound;14.99/month.
          </p>
        </div>
      </section>

      </div>
    </div>
  );
}
