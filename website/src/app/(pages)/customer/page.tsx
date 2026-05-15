import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Accordion from "@/components/Accordion";
import AnimateIn from "@/components/AnimateIn";
import ScrollButton from "@/components/ScrollButton";

export const metadata: Metadata = {
  title: "For Customers",
  description:
    "Buy original artwork directly from independent artists on Wallplace. Spot a piece in a venue, scan the QR, and own it. Or browse online from anywhere.",
};

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
    title: "Certificate of authenticity",
    description:
      "Every sale ships with a signed certificate from the artist. Provenance, dimensions, year, and edition (if any) on record.",
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
      "Card, Apple Pay, Google Pay. Wallplace holds the funds until the artist confirms dispatch, so you're never out of pocket if something goes wrong.",
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

const steps = [
  {
    number: "01",
    title: "Spot it or search it",
    description:
      "See a piece you like in a cafe, bar, or hotel showing Wallplace art. Or browse artists online if you already know what you're after.",
  },
  {
    number: "02",
    title: "Scan, or click",
    description:
      "QR on the venue card, or the artwork page online. Either way you land on the artist's Wallplace storefront with full details.",
  },
  {
    number: "03",
    title: "Buy securely",
    description:
      "Pay with card, Apple Pay, or Google Pay. Wallplace processes the payment and confirms the order with the artist.",
  },
  {
    number: "04",
    title: "Pickup or delivery",
    description:
      "Collect at the venue, have the artist post it, or arrange a courier for larger pieces. You'll get tracking and a certificate of authenticity.",
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
      "Every artist on Wallplace is reviewed by our curation team before going live. We verify identity, portfolio, and that the work is theirs. Profiles include past sales, venue placements, and reviews.",
  },
  {
    question: "Can I sell the piece on later?",
    answer:
      "Yes, it's yours. Wallplace doesn't claim resale rights. Your certificate of authenticity travels with the work, so future buyers can verify provenance.",
  },
  {
    question: "Where does my money go?",
    answer:
      "The majority goes to the artist. Wallplace takes a small platform fee (5 to 15%) that covers payments, support, and platform costs. Venues sometimes take a small revenue share too, depending on how they've arranged things with the artist.",
  },
];

export default function CustomerPage() {
  return (
    <div className="relative">
      {/* Immersive Hero, pulls behind the header with negative margin */}
      <section className="relative -mt-14 lg:-mt-16 min-h-screen flex flex-col pt-28 lg:pt-32">
        {/* Stock image of artwork on a wall, with a subtle gradient
            overlay so the headline still reads on light parts of the
            image. */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop&crop=center"
            alt="Original artwork on a wall in a curated gallery"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/65 via-black/50 to-black/35" />
        </div>
        <div className="flex-1 flex items-center pb-24 lg:pb-28">
          <div className="max-w-[1200px] mx-auto px-6 w-full">
            <div className="max-w-2xl">
              <p className="text-xs font-medium tracking-[0.25em] uppercase text-accent mb-5">
                For Customers
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-tight text-white leading-[1.05] mb-6">
                Buy original artwork direct from the artist.
              </h1>
              <p className="text-lg lg:text-xl text-white/60 leading-relaxed max-w-xl mb-10">
                Spot a piece you love on a wall somewhere. Scan the QR. Own it.
                Or skip the wall and browse hundreds of independent artists online.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Link href="/browse" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors">
                  BROWSE ARTWORK
                </Link>
                <Link href="/signup/customer" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-white text-foreground rounded-sm hover:bg-white/90 transition-colors">
                  CREATE AN ACCOUNT
                </Link>
              </div>
              <p className="mt-6 text-sm text-white/60">
                Already tracking an order?{" "}
                <Link href="/orders/track" className="text-white underline underline-offset-2 hover:text-white/80">
                  Track it here
                </Link>
                , no account needed.
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-auto py-3 flex justify-center">
          <ScrollButton targetId="customer-content" label="See how it works" inline />
        </div>
      </section>

      <div id="customer-content" className="bg-background">

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

        {/* How it works steps */}
        <section className="py-20 lg:py-28 bg-foreground text-white">
          <div className="max-w-[1200px] mx-auto px-6">
            <AnimateIn>
              <h2 className="text-3xl md:text-4xl mb-14 text-white">How it works</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8 lg:gap-6">
                {steps.map((step) => (
                  <div key={step.number}>
                    <span className="text-accent text-sm font-medium tracking-wider">
                      {step.number}
                    </span>
                    <h3 className="text-xl mt-2 mb-3 text-white">{step.title}</h3>
                    <p className="text-white/60 text-sm leading-relaxed">{step.description}</p>
                  </div>
                ))}
              </div>
              <div className="mt-10 flex flex-col sm:flex-row gap-3">
                <Link href="/browse" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors">
                  BROWSE ARTWORK
                </Link>
                <Link href="/signup/customer" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase border border-white/30 text-white rounded-sm hover:bg-white/10 transition-colors">
                  CREATE AN ACCOUNT
                </Link>
              </div>
            </AnimateIn>
          </div>
        </section>

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
    </div>
  );
}
