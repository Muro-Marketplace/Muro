"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

const artistSteps = [
  { number: "1", title: "Apply", description: "Submit your portfolio for review. We respond within 5 business days. We accept artists whose work is ready for commercial spaces." },
  { number: "2", title: "Set up your storefront", description: "Build your Wallplace profile — your portfolio and online shop in one. Upload works, set sizes and prices." },
  { number: "3", title: "Choose your plan", description: "Core from £9.99/month. First month free. Lower fees on higher tiers. First 20 artists get 6 months free." },
  { number: "4", title: "Get matched with venues", description: "Venues browse the marketplace filtered by style and medium. You can also message venues directly and request placements." },
  { number: "5", title: "Display & sell", description: "Your work goes on venue walls with QR codes. Customers scan, browse your store, and buy — you get paid, the venue earns a share." },
];

const venueSteps = [
  { number: "1", title: "Register your venue", description: "2-minute sign-up. Tell us your space type, preferred styles, and what you're looking for. Start browsing immediately." },
  { number: "2", title: "Browse the marketplace", description: "Filter artists by style, medium, location, and commercial terms. Find work that fits your space." },
  { number: "3", title: "Request a placement", description: "Message artists directly or request specific works for your walls. Agree terms — free display, revenue share, or purchase." },
  { number: "4", title: "Display artwork", description: "The artist delivers and you display. Each piece has a QR code linking customers to the artist's store." },
  { number: "5", title: "Earn from sales", description: "When a customer scans and buys, you earn your agreed revenue share. Track everything in your venue portal." },
];

export default function HowItWorksPage() {
  const [activeTab, setActiveTab] = useState<"artist" | "venue">("venue");
  const steps = activeTab === "artist" ? artistSteps : venueSteps;

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
          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl text-white tracking-tight">
            How Wallplace Works
          </h1>
          <p className="mt-6 text-lg text-white/60 max-w-lg mx-auto">
            A simple process — whether you&rsquo;re an artist or a venue.
          </p>
        </div>
      </section>

      {/* Toggle */}
      <div className="border-b border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex items-center justify-center gap-0">
            <button
              onClick={() => setActiveTab("venue")}
              className={`px-8 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "venue" ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              I&rsquo;m a Venue
            </button>
            <button
              onClick={() => setActiveTab("artist")}
              className={`px-8 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "artist" ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              I&rsquo;m an Artist
            </button>
          </div>
        </div>
      </div>

      {/* Steps */}
      <section className="py-16 lg:py-24">
        <div className="max-w-[800px] mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-3">
              {activeTab === "artist" ? "For Artists" : "For Venues"}
            </p>
            <h2 className="font-serif text-3xl md:text-4xl text-foreground">
              {activeTab === "artist" ? "From application to your first sale" : "From sign-up to art on your walls"}
            </h2>
          </div>

          <div className="space-y-0">
            {steps.map((step, index) => (
              <div key={step.number} className="relative flex gap-6 pb-12 last:pb-0">
                {index < steps.length - 1 && (
                  <div className="absolute left-[18px] top-10 bottom-0 w-px bg-border" />
                )}
                <span className={`relative z-10 flex-shrink-0 w-[38px] h-[38px] rounded-full flex items-center justify-center text-sm font-medium ${
                  index === steps.length - 1 ? "bg-accent text-white" : "border border-border bg-background text-muted"
                }`}>
                  {step.number}
                </span>
                <div className="pt-1.5">
                  <p className="text-lg font-medium text-foreground">{step.title}</p>
                  <p className="mt-2 text-muted leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-20 bg-foreground">
        <div className="max-w-[600px] mx-auto px-6 text-center">
          {activeTab === "artist" ? (
            <>
              <h2 className="font-serif text-3xl text-white mb-4">Ready to get your work out there?</h2>
              <p className="text-white/50 mb-8">Your portfolio. Your storefront. Your venues. All in one place.</p>
              <Link href="/apply" className="inline-flex items-center justify-center min-w-[200px] px-8 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors">
                APPLY TO JOIN
              </Link>
              <p className="mt-4 text-xs text-white/40">First month free. From £9.99/month.</p>
            </>
          ) : (
            <>
              <h2 className="font-serif text-3xl text-white mb-4">Ready to fill your walls?</h2>
              <p className="text-white/50 mb-8">Free to browse, free to display. Earn from every sale.</p>
              <Link href="/register-venue" className="inline-flex items-center justify-center min-w-[200px] px-8 py-3.5 bg-white text-foreground text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-white/90 transition-colors">
                REGISTER YOUR VENUE
              </Link>
              <p className="mt-4 text-xs text-white/40">Completely free. No contracts.</p>
            </>
          )}
        </div>
      </section>
    </>
  );
}
