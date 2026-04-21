import { Metadata } from "next";
import VenueArtistToggle from "@/components/VenueArtistToggle";
import Image from "next/image";
import Link from "next/link";
import Button from "@/components/Button";
import Accordion from "@/components/Accordion";
import AnimateIn from "@/components/AnimateIn";
import ScrollButton from "@/components/ScrollButton";

export const metadata: Metadata = {
  title: "For Venues – Wallplace",
  description:
    "Discover original artwork for your space. Browse curated artist portfolios, filter by style and location, and enquire directly. Free for independent venues.",
};

const freeBenefits = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="22" height="18" rx="2" />
        <path d="M3 17l6-6 4 4 4-6 8 8" />
      </svg>
    ),
    title: "Browse artist portfolios",
    description:
      "Explore curated photography and original artwork from independent artists.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M16.5 16.5L22 22" />
      </svg>
    ),
    title: "Filter by location, style & theme",
    description:
      "Find work that suits your interior and clientele. Filter by medium, style, theme, size, and commercial availability.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20l4-4 4 4 4-4 4 4" />
        <rect x="3" y="4" width="22" height="16" rx="2" />
      </svg>
    ),
    title: "Post your space",
    description:
      "Create a venue profile so artists can see what you're looking for and reach out directly.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H9l-4 4V7a2 2 0 012-2h12a2 2 0 012 2z" />
      </svg>
    ),
    title: "Enquire directly",
    description:
      "Submit enquiries to artists whose work interests you. Arrange everything directly.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="8" height="8" rx="1" />
        <path d="M16 6h8M16 10h8M4 18h20M4 22h14" />
      </svg>
    ),
    title: "Sales handled by QR",
    description:
      "Customers scan a QR card to buy. Revenue share between you and the artist is optional and arranged directly.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l3 3 7-7" />
        <circle cx="14" cy="14" r="11" />
      </svg>
    ),
    title: "Free, always",
    description:
      "Browsing and enquiring is free for venues. Funded by artist memberships.",
  },
];

const steps = [
  {
    number: "01",
    title: "Create your profile",
    description: "Tell us about your space in 2 minutes. Style, size, vibe, and what you're looking for.",
  },
  {
    number: "02",
    title: "Browse portfolios",
    description: "Filter by location, style, theme, and commercial availability. Discover work that fits.",
  },
  {
    number: "03",
    title: "Enquire directly",
    description: "Send an enquiry to artists whose work interests you. No middleman.",
  },
  {
    number: "04",
    title: "Arrange with the artist",
    description: "Agree terms, arrange delivery or collection, and get the work on your walls.",
  },
];

const venues = [
  {
    caption: "Independent cafe, Peckham",
    image: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&h=450&fit=crop&crop=center",
  },
  {
    caption: "Wine bar, Bermondsey",
    image: "https://images.unsplash.com/photo-1525610553991-2bede1a236e2?w=600&h=450&fit=crop&crop=center",
  },
  {
    caption: "Brunch spot, Hackney",
    image: "https://images.unsplash.com/photo-1559329007-40df8a9345d8?w=600&h=450&fit=crop&crop=center",
  },
];

const faqItems = [
  {
    question: "Is it really free?",
    answer:
      "Yes. Browsing portfolios, filtering artists, posting your space, and submitting enquiries are all free. Wallplace is funded by artist memberships.",
  },
  {
    question: "Do you handle installation?",
    answer:
      "Installation is not included as standard – it's an optional paid add-on. Delivery and collection are arranged directly between you and the artist, with our support if needed.",
  },
  {
    question: "What if I don't like the art?",
    answer:
      "You choose the work you enquire about. You're never sent artwork you haven't selected. If something isn't working after placement, you speak directly with the artist.",
  },
  {
    question: "Will it damage my walls?",
    answer:
      "That's between you and the artist. We recommend discussing hanging methods before agreeing to a placement. Many artists use non-invasive fixings.",
  },
  {
    question: "What do my staff need to do?",
    answer:
      "Point to the QR card if a customer asks. The artist provides this. Sales are handled automatically through Wallplace's payment infrastructure.",
  },
  {
    question: "How does revenue share work?",
    answer:
      "Revenue share is an optional arrangement between you and the artist. A common split is 10% to the venue on any sale made from your space. You agree this directly when arranging placement.",
  },
  {
    question: "Is there a contract?",
    answer:
      "No. Just a simple partnership agreement covering the basics. 30 days' notice to end at any time.",
  },
];

const neighbourhoods = [
  "Peckham",
  "Bermondsey",
  "Hackney",
  "Shoreditch",
  "Brixton",
  "Dalston",
  "Deptford",
  "Camberwell",
];

