import Accordion from "@/components/Accordion";
import Button from "@/components/Button";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "FAQs – Wallplace",
  description:
    "Frequently asked questions about Wallplace for artists, venues, and buyers.",
};

interface FaqEntry {
  question: string;
  answer: ReactNode;
}

const generalFaqs: FaqEntry[] = [
  {
    question: "What is Wallplace?",
    answer:
      "Wallplace is a curated marketplace connecting emerging and established artists with independent venues, cafes, restaurants, coworking spaces, offices, and more, that want original artwork on their walls. We handle the curation and provide the platform for discovery, communication, and sales. Artists manage their own fulfilment and delivery.",
  },
  {
    question: "How does Wallplace make money?",
    answer: (
      <>
        <p>
          Wallplace earns through artist membership plans (from £9.99/month)
          and a platform fee on artwork sales (5–15% depending on the artist&rsquo;s
          plan). When a piece sells, the artist keeps the majority. Venues
          never pay a platform fee.
        </p>
        <p>
          Full breakdown on our <Link href="/pricing">pricing page</Link>.
        </p>
      </>
    ),
  },
  {
    question: "Is Wallplace a gallery?",
    answer:
      "Not in the traditional sense. We do not have a physical gallery space. Instead, we use the walls of independent venues as our exhibition spaces. This means artists get their work seen by thousands of people in everyday settings, and venues get beautiful original art without the cost of commissioning it directly.",
  },
];

const artistFaqs: FaqEntry[] = [
  {
    question: "How much does it cost to join Wallplace as an artist?",
    answer: (
      <>
        <p>
          It is free to apply. Once accepted, membership starts from
          £9.99/month (Core plan) with your first month free. Higher tiers
          (Premium at £24.99/month, Pro at £49.99/month) offer lower platform
          fees on sales and more visibility.
        </p>
        <p>
          See our <Link href="/pricing">pricing page</Link> for the full breakdown,
          or <Link href="/apply">apply now</Link> to start a profile.
        </p>
      </>
    ),
  },
  {
    question: "How does the curation process work?",
    answer:
      "After you submit your application with a portfolio of your work, our team reviews it based on technical quality, originality, consistency, and suitability for display in commercial spaces. We aim to respond within 5 business days. If accepted, we will schedule an onboarding call to discuss your portfolio, pricing, and preferences.",
  },
  {
    question: "What happens after my application is accepted?",
    answer: (
      <>
        <p>
          Within 1 working day of acceptance you&rsquo;ll get an onboarding email
          with a link to set your password, upload your portfolio, and
          configure pricing + delivery preferences. We&rsquo;ll book a 30-minute
          onboarding call within the next week to walk through it together
          and help you set up your first works.
        </p>
        <p>
          Once your portfolio is live, venues can start enquiring immediately,
          most artists see their first venue interest in the first 2–3 weeks.
          You can read more about{" "}
          <Link href="/how-it-works">how the platform works end-to-end</Link>{" "}
          or check the <Link href="/artist-agreement">artist agreement</Link>.
        </p>
      </>
    ),
  },
  {
    question: "When do I get paid for sales?",
    answer: (
      <>
        <p>
          Payouts run via Stripe Connect. When a buyer pays, the funds are
          held until the artwork has been confirmed delivered (or 14 days
          have passed without a buyer dispute, whichever comes first). At
          that point we transfer your share, sale price minus our platform
          fee (5–15% depending on plan) and any agreed venue revenue share,
          straight to your linked bank account. You&rsquo;ll see every
          payout itemised in <Link href="/artist-portal/billing">your billing page</Link>.
        </p>
        <p>
          We send an email receipt for every transfer + a daily payout digest
          if you had multiple sales that day.
        </p>
      </>
    ),
  },
  {
    question: "Who handles shipping when a piece sells?",
    answer: (
      <>
        <p>
          You do. Each artist sets their own shipping price (or free
          shipping) per work. When a sale comes in we email you with the
          buyer&rsquo;s address, packing checklist, and a ship-by date,
          you pack and dispatch within the agreed window (default: 5 working
          days). Tracking number goes back to the buyer through the platform.
        </p>
        <p>
          Couriers, packing materials and delivery methods are your call,
          most of our artists use Parcelforce, DHL, or specialist art
          couriers like Mailboxes Etc. for larger pieces. We&rsquo;ll add
          recommended courier partners in the artist portal soon.
        </p>
      </>
    ),
  },
  {
    question: "Can I set my own prices?",
    answer:
      "Yes. You set the prices for your work. We may offer guidance on pricing based on our experience of what sells well in venue settings, but the final decision is always yours. We will never list your work at a price you have not agreed to.",
  },
  {
    question: "Do I need to provide framed work?",
    answer:
      "Not necessarily. We work with artists to determine the best presentation for their work. Some pieces are displayed framed, others unframed. We can help arrange framing at competitive rates through our partners, or you can provide your own frames. Framing costs are discussed during onboarding.",
  },
  {
    question: "What if my work gets damaged in a venue?",
    answer: (
      <>
        <p>
          Venues agree to exercise reasonable care over displayed artwork
          under our <Link href="/venue-agreement">Venue Partnership Agreement</Link>.
          If damage occurs due to venue negligence, the venue is liable. We
          strongly recommend you insure your artwork for its full value,
          including periods when it is on display in venues. Wallplace can
          help facilitate communication between you and the venue, but we
          are not liable for damage, loss, or theft of artwork.
        </p>
        <p>
          If something happens, raise a case through{" "}
          <Link href="/complaints">our complaints process</Link> and we&rsquo;ll
          help broker a resolution.
        </p>
      </>
    ),
  },
  {
    question: "Can I cancel my membership?",
    answer:
      "Yes. You can cancel at any time with 30 days’ notice. You are responsible for collecting your artwork from any venues where it is currently displayed within 30 days of your cancellation date. No cancellation fees or penalties apply.",
  },
  {
    question: "Is Wallplace exclusive? Can I sell my work elsewhere?",
    answer:
      "Wallplace is non-exclusive. You are free to sell your work through other channels, galleries, your own website, or any other platform. We only ask that if a piece is currently on display in a venue through Wallplace, you let us know before selling it through another channel so we can arrange a replacement.",
  },
  {
    question: "Is my artwork protected from theft?",
    answer:
      "Every image on Wallplace is served at reduced resolution with compressed quality, good enough for browsing, not enough for reproduction. Right-click saving is disabled, and images cannot be dragged or selected. The original high-resolution file never leaves your hands, we only display a web-optimised version. Our Terms of Service prohibit unauthorised reproduction, and every sale is tracked and attributed to you as the creator.",
  },
];

