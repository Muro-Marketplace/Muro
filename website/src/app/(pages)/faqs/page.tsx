import Accordion from "@/components/Accordion";
import Button from "@/components/Button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQs – Wallspace",
  description:
    "Frequently asked questions about Wallspace for artists, venues, and buyers.",
};

const generalFaqs = [
  {
    question: "What is Wallspace?",
    answer:
      "Wallspace is a curated art placement service. We connect emerging and established artists with independent venues – cafes, restaurants, coworking spaces, offices, and more – that want original artwork on their walls. We handle the curation, logistics, and sales so that artists can focus on making work and venues can focus on running their business.",
  },
  {
    question: "How does Wallspace make money?",
    answer:
      "Wallspace earns through artist membership plans (from £9.99/month) and a platform fee on artwork sales (0–10% depending on the artist's plan). When a piece sells, the artist keeps the majority. We do not charge venues for displaying artwork.",
  },
  {
    question: "Is Wallspace a gallery?",
    answer:
      "Not in the traditional sense. We do not have a physical gallery space. Instead, we use the walls of independent venues as our exhibition spaces. This means artists get their work seen by thousands of people in everyday settings, and venues get beautiful original art without the cost of commissioning it directly.",
  },
];

const artistFaqs = [
  {
    question: "How much does it cost to join Wallspace as an artist?",
    answer:
      "It is free to apply. Once accepted, membership starts from £9.99/month (Core plan) with your first month free. Higher tiers (Premium at £29.99/month, Pro at £69.99/month) offer lower platform fees on sales and more visibility. The first 20 founding artists receive 6 months free on any tier. See our pricing page for full details.",
  },
  {
    question: "How does the curation process work?",
    answer:
      "After you submit your application with a portfolio of your work, our team reviews it based on technical quality, originality, consistency, and suitability for display in commercial spaces. We aim to respond within 5 business days. If accepted, we will schedule an onboarding call to discuss your portfolio, pricing, and preferences.",
  },
  {
    question: "What happens when my work sells?",
    answer:
      "When a piece sells, we handle the transaction and notify you immediately. You receive payment within 14 days of the sale. The sale price is split between you and Wallspace – you keep the majority. We handle all customer communication, invoicing, and delivery coordination.",
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
    answer:
      "All artwork displayed through Wallspace is covered by our damage policy. If a piece is damaged while on display, we work with the venue to resolve the situation and ensure the artist is compensated fairly. Venues agree to our care guidelines when they sign up.",
  },
  {
    question: "Can I cancel my membership?",
    answer:
      "Yes. You can withdraw from Wallspace at any time with 30 days notice. We will arrange the return of any artwork currently on display in venues. There are no cancellation fees or penalties.",
  },
  {
    question: "Is Wallspace exclusive? Can I sell my work elsewhere?",
    answer:
      "Wallspace is non-exclusive. You are free to sell your work through other channels, galleries, your own website, or any other platform. We only ask that if a piece is currently on display in a venue through Wallspace, you let us know before selling it through another channel so we can arrange a replacement.",
  },
];

const venueFaqs = [
  {
    question: "How much does it cost for a venue to display art?",
    answer:
      "Nothing. There is no cost to venues for displaying artwork through Wallspace. We provide the art, arrange delivery and installation, and manage the rotation. Venues benefit from beautiful original artwork at zero cost.",
  },
  {
    question: "Do we need to sign a contract?",
    answer:
      "Yes, we ask venues to sign a simple partnership agreement that covers the basics: care of artwork, display period, and what happens if a piece sells or is damaged. The agreement is straightforward, written in plain English, and can be cancelled with 30 days notice.",
  },
  {
    question: "What if a piece of art gets damaged?",
    answer:
      "We understand that venues are busy, working environments. Minor wear is expected. For significant damage, our partnership agreement includes a damage policy. We assess each situation on a case-by-case basis and work with both the venue and the artist to find a fair resolution.",
  },
  {
    question: "Can we choose which art to display?",
    answer:
      "Absolutely. We work with you to understand your space, your brand, and your preferences. We then propose a selection of artists and works that we think would be a great fit. You have the final say on what goes on your walls. We can also rotate work periodically to keep things fresh.",
  },
  {
    question: "What happens when a customer wants to buy a piece?",
    answer:
      "Each artwork on display includes a discreet label with the artist name, title, and a QR code or URL linking to the piece on Wallspace. Customers can enquire or purchase directly through us. Your staff do not need to handle any sales – they just point customers to the label.",
  },
  {
    question: "Do our staff need to do anything?",
    answer:
      "Very little. We handle delivery, installation, and removal. All your team needs to do is keep an eye on the artwork (as they would any decor), point curious customers to the artwork labels, and let us know if anything needs attention. We provide a brief guide for staff when artwork is installed.",
  },
  {
    question: "How often does the artwork change?",
    answer:
      "That depends on your preference. Some venues prefer a rotation every 2-3 months to keep the space feeling fresh. Others prefer to keep pieces longer, especially if they suit the space well. We work with you to find the right cadence. Rotations are scheduled in advance and managed entirely by us.",
  },
  {
    question: "Can we buy the artwork ourselves?",
    answer:
      "Yes. Many venue owners fall in love with the pieces on their walls. You can purchase any artwork at the listed price. If you want to keep a piece permanently, just let us know and we will arrange the sale. Some artists also offer special pricing for venue purchases.",
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
              Everything you need to know about how Wallspace works for artists,
              venues, and art lovers.
            </p>
          </div>
        </div>
      </section>

      {/* General */}
      <section className="pb-16 lg:pb-20">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h2 className="text-2xl mb-6">General</h2>
            <Accordion items={generalFaqs} />
          </div>
        </div>
      </section>

      {/* For Artists */}
      <section className="pb-16 lg:pb-20">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h2 className="text-2xl mb-6">For Artists</h2>
            <Accordion items={artistFaqs} />
          </div>
        </div>
      </section>

      {/* For Venues */}
      <section className="pb-16 lg:pb-20">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h2 className="text-2xl mb-6">For Venues</h2>
            <Accordion items={venueFaqs} />
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
