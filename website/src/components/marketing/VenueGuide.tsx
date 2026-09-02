// Body of /venues, factored out so /how-it-works can render it as the
// "For venues" scroll section without re-duplicating the copy. The
// hero stays on /venues itself; this component picks up at the
// "What you get for free" section and runs through to the final CTA.

import Image from "next/image";
import Link from "next/link";
import Accordion from "@/components/Accordion";
import AnimateIn from "@/components/AnimateIn";

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
      "Browsing and enquiring is free for venues. No platform fee for venues, ever.",
  },
];

const venuePhotos = [
  {
    caption: "Independent café",
    image: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&h=450&fit=crop&crop=center",
  },
  {
    caption: "Wine bar",
    image: "https://images.unsplash.com/photo-1525610553991-2bede1a236e2?w=600&h=450&fit=crop&crop=center",
  },
  {
    caption: "Brunch spot",
    image: "https://images.unsplash.com/photo-1559329007-40df8a9345d8?w=600&h=450&fit=crop&crop=center",
  },
];

const faqItems = [
  {
    question: "Is it really free?",
    answer:
      "Yes. Browsing portfolios, filtering artists, posting your space, and submitting enquiries are all free. Wallplace doesn't charge venues a platform fee.",
  },
  {
    question: "Do you handle installation?",
    answer:
      "Installation is not included as standard, it's an optional paid add-on. Delivery and collection are arranged directly between you and the artist, with our support if needed.",
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

export default function VenueGuide() {
  return (
    <div className="bg-background">
      {/* Free Tier – What You Get */}
      <section className="py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateIn>
            <div className="mb-10">
              <span className="text-xs font-medium text-accent uppercase tracking-wider">What&rsquo;s included</span>
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

      {/* Walls that work for you. Full-bleed dark section with a
          venue interior photo on one side, copy + the three pillars
          on the other. Pillars use the 01/02/03 serif treatment so
          they read as deliberate editorial rather than a sea of
          equal-weight cards. The previous rectangular-cards-on-cream
          design read as a feature list more than a story. */}
      <section className="relative bg-foreground text-white py-20 lg:py-28 overflow-hidden">
        {/* Subtle background art behind the content, kept dim so the
            pillars and headline read at full contrast. */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1572947650440-e8a97ef053b2?w=1920&h=1080&fit=crop&crop=center"
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-50"
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/60 to-foreground/30" />
        </div>
        <div className="max-w-[1200px] mx-auto px-6">
          <AnimateIn>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
              <div>
                <p className="text-xs font-medium tracking-[0.25em] uppercase text-accent mb-4">
                  Why it matters
                </p>
                <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-white leading-[1.1] mb-6">
                  Walls that work for you
                </h2>
                <p className="text-white/70 leading-relaxed text-lg mb-8 max-w-xl">
                  Bare walls earn nothing today. Real art makes a space feel
                  considered, gives customers something to look at, and
                  quietly improves the experience of being in your venue. Any
                  commercial upside on top is a bonus, not the whole point.
                </p>
                <p className="text-white/55 leading-relaxed text-sm max-w-xl">
                  Revenue share is optional and agreed directly with the artist
                  when you arrange a placement.
                </p>
              </div>

              <ol className="space-y-8">
                <li className="flex gap-5">
                  <span className="font-serif text-3xl text-accent/90 leading-none mt-1 shrink-0 tabular-nums">
                    01
                  </span>
                  <div>
                    <h3 className="font-serif text-xl text-white mb-2">Atmosphere</h3>
                    <p className="text-white/65 leading-relaxed text-sm">
                      Curated work makes your space feel intentional. Better
                      photos, longer dwell times, customers who come back.
                    </p>
                  </div>
                </li>
                <li className="flex gap-5">
                  <span className="font-serif text-3xl text-accent/90 leading-none mt-1 shrink-0 tabular-nums">
                    02
                  </span>
                  <div>
                    <h3 className="font-serif text-xl text-white mb-2">Story</h3>
                    <p className="text-white/65 leading-relaxed text-sm">
                      Local artists give you something to talk about, a reason
                      for regulars to bring friends and for press to cover you.
                    </p>
                  </div>
                </li>
                <li className="flex gap-5">
                  <span className="font-serif text-3xl text-accent/90 leading-none mt-1 shrink-0 tabular-nums">
                    03
                  </span>
                  <div>
                    <h3 className="font-serif text-xl text-white mb-2">Optional upside</h3>
                    <p className="text-white/65 leading-relaxed text-sm">
                      When a customer scans a QR and buys, you can take an
                      agreed share of the sale. Typical 10%. Off by default,
                      on if you want it.
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* Venue Photos */}
      <section className="py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-3xl md:text-4xl mb-14">Where art goes up</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {venuePhotos.map((venue) => (
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
        <Image src="https://images.unsplash.com/photo-1525610553991-2bede1a236e2?w=1920&h=400&fit=crop&crop=center" alt="" fill className="object-cover" />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative h-full flex items-center justify-center text-center px-6">
          <div>
            <p className="text-white text-3xl lg:text-4xl font-serif mb-3">Zero upfront cost</p>
            <p className="text-white/60 text-sm lg:text-base">Browse, enquire, and arrange, completely free for venues</p>
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
            <Link href="/signup/venue" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-white text-foreground rounded-sm hover:bg-white/90 transition-colors">
              REGISTER YOUR VENUE
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