const venueFaqs: FaqEntry[] = [
  {
    question: "How much does it cost for a venue to display art?",
    answer: (
      <>
        <p>
          Nothing. There is no cost to venues for browsing, enquiring, or
          displaying artwork through Wallplace. Delivery and installation
          are arranged directly between you and the artist. Venues never pay
          a platform fee, Wallplace&rsquo;s revenue comes from sales
          commissions and optional artist tools, not from charges to venues.
        </p>
        <p>
          Full terms in the <Link href="/venue-agreement">venue agreement</Link>.
        </p>
      </>
    ),
  },
  {
    question: "What happens after I enquire about an artist?",
    answer: (
      <>
        <p>
          Your enquiry lands in the artist&rsquo;s Wallplace inbox + email.
          Most artists reply within 48 hours. From there you agree the
          arrangement (display loan, paid loan, or outright purchase),
          confirm dates and conditions, and the artist confirms the
          placement on the platform, that creates the loan record both
          parties countersign before the work is dispatched. You can track
          everything from your <Link href="/venue-portal/placements">placements page</Link>.
        </p>
      </>
    ),
  },
  {
    question: "How long does it take from enquiry to artwork on the wall?",
    answer: (
      <>
        <p>
          For an off-the-shelf placement (i.e. the work already exists),
          most arrangements go from first message to installed in 2–3 weeks.
          Roughly 3–5 days of conversation + agreement, then 5–10 days for
          dispatch + install scheduling. Bespoke commissions take longer,
          weeks to months depending on the artist.
        </p>
        <p>
          You&rsquo;ll see live status (Requested → Accepted → Scheduled →
          Installed → Live) on the placement record once it&rsquo;s created.
        </p>
      </>
    ),
  },
  {
    question: "Who installs the artwork, us or the artist?",
    answer: (
      <>
        <p>
          By default, you and the artist arrange installation directly. For
          local placements (artist within ~30 miles), most artists prefer to
          install themselves, they know how the piece is meant to hang and
          it gives them a chance to see the space. For shipped placements,
          the artist sends with hanging hardware + instructions and your
          team installs.
        </p>
        <p>
          Wallplace can introduce an art-handling partner for larger /
          heavier pieces or fragile works on request, message{" "}
          <a href="mailto:hello@wallplace.co.uk">hello@wallplace.co.uk</a>{" "}
          and we&rsquo;ll set it up.
        </p>
      </>
    ),
  },
  {
    question: "Do we need to sign a contract?",
    answer: (
      <>
        <p>
          Yes, a simple partnership agreement covers care of artwork,
          display period, sales, and damage. Plain English. Cancellable on
          30 days&rsquo; notice. You can{" "}
          <Link href="/venue-agreement">read the full venue agreement here</Link>.
        </p>
      </>
    ),
  },
  {
    question: "What if a piece of art gets damaged?",
    answer: (
      <>
        <p>
          Under the Venue Partnership Agreement, venues must exercise
          reasonable care over displayed artwork. If damage occurs due to
          negligence by venue staff or contractors, the venue is liable and
          should cooperate with the artist to resolve it. We recommend
          reporting any damage to both the artist and Wallplace within 48
          hours. Wallplace can facilitate communication but is not liable
          for artwork damage.
        </p>
        <p>
          If you need help working through a damage claim, raise it via{" "}
          <Link href="/complaints">our complaints process</Link> and our
          team will help mediate.
        </p>
      </>
    ),
  },
  {
    question: "Can we choose which art to display?",
    answer: (
      <>
        <p>
          Absolutely. Browse{" "}
          <Link href="/browse">artist portfolios</Link> and enquire directly
          with artists whose work interests you, you have the final say on
          what goes on your walls. You can also arrange rotations directly
          with artists to keep things fresh.
        </p>
      </>
    ),
  },
  {
    question: "What happens when a customer wants to buy a piece?",
    answer:
      "Each artwork on display includes a discreet label with the artist name, title, and a QR code or URL linking to the piece on Wallplace. Customers can enquire or purchase directly through us. Your staff do not need to handle any sales – they just point customers to the label.",
  },
  {
    question: "Do our staff need to do anything?",
    answer:
      "Very little. Delivery and installation are arranged between you and the artist. Once artwork is up, your team just needs to keep an eye on it (as they would any decor) and point curious customers to the QR label for information and purchasing. No sales handling required.",
  },
  {
    question: "How often does the artwork change?",
    answer:
      "That depends on your arrangement with the artist. Some venues prefer a rotation every 2–3 months to keep the space feeling fresh. Others prefer to keep pieces longer. You agree this directly with the artist when arranging the placement.",
  },
  {
    question: "Can we buy the artwork ourselves?",
    answer:
      "Yes. You can purchase any artwork at the listed price through the QR code or directly on the platform. Some artists also offer special pricing for venue purchases, discuss this with the artist directly.",
  },
];

