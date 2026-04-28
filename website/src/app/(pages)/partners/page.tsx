// Partner with us (#26). Pitched at hospitality groups, property
// developers, build-to-rent operators, and similar B2B prospects who
// want art curated across multiple sites at once. Funnels into a
// contact form (mailto for now — switch to a real lead-capture endpoint
// when the partnerships pipeline lands).

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Partner with us — Wallplace",
  description:
    "Hospitality groups, build-to-rent operators, property developers and other multi-site partners — bring local artists into your spaces with one Wallplace account.",
};

const partnerProfiles = [
  {
    title: "Hospitality groups",
    blurb:
      "Restaurants, hotels, members' clubs, gyms — give every site a curated wall identity without flying art around the country. Local artists for local rooms.",
  },
  {
    title: "Build-to-rent & co-living",
    blurb:
      "Communal spaces feel finished, residents get a story for the room. Rotate quarterly to keep the building feeling new without hiring a curator.",
  },
  {
    title: "Property developers",
    blurb:
      "Show units with real, photogenic art on the walls — not Pinterest stock. We can match work to demographics, scheme aesthetics, and budget per phase.",
  },
  {
    title: "Workspaces & members' clubs",
    blurb:
      "Branded curation for meeting rooms, breakouts and lobby walls. Keep the same artist roster across new openings, or swap each site to its neighbourhood.",
  },
];

export default function PartnersPage() {
  return (
    <div className="bg-background">
      <section className="py-20 lg:py-28">
        <div className="max-w-[1100px] mx-auto px-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent mb-3">
            Partner with us
          </p>
          <h1 className="text-4xl lg:text-5xl font-serif text-foreground mb-6 leading-tight">
            Curated walls, across every site you run
          </h1>
          <p className="text-lg text-muted leading-relaxed max-w-2xl mb-12">
            Wallplace works the same way for a single café and for a fifty-site
            hospitality group — only the scale changes. If you operate
            multiple venues and want a consistent art programme without the
            overhead of hiring a curator per location, we want to talk.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-16">
            {partnerProfiles.map((p) => (
              <div
                key={p.title}
                className="bg-surface border border-border rounded-sm p-6"
              >
                <p className="text-base font-medium text-foreground mb-2">
                  {p.title}
                </p>
                <p className="text-sm text-muted leading-relaxed">{p.blurb}</p>
              </div>
            ))}
          </div>

          <div className="space-y-10 max-w-2xl">
            <div>
              <h2 className="text-2xl font-serif text-foreground mb-3">
                What we offer multi-site partners
              </h2>
              <ul className="list-disc pl-6 text-muted leading-relaxed space-y-2 marker:text-accent">
                <li>
                  One Wallplace account with multi-venue rollup — all your
                  sites, all your placements, one inbox.
                </li>
                <li>
                  Bespoke curation: shortlists by site, scheme, budget,
                  demographic, neighbourhood.
                </li>
                <li>
                  Rotation programmes — swap work seasonally without
                  re-procuring it. Artists keep ownership.
                </li>
                <li>
                  QR-led storytelling: customers scan, learn about the artist,
                  buy if they want to. Optional, off by default.
                </li>
                <li>
                  Single contracting + invoicing across the estate, framework
                  agreements where useful.
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-serif text-foreground mb-3">
                How it usually starts
              </h2>
              <ol className="list-decimal pl-6 text-muted leading-relaxed space-y-2 marker:text-accent">
                <li>
                  We have a 30-minute call about what your sites look like,
                  who visits, and what tone you're going for.
                </li>
                <li>
                  We propose a shortlist of artists per site (or per scheme),
                  with mockups on the actual walls where useful.
                </li>
                <li>
                  You pick the works and arrangements — placement loans,
                  outright purchase, mix of both. We handle the artist side.
                </li>
                <li>
                  Install. Live. Rotate when you want.
                </li>
              </ol>
            </div>
          </div>

          <div className="mt-14 bg-surface border border-border rounded-sm p-7 max-w-2xl">
            <p className="text-base font-medium text-foreground mb-2">
              Talk to the partnerships team
            </p>
            <p className="text-sm text-muted leading-relaxed mb-4">
              Tell us about your portfolio of sites. We'll come back with a
              tailored shortlist within five working days.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="mailto:partners@wallplace.co.uk?subject=Wallplace%20Partnership%20Enquiry"
                className="inline-flex items-center justify-center px-6 py-3 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
              >
                partners@wallplace.co.uk
              </a>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center px-6 py-3 border border-border text-foreground text-sm font-medium rounded-sm hover:border-foreground/40 transition-colors"
              >
                Use the contact form
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
