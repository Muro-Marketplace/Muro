import Image from "next/image";
import { Metadata } from "next";
import Button from "@/components/Button";

export const metadata: Metadata = {
  title: "How It Works — Wallspace",
  description:
    "A simple process for artists and venues. Learn how Wallspace places curated art into independent spaces.",
};

const artistSteps = [
  {
    number: "1",
    title: "Apply",
    description:
      "Submit your portfolio. We review every application personally.",
  },
  {
    number: "2",
    title: "Get Accepted",
    description:
      "We're selective. Quality is how we maintain venue trust.",
  },
  {
    number: "3",
    title: "Choose Your Membership",
    description:
      "Select the tier that fits. From \u00A39.99/month.",
  },
  {
    number: "4",
    title: "Get Placed",
    description:
      "We match your work to venues that suit your style.",
  },
  {
    number: "5",
    title: "Get Seen & Sold",
    description:
      "Your work on the wall. Customers scan QR, buy directly.",
  },
];

const venueSteps = [
  {
    number: "1",
    title: "Tell Us About Your Space",
    description:
      "2-minute form. We respond within 24 hours.",
  },
  {
    number: "2",
    title: "We Visit & Plan",
    description:
      "15-minute site visit. We photograph and understand your aesthetic.",
  },
  {
    number: "3",
    title: "You Approve",
    description:
      "We send a curated shortlist. You pick what goes up.",
  },
  {
    number: "4",
    title: "We Install & Manage",
    description:
      "Delivered, installed, labelled, maintained. You're done.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative py-24 md:py-32 -mt-14 lg:-mt-16 pt-28 lg:pt-32 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=1920&h=600&fit=crop&crop=center"
            alt="Art being created"
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <h1 className="font-serif text-5xl md:text-6xl text-white tracking-tight">
            How Wallspace Works
          </h1>
          <p className="mt-6 text-lg text-white/60 max-w-lg mx-auto">
            A simple process for artists and venues.
          </p>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="border-t border-border" />
      </div>

      {/* Artist Journey */}
      <section className="py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-medium tracking-widest uppercase text-accent">
              For Artists
            </p>
            <h2 className="mt-4 font-serif text-3xl md:text-4xl text-foreground">
              Your Journey
            </h2>
          </div>
          <div className="mt-16 max-w-2xl space-y-0">
            {artistSteps.map((step, index) => (
              <div key={step.number} className="relative flex gap-6 pb-12 last:pb-0">
                {/* Vertical line */}
                {index < artistSteps.length - 1 && (
                  <div className="absolute left-[18px] top-10 bottom-0 w-px bg-border" />
                )}
                {/* Number circle */}
                <span className="relative z-10 flex-shrink-0 w-[38px] h-[38px] rounded-full border border-border bg-background flex items-center justify-center text-sm text-muted">
                  {step.number}
                </span>
                {/* Content */}
                <div className="pt-1.5">
                  <p className="text-lg font-medium text-foreground">
                    {step.title}
                  </p>
                  <p className="mt-2 text-muted leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="border-t border-border" />
      </div>

      {/* Venue Journey */}
      <section className="py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-medium tracking-widest uppercase text-accent">
              For Venues
            </p>
            <h2 className="mt-4 font-serif text-3xl md:text-4xl text-foreground">
              Your Journey
            </h2>
          </div>
          <div className="mt-16 max-w-2xl space-y-0">
            {venueSteps.map((step, index) => (
              <div key={step.number} className="relative flex gap-6 pb-12 last:pb-0">
                {/* Vertical line */}
                {index < venueSteps.length - 1 && (
                  <div className="absolute left-[18px] top-10 bottom-0 w-px bg-border" />
                )}
                {/* Number circle */}
                <span className="relative z-10 flex-shrink-0 w-[38px] h-[38px] rounded-full border border-border bg-background flex items-center justify-center text-sm text-muted">
                  {step.number}
                </span>
                {/* Content */}
                <div className="pt-1.5">
                  <p className="text-lg font-medium text-foreground">
                    {step.title}
                  </p>
                  <p className="mt-2 text-muted leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-16 text-muted text-center max-w-2xl">
            Total time commitment for venues: about 30 minutes.
          </p>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="border-t border-border" />
      </div>

      {/* Final CTA */}
      <section className="py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 md:gap-16 max-w-3xl mx-auto text-center">
            <div>
              <h3 className="font-serif text-2xl text-foreground">
                For Artists
              </h3>
              <p className="mt-3 text-muted">
                Get your work on real walls in the best independent
                spaces.
              </p>
              <div className="mt-6">
                <Button href="/artists" size="lg">
                  Apply as an Artist
                </Button>
              </div>
              <p className="mt-3 text-sm text-muted">
                Membership from &pound;9.99/month
              </p>
            </div>
            <div>
              <h3 className="font-serif text-2xl text-foreground">
                For Venues
              </h3>
              <p className="mt-3 text-muted">
                Beautiful art, curated and installed for free. No strings
                attached.
              </p>
              <div className="mt-6">
                <Button href="/venues" variant="secondary" size="lg">
                  Request Artwork
                </Button>
              </div>
              <p className="mt-3 text-sm text-muted">
                Completely free. No contracts.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