export default function FaqsPage() {
  return (
    <div className="bg-background">
      {/* Header */}
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl lg:text-5xl mb-5">
              Frequently Asked Questions
            </h1>
            <p className="text-lg text-muted leading-relaxed">
              Everything you need to know about how Wallplace works for artists,
              venues, and art lovers.
            </p>
          </div>

          {/* Role quick-nav, jump to the right FAQ section. Anchor links
              are plain <a>s so deep-links work (#artists, #venues, #buyers). */}
          <div className="mt-8 flex flex-wrap gap-2">
            <a href="#artists" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full border border-border bg-surface text-foreground hover:border-foreground/40 transition-colors">
              I&rsquo;m an artist
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 6h6M6 3l3 3-3 3" /></svg>
            </a>
            <a href="#venues" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full border border-border bg-surface text-foreground hover:border-foreground/40 transition-colors">
              I&rsquo;m a venue
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 6h6M6 3l3 3-3 3" /></svg>
            </a>
            <a href="#buyers" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full border border-border bg-surface text-foreground hover:border-foreground/40 transition-colors">
              I&rsquo;m a buyer
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 6h6M6 3l3 3-3 3" /></svg>
            </a>
          </div>
        </div>
      </section>

      {/* General */}
      <section className="pb-16 lg:pb-20 scroll-mt-24" id="general">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h2 className="text-2xl mb-6">General</h2>
            <Accordion items={generalFaqs} />
          </div>
        </div>
      </section>

      {/* For Artists */}
      <section className="pb-16 lg:pb-20 scroll-mt-24" id="artists">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h2 className="text-2xl mb-6">For Artists</h2>
            <Accordion items={artistFaqs} />
          </div>
        </div>
      </section>

      {/* For Venues */}
      <section className="pb-16 lg:pb-20 scroll-mt-24" id="venues">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h2 className="text-2xl mb-6">For Venues</h2>
            <Accordion items={venueFaqs} />
          </div>
        </div>
      </section>

      {/* For Buyers, point at external pages for full policy answers */}
      <section className="pb-16 lg:pb-20 scroll-mt-24" id="buyers">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h2 className="text-2xl mb-6">For Buyers</h2>
            <div className="space-y-4 text-muted leading-relaxed">
              <p>
                Buying through Wallplace is the same as buying from any reputable online shop.
                See our <Link href="/terms" className="text-accent hover:underline">Terms of Sale</Link>,{" "}
                <Link href="/returns" className="text-accent hover:underline">Returns Policy</Link>, and{" "}
                <Link href="/complaints" className="text-accent hover:underline">Complaints Policy</Link>{" "}
                for the full answers to delivery, refunds, damage, and dispute questions.
              </p>
              <p>
                Don&rsquo;t have a Wallplace account? You can still{" "}
                <Link href="/orders/track" className="text-accent hover:underline">
                  track an order
                </Link>{" "}
                using the order ID + email from your receipt.
              </p>
              <p>
                Every piece on Wallplace is sold by the artist directly, we process the payment
                and coordinate the transaction. If anything goes wrong, email{" "}
                <a href="mailto:hello@wallplace.co.uk" className="text-accent hover:underline">hello@wallplace.co.uk</a>{" "}
                and we&rsquo;ll sort it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 lg:py-24 border-t border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl mb-4">Still have questions?</h2>
            <p className="text-muted leading-relaxed mb-8">
              We are happy to help. Get in touch and we will get back to you
              within 24 hours.
            </p>
            <Button href="/contact" variant="primary" size="lg">
              Contact Us
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
