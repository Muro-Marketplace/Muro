// Body of /customer, factored out so /how-it-works can render it as
// the "For customers" scroll section. Hero stays on /customer itself;
// this component starts at "Why Wallplace" and runs through to the
// FAQs.

import Link from "next/link";
import Accordion from "@/components/Accordion";
import AnimateIn from "@/components/AnimateIn";

const benefits = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="8" height="8" rx="1" />
        <rect x="16" y="4" width="8" height="8" rx="1" />
        <rect x="4" y="16" width="8" height="8" rx="1" />
        <rect x="16" y="16" width="8" height="8" rx="1" />
      </svg>
    ),
    title: "Scan a piece you love",
    description:
      "Every artwork in a Wallplace venue has a QR card. Scan it on your phone and the work, the artist, and the price are right there.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
    title: "Buy direct from the artist",
    description:
      "No gallery markup, no middleman. Your money goes to the person who made the work, less a small platform fee.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l3 3 7-7" />
        <circle cx="14" cy="14" r="11" />
      </svg>
    ),
    title: "Know exactly what you're buying",
    description:
      "Medium, dimensions and the artist's own description on every listing. Want a signed certificate of authenticity? Ask the artist before you buy.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" />
        <path d="M3 7l9 4 9-4M12 11v10" />
      </svg>
    ),
    title: "Pick up or have it shipped",
    description:
      "Collect from the venue, arrange a courier, or have the artist post it to you. Tracking on every order.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="22" height="14" rx="2" />
        <line x1="3" y1="10" x2="25" y2="10" />
        <path d="M7 15h4" />
      </svg>
    ),
    title: "Secure payment",
    description:
      "Card, Apple Pay, Google Pay. Wallplace holds the funds until delivery is confirmed (or 14 days pass with no dispute), so you're covered if something goes wrong.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
    title: "Talk to the artist",
    description:
      "Want a different size, a commission, or a print? Message the artist directly through Wallplace. Many works are available in formats that aren't on the storefront yet.",
  },
];

const faqItems = [
  {
    question: "Do I need an account to buy?",
    answer:
      "No. You can check out as a guest with just your email. We send you a tracking link so you can follow the order without signing up. An account is optional, it lets you save artists you like and message them later.",
  },
  {
    question: "What if the artwork doesn't arrive in good condition?",
    answer:
      "Tell us within 48 hours of delivery. If a piece arrives damaged, you're covered. We hold the artist's payout until you confirm the work is as described, so refunds and replacements are straightforward. See our Returns Policy for the full process.",
  },
  {
    question: "Can I commission something custom?",
    answer:
      "Yes. Open the artist's profile and message them directly. Most artists are happy to discuss commissions, different sizes, or works in a series. Commission terms and timelines are agreed between you and the artist; payment runs through Wallplace.",
  },
  {
    question: "How do I know the artist is real?",
    answer:
      "Every artist on Wallplace is reviewed by our curation team before going live. We review the portfolio and confirm the work is theirs. Profiles show the artist's work and where it has been placed.",
  },
  {
    question: "Can I sell the piece on later?",
    answer:
      "Yes, it's yours. Wallplace doesn't claim resale rights. Keep your order confirmation as a record of the purchase; it shows the work came directly from the artist.",
  },
  {
    question: "Where does my money go?",
    answer:
      "The majority goes to the artist. Wallplace takes a flat 15% platform fee that covers payments, support, and platform costs. Venues sometimes take a small revenue share too, depending on how they've arranged things with the artist.",
  },
];

export default function CustomerGuide() {
  return (
    <div className="bg-background">
      {/* What you get */}
      <section className="py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateIn>
            <div className="mb-10">
              <span className="text-xs font-medium text-accent uppercase tracking-wider">Why Wallplace</span>
              <h2 className="text-3xl md:text-4xl mt-2">Buy art the way it should work</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-5">
              {benefits.map((b) => (
                <div
                  key={b.title}
                  className="flex items-center gap-4 bg-surface border border-border rounded-sm p-5 hover:shadow-sm transition-shadow duration-300"
                >
                  <div className="text-accent shrink-0">{b.icon}</div>
                  <div>
                    <h3 className="text-base font-medium mb-1">{b.title}</h3>
                    <p className="text-muted text-sm leading-relaxed">{b.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* The previous "How it works" 01-04 grid lived here. Removed
          because the how-it-works hero up the page already shows the
          same Discover → Buy → Receive flow for customers; the
          second copy on the same scroll read as filler. The CTAs that
          lived in this section also already appear in the hero. */}

      {/* FAQs */}
      <section className="py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateIn>
            <div className="mb-10">
              <span className="text-xs font-medium text-accent uppercase tracking-wider">Common questions</span>
              <h2 className="text-3xl md:text-4xl mt-2">Buying on Wallplace</h2>
            </div>
            <Accordion items={faqItems} />
            <p className="mt-10 text-muted text-sm">
              More questions? See the full{" "}
              <Link href="/faqs" className="text-accent hover:underline">FAQs</Link>
              , or read our{" "}
              <Link href="/returns" className="text-accent hover:underline">Returns Policy</Link>
              {" "}and{" "}
              <Link href="/complaints" className="text-accent hover:underline">Complaints Policy</Link>
              .
            </p>
          </AnimateIn>
        </div>
      </section>
    </div>
  );
}
