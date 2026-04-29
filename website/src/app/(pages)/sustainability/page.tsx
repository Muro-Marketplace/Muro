// Sustainability page (#25). Positions Wallplace as the
// circular-economy alternative to printed mass-market wall art:
// works are made by living artists, displayed in real spaces, and
// changed without going to landfill. Pitched at conscious venues
// and artists who care about where their work ends up.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sustainability, Wallplace",
  description:
    "How Wallplace makes the way the UK consumes wall art more sustainable: real artists, real spaces, no shipping-once-displayed-once cycle, and an alternative to landfill prints.",
};

export default function SustainabilityPage() {
  return (
    <div className="bg-background">
      <section className="py-20 lg:py-28">
        <div className="max-w-[1100px] mx-auto px-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent mb-3">
            Sustainability
          </p>
          <h1 className="text-4xl lg:text-5xl font-serif text-foreground mb-6 leading-tight">
            A more sustainable way to live with art
          </h1>
          <p className="text-lg text-muted leading-relaxed max-w-2xl mb-12">
            The mass market for wall art is built on cheap prints, fast
            shipping, and short ownership. Wallplace is the alternative,
            a slower, more durable model where original work moves between
            real spaces and stays out of landfill.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-16">
            <div className="bg-surface border border-border rounded-sm p-6">
              <p className="text-xs font-medium uppercase tracking-widest text-accent mb-3">
                Artists, not factories
              </p>
              <p className="text-sm text-foreground/85 leading-relaxed">
                Every work on Wallplace is made by a named, living artist,
                no anonymous mass-printing, no warehouse stock, no algorithmic
                "trending decor". Originals and small editions, with
                provenance.
              </p>
            </div>
            <div className="bg-surface border border-border rounded-sm p-6">
              <p className="text-xs font-medium uppercase tracking-widest text-accent mb-3">
                Long-stay placements
              </p>
              <p className="text-sm text-foreground/85 leading-relaxed">
                A piece on loan to a venue typically stays up for months,
                rotated rather than replaced. That's a fundamentally lower
                footprint than the print-buy-bin cycle of high-street decor.
              </p>
            </div>
            <div className="bg-surface border border-border rounded-sm p-6">
              <p className="text-xs font-medium uppercase tracking-widest text-accent mb-3">
                Shipped once
              </p>
              <p className="text-sm text-foreground/85 leading-relaxed">
                Direct artist-to-venue or artist-to-buyer dispatch. No
                third-party fulfilment hops, no overseas warehouses, no
                stock destroyed when it doesn't sell.
              </p>
            </div>
          </div>

          <div className="space-y-10 max-w-2xl">
            <div>
              <h2 className="text-2xl font-serif text-foreground mb-3">
                A circular wall-art economy
              </h2>
              <p className="text-muted leading-relaxed">
                Most wall art is bought once, hung once, and thrown out
                once tastes change. Wallplace is built around a different
                rhythm: artists keep their work in circulation, venues rotate
                pieces seasonally, and buyers end up with a real artwork from
                a real person rather than a print that depreciates the moment
                it ships. When a placement ends, the work goes back into the
                marketplace, not the bin.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-serif text-foreground mb-3">
                Local first
              </h2>
              <p className="text-muted leading-relaxed">
                Our location filters and "Spaces near me" surfaces nudge
                venues toward artists in the same city. Less freight, more
                local cultural ecosystem. Artists who live ten minutes from
                the venue can install in person, swap in new work without
                couriers, and build a relationship with the room.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-serif text-foreground mb-3">
                What we don't do
              </h2>
              <ul className="list-disc pl-6 text-muted leading-relaxed space-y-2 marker:text-accent">
                <li>We don't drop-ship anonymous mass-print decor.</li>
                <li>
                  We don't run a print-on-demand warehouse, every original
                  comes from the artist's studio.
                </li>
                <li>
                  We don't add &ldquo;new collections&rdquo; on a fashion
                  cycle to manufacture replacement demand.
                </li>
                <li>
                  We don't charge venues a platform fee, so there's no
                  pressure to over-stock walls just to justify a subscription.
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-serif text-foreground mb-3">
                Where we're going
              </h2>
              <p className="text-muted leading-relaxed">
                We're working toward giving every artist + venue a
                placement-history record so the lifetime journey of a work
               , first studio, first wall, first buyer, future loans, is
                tracked. The longer a piece stays in circulation, the better
                it is for the planet and for the artist's residual income.
              </p>
            </div>
          </div>

          <div className="mt-14 flex flex-wrap gap-3">
            <Link
              href="/apply"
              className="inline-flex items-center justify-center px-6 py-3 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
            >
              Apply as an artist
            </Link>
            <Link
              href="/register-venue"
              className="inline-flex items-center justify-center px-6 py-3 border border-border text-foreground text-sm font-medium rounded-sm hover:border-foreground/40 transition-colors"
            >
              Register your venue
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