export default function VenuesPage() {
  return (
    <div className="relative">
      <VenueArtistToggle />
      {/* Immersive Hero – pulls behind the header with negative margin */}
      <section className="relative -mt-14 lg:-mt-16 min-h-screen flex flex-col pt-28 lg:pt-32">
        {/* Hero background image */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1572947650440-e8a97ef053b2?w=1920&h=1080&fit=crop&crop=center"
            alt="Art displayed on venue walls"
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
                For Venues
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-tight text-white leading-[1.05] mb-6">
                Display curated art for free. Earn when it sells.
              </h1>
              <p className="text-lg lg:text-xl text-white/60 leading-relaxed max-w-xl mb-10">
                Browse portfolios from independent artists. Pick what fits your space.
                Art goes on your wall at zero cost, and if a visitor buys via the QR label, you earn a share.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <a href="/browse" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors">
                  DISCOVER ART
                </a>
                <a href="/register-venue" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-white text-foreground rounded-sm hover:bg-white/90 transition-colors">
                  REGISTER YOUR VENUE
                </a>
              </div>
              <p className="mt-6 text-sm text-white/60">
                Prefer a curator to pick for you?{" "}
                <a href="/curated" className="text-white underline underline-offset-2 hover:text-white/80">
                  Try Wallplace Curated
                </a>{" "}
                — from £49.
              </p>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="relative z-10 mt-auto py-3 flex justify-center">
          <ScrollButton targetId="venue-content" label="See what you get" inline />
        </div>
      </section>

      {/* Content sections with solid backgrounds */}
      <div id="venue-content" className="bg-background">

      {/* Free Tier – What You Get */}
      <section className="py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateIn>
          <div className="mb-10">
            <span className="text-xs font-medium text-accent uppercase tracking-wider">Free tier</span>
            <h2 className="text-3xl md:text-4xl mt-2">What you get for free</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-5">
            {freeBenefits.map((benefit) => (
              <div
                key={benefit.title}
                className="flex items-center gap-4 bg-surface border border-border rounded-sm p-5 hover:shadow-sm transition-shadow duration-300"
              >
                <div className="text-accent shrink-0">{benefit.icon}</div>
                <div>
                  <h3 className="text-base font-medium mb-1">{benefit.title}</h3>
                  <p className="text-muted text-sm leading-relaxed">
                    {benefit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
          </AnimateIn>
        </div>
      </section>

      {/* Revenue Share */}
      <section className="py-20 lg:py-28 bg-surface">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateIn>
          <h2 className="text-3xl md:text-4xl mb-10">
            Earn from your walls
          </h2>
          <div className="max-w-3xl">
            {/* Vertical on mobile, horizontal on desktop */}
            <div className="hidden sm:flex items-center gap-2 text-xs md:text-sm mb-8">
              <span className="bg-background border border-border text-foreground rounded-sm px-3 py-1.5 whitespace-nowrap">Customer sees art</span>
              <span className="text-muted shrink-0">&rarr;</span>
              <span className="bg-background border border-border text-foreground rounded-sm px-3 py-1.5 whitespace-nowrap">Scans QR</span>
              <span className="text-muted shrink-0">&rarr;</span>
              <span className="bg-background border border-border text-foreground rounded-sm px-3 py-1.5 whitespace-nowrap">Buys via Wallplace</span>
              <span className="text-muted shrink-0">&rarr;</span>
              <span className="bg-accent/10 border border-accent/30 text-accent rounded-sm px-3 py-1.5 font-medium whitespace-nowrap">You share in the sale</span>
            </div>
            <div className="flex sm:hidden flex-col items-center gap-1.5 mb-8 text-xs">
              <span className="bg-background border border-border text-foreground rounded-sm px-3 py-2 w-full text-center">Customer sees art</span>
              <span className="text-muted">&darr;</span>
              <span className="bg-background border border-border text-foreground rounded-sm px-3 py-2 w-full text-center">Scans QR code</span>
              <span className="text-muted">&darr;</span>
              <span className="bg-background border border-border text-foreground rounded-sm px-3 py-2 w-full text-center">Buys via Wallplace</span>
              <span className="text-muted">&darr;</span>
              <span className="bg-accent/10 border border-accent/30 text-accent rounded-sm px-3 py-2 w-full text-center font-medium">You share in the sale</span>
            </div>
            <p className="text-muted leading-relaxed">
              Revenue share is agreed directly between you and the artist when arranging
              a placement. A common arrangement is 10% to the venue on any sale made from your space.
              Your walls are already earning nothing – this is a way to change that.
            </p>
          </div>
          </AnimateIn>
        </div>
      </section>

      {/* How It Works */}
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
                <p className="text-white/60 text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-white/60 text-sm italic mb-4">
            Total time to get started: under 5 minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href="/browse" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors">
              DISCOVER ART
            </a>
            <a href="/register-venue" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase border border-white/30 text-white rounded-sm hover:bg-white/10 transition-colors">
              REGISTER YOUR VENUE
            </a>
          </div>
          </AnimateIn>
        </div>
      </section>

      {/* Venue Photos */}
      <section className="py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-3xl md:text-4xl mb-14">Where art goes up</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {venues.map((venue) => (
              <div key={venue.caption} className="group">
                <div className="aspect-[4/3] rounded-sm overflow-hidden relative">
                  <Image
                    src={venue.image}
                    alt={venue.caption}
                    fill
                    className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
                    sizes="33vw"
                  />
                </div>
                <p className="mt-3 text-sm text-muted">{venue.caption}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Image Break */}
      <section className="relative h-64 lg:h-80 overflow-hidden">
        <Image src="https://images.unsplash.com/photo-1525610553991-2bede1a236e2?w=1920&h=400&fit=crop&crop=center" alt="Wine bar with art" fill className="object-cover" />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative h-full flex items-center justify-center text-center px-6">
          <div>
            <p className="text-white text-3xl lg:text-4xl font-serif mb-3">Zero upfront cost</p>
            <p className="text-white/60 text-sm lg:text-base">Browse, enquire, and arrange – completely free for venues</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl mb-10 text-center">
              Common questions
            </h2>
            <Accordion items={faqItems} />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 lg:py-28 bg-foreground">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl mb-6 text-white">
            Discover art for your space. Free.
          </h2>
          <p className="text-white/60 max-w-lg mx-auto mb-10 leading-relaxed">
            Browse portfolios, filter by style, and enquire directly with artists.
            No curation fee. No contract.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/browse" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors">
              DISCOVER ART
            </Link>
            <Link href="/register-venue" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-white text-foreground rounded-sm hover:bg-white/90 transition-colors">
              REGISTER YOUR VENUE
            </Link>
          </div>
        </div>
      </section>

      </div>
    </div>
  );
}
