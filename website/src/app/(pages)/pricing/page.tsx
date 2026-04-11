import type { Metadata } from "next";
import Button from "@/components/Button";
import Accordion from "@/components/Accordion";

export const metadata: Metadata = {
  title: "Pricing – Wallplace",
  description:
    "Transparent pricing for artists on Wallplace. First month free. Choose Core, Premium, or Pro – all with access to our curated venue network.",
};

const coreFeatures = [
  "Standard artist profile",
  "Visibility to venues browsing the platform",
  "Curated matching – we surface you to relevant venues",
  "18% platform fee on sales",
  "Basic analytics dashboard",
  "Access to Wallplace venue network",
];

const premiumFeatures = [
  "Featured artist profile",
  "Priority visibility in venue recommendations",
  "Proactive venue matching and introductions",
  "8% platform fee on sales",
  "Full analytics – views, enquiries, conversion",
  "Featured in curated venue suggestion lists",
  "Priority response from Wallplace team",
];

const proFeatures = [
  "Premium profile with enhanced presentation",
  "Maximum visibility across the platform",
  "Direct venue matching and relationship management",
  "3% platform fee on sales",
  "Priority support with dedicated response SLA",
  "Dedicated account support",
  "Early access to new features and venue partnerships",
];

const comparisonRows = [
  {
    feature: "Artist profile",
    core: "Standard",
    premium: "Featured",
    pro: "Premium",
  },
  {
    feature: "Platform visibility",
    core: "Standard",
    premium: "Priority",
    pro: "Maximum",
  },
  {
    feature: "Venue matching",
    core: "Curated visibility",
    premium: "Proactive matching",
    pro: "Direct matching",
  },
  {
    feature: "Platform fee on sales",
    core: "15%",
    premium: "8%",
    pro: "3%",
  },
  {
    feature: "Analytics",
    core: "Basic",
    premium: "Full",
    pro: "Full",
  },
  {
    feature: "Support",
    core: "Standard",
    premium: "Priority",
    pro: "Dedicated",
  },
  {
    feature: "First month",
    core: "Free",
    premium: "Free",
    pro: "Free",
  },
];

const faqItems = [
  {
    question: "What is a platform fee?",
    answer:
      "The platform fee is the percentage Wallplace takes when a sale is made through the platform – whether that's a venue purchasing work outright, or a customer buying directly from a venue display. It is separate from your membership cost. Core artists pay 15%, Premium 8%, and Pro artists pay 3%. You keep the rest.",
  },
  {
    question: "Is the first month really free?",
    answer:
      "Yes. Every approved artist gets their first month at no cost, on any tier. You can start with Core and upgrade later, or begin on Premium or Pro – the first month is always free. After that, billing begins on your chosen plan.",
  },
  {
    question: "What do the first 20 artists get?",
    answer:
      "The first 20 approved artists on the Wallplace platform receive 6 months free on whichever tier they choose, as a founding artist benefit. This is our way of acknowledging that early adopters take a chance on us, and we want to reward that generously.",
  },
  {
    question: "Can I change my tier?",
    answer:
      "Yes, you can upgrade or downgrade at any time. If you upgrade mid-cycle, the difference is prorated. Downgrading takes effect at the start of your next billing period.",
  },
  {
    question: "Is placement guaranteed?",
    answer:
      "No. We are a platform that connects artists with venues – we do not guarantee placement in any specific venue. What we do is ensure your profile is in front of venues that are actively looking for artwork, and we work to match you with the right spaces for your practice.",
  },
  {
    question: "What happens when I cancel?",
    answer:
      "You can cancel at any time. Your membership remains active until the end of the period you have paid for. We will arrange the return of any artwork currently on display with venues, and your profile will be removed from the platform. No cancellation fees.",
  },
  {
    question: "Are there any other fees?",
    answer:
      "No hidden fees. Your monthly membership and the platform fee on sales are the only costs. Delivery, framing, and any materials are your own costs as an artist – Wallplace does not add charges for these.",
  },
];

export default function PricingPage() {
  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl lg:text-5xl mb-5">
              Simple, transparent pricing
            </h1>
            <p className="text-lg text-muted leading-relaxed">
              Choose the tier that fits your ambition. All tiers give you access
              to the Wallplace platform and venue network. The difference
              is visibility and the platform fee on sales.
            </p>
          </div>
        </div>
      </section>

      {/* Founding Artist Banner */}
      <section className="pb-8">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="bg-accent/5 border-2 border-accent rounded-sm p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-8">
              <div>
                <p className="text-xs font-medium text-accent uppercase tracking-wider mb-1">
                  Founding Artist Programme
                </p>
                <p className="text-foreground font-medium text-lg">
                  First 20 approved artists get 6 months free
                </p>
                <p className="text-muted text-sm mt-1">
                  All artists receive their first month free. The first 20
                  approved artists get 6 months free on any tier as a founding
                  member benefit.
                </p>
              </div>
              <div className="shrink-0">
                <Button href="/apply" size="md">
                  Apply to Join
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16 lg:py-20">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Core */}
            <div className="bg-surface border border-border rounded-sm p-8 flex flex-col">
              <h3 className="text-2xl mb-1">Core</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-serif">&pound;14.99</span>
                <span className="text-muted text-sm">/month</span>
              </div>
              <p className="text-sm text-muted mb-1">First month free</p>
              <p className="text-sm font-medium text-foreground mb-6">
                18% platform fee on sales
              </p>
              <ul className="space-y-3 mb-8 flex-1">
                {coreFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm text-foreground/80"
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
              <Button href="/apply" variant="secondary" size="md">
                Apply to Join
              </Button>
            </div>

            {/* Premium */}
            <div className="bg-surface border-2 border-accent rounded-sm p-8 flex flex-col relative">
              <div className="absolute -top-3 left-6 bg-accent text-white text-xs font-medium px-3 py-1 rounded-sm">
                Most Popular
              </div>
              <h3 className="text-2xl mb-1">Premium</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-serif">&pound;34.99</span>
                <span className="text-muted text-sm">/month</span>
              </div>
              <p className="text-sm text-muted mb-1">First month free</p>
              <p className="text-sm font-medium text-foreground mb-6">
                8% platform fee on sales
              </p>
              <ul className="space-y-3 mb-8 flex-1">
                {premiumFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm text-foreground/80"
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
            <div className="bg-surface border border-border rounded-sm p-8 flex flex-col">
              <h3 className="text-2xl mb-1">Pro</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-serif">&pound;59.99</span>
                <span className="text-muted text-sm">/month</span>
              </div>
              <p className="text-sm text-muted mb-1">First month free</p>
              <p className="text-sm font-medium text-foreground mb-6">
                0% platform fee on sales
              </p>
              <ul className="space-y-3 mb-8 flex-1">
                {proFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm text-foreground/80"
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
              <Button href="/apply" variant="secondary" size="md">
                Apply to Join
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="py-20 lg:py-24 bg-surface border-y border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-3xl mb-10">Feature comparison</h2>
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 pr-4 font-medium text-muted text-xs uppercase tracking-wider w-2/5">
                    Feature
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">
                    Core
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-accent text-xs uppercase tracking-wider">
                    Premium
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">
                    Pro
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.feature} className="border-b border-border/60">
                    <td className="py-3.5 pr-4 font-medium text-foreground">
                      {row.feature}
                    </td>
                    <td className="py-3.5 px-4 text-muted">{row.core}</td>
                    <td className="py-3.5 px-4 text-foreground font-medium">
                      {row.premium}
                    </td>
                    <td className="py-3.5 px-4 text-muted">{row.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Value Anchoring */}
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            <div>
              <h2 className="text-3xl mb-6">
                Put the cost in perspective
              </h2>
              <p className="text-muted leading-relaxed mb-8">
                Wallplace membership costs less than almost every other way of
                getting your work in front of a real audience.
              </p>
              <div className="space-y-4">
                {[
                  {
                    label: "Gallery hire",
                    detail: "£200–1,000 per week",
                    wallplace: false,
                  },
                  {
                    label: "Art fair table",
                    detail: "£300–500 per day",
                    wallplace: false,
                  },
                  {
                    label: "Instagram paid promotion",
                    detail: "£50–200/month, no physical presence",
                    wallplace: false,
                  },
                  {
                    label: "Wallplace Core",
                    detail: "£14.99/month, curated venue access",
                    wallplace: true,
                  },
                ].map(({ label, detail, wallplace }) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between py-3.5 px-4 rounded-sm border ${
                      wallplace
                        ? "border-accent/30 bg-accent/5"
                        : "border-border"
                    }`}
                  >
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          wallplace ? "text-accent" : "text-foreground/70"
                        }`}
                      >
                        {label}
                      </p>
                      <p className="text-xs text-muted mt-0.5">{detail}</p>
                    </div>
                    {wallplace ? (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-accent shrink-0"
                      >
                        <path d="M4 10.5l4.5 4.5L16 5" />
                      </svg>
                    ) : (
                      <span className="text-muted text-lg leading-none shrink-0">
                        &times;
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface border border-border rounded-sm p-8 lg:p-10">
              <h3 className="text-2xl mb-4">
                The Pro case: lowest platform fee
              </h3>
              <p className="text-muted leading-relaxed mb-4">
                At &pound;59.99/month, Pro pays for itself quickly for any artist with
                regular sales. On a &pound;500 sale, Core would cost you &pound;75 in
                platform fees, Premium &pound;40. Pro costs just &pound;15 &ndash; keeping
                &pound;485.
              </p>
              <p className="text-muted leading-relaxed mb-6">
                For artists actively using the platform and generating consistent
                venue enquiries, Pro is the commercially obvious choice.
              </p>
              <Button href="/apply" size="md">
                Apply for Pro
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 lg:py-24 bg-surface border-y border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl mb-10 text-center">
              Pricing questions
            </h2>
            <Accordion items={faqItems} />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-4xl mb-4">
            Ready to apply?
          </h2>
          <p className="text-muted leading-relaxed mb-8 max-w-lg mx-auto">
            First month free for all approved artists. First 20 accepted artists
            get 6 months free on any tier.
          </p>
          <Button href="/apply" size="lg">
            Apply to Join Wallplace
          </Button>
        </div>
      </section>
    </div>
  );
}
