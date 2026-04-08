import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { venues } from "@/data/venues";
import Button from "@/components/Button";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return venues.map((venue) => ({ slug: venue.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const venue = venues.find((v) => v.slug === slug);
  if (!venue) return {};
  return {
    title: `${venue.name} – Wallspace`,
    description: `${venue.name} in ${venue.location} is looking for artwork on Wallspace. ${venue.description.slice(0, 120)}...`,
  };
}

function DealTag({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-sm border ${
        active
          ? "bg-accent/5 border-accent/30 text-accent"
          : "bg-background border-border text-muted line-through opacity-50"
      }`}
    >
      {active && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 6.5l2.5 2.5L10 3" />
        </svg>
      )}
      {label}
    </span>
  );
}

export default async function VenueProfilePage({ params }: Props) {
  const { slug } = await params;
  const venue = venues.find((v) => v.slug === slug);

  if (!venue) {
    notFound();
  }

  return (
    <div className="bg-background">
      {/* Back nav */}
      <div className="max-w-[1200px] mx-auto px-6 pt-8">
        <a
          href="/spaces"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent transition-colors duration-150"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 3L5 8l5 5" />
          </svg>
          All spaces
        </a>
      </div>

      {/* Hero image */}
      <section className="py-8">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="rounded-sm overflow-hidden aspect-[21/9]">
            <img
              src={venue.image}
              alt={venue.name}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="pb-20 lg:pb-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12 lg:gap-16">
            {/* Main content */}
            <div>
              {/* Header */}
              <div className="mb-8">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="inline-block px-2.5 py-1 bg-surface border border-border text-xs font-medium text-foreground rounded-sm">
                    {venue.type}
                  </span>
                  <span className="text-sm text-muted">{venue.location}</span>
                </div>
                <h1 className="text-4xl lg:text-5xl mb-4">{venue.name}</h1>
                <p className="text-lg text-muted leading-relaxed">
                  {venue.description}
                </p>
              </div>

              {/* What they're looking for */}
              <div className="mb-10">
                <h2 className="text-2xl mb-5">What they&rsquo;re looking for</h2>

                <div className="mb-6">
                  <p className="text-sm font-medium text-foreground mb-3">
                    Preferred styles
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {venue.preferredStyles.map((style) => (
                      <span
                        key={style}
                        className="inline-block px-3 py-1.5 text-sm bg-surface border border-border text-foreground rounded-sm"
                      >
                        {style}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <p className="text-sm font-medium text-foreground mb-3">
                    Preferred themes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {venue.preferredThemes.map((theme) => (
                      <span
                        key={theme}
                        className="inline-block px-3 py-1.5 text-sm bg-surface border border-border text-foreground rounded-sm"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-foreground mb-3">
                    Deal types they&rsquo;re open to
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <DealTag
                      label="Free loan"
                      active={venue.interestedInFreeLoan}
                    />
                    <DealTag
                      label="Revenue share"
                      active={venue.interestedInRevenueShare}
                    />
                    <DealTag
                      label="Direct purchase"
                      active={venue.interestedInDirectPurchase}
                    />
                  </div>
                </div>
              </div>

              {/* Additional signals */}
              <div className="bg-surface border border-border rounded-sm p-6">
                <h3 className="text-lg mb-4">Additional notes</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      label: "Interested in collections",
                      active: venue.interestedInCollections,
                    },
                    {
                      label: "Prefers local artists",
                      active: venue.interestedInLocalArtists,
                    },
                    {
                      label: "Interested in framed work",
                      active: venue.interestedInFramedWork,
                    },
                    {
                      label: "Open to rotating artwork",
                      active: venue.interestedInRotatingArtwork,
                    },
                  ].map(({ label, active }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                          active ? "bg-accent/10" : "bg-border"
                        }`}
                      >
                        {active ? (
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 8 8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-accent"
                          >
                            <path d="M1.5 4.5l1.5 1.5L6.5 2" />
                          </svg>
                        ) : (
                          <svg
                            width="6"
                            height="6"
                            viewBox="0 0 6 6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            className="text-muted"
                          >
                            <path d="M1 1l4 4M5 1l-4 4" />
                          </svg>
                        )}
                      </span>
                      <span
                        className={`text-sm ${active ? "text-foreground" : "text-muted"}`}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick facts */}
              <div className="bg-surface border border-border rounded-sm p-6">
                <h3 className="text-lg mb-5">Venue details</h3>
                <dl className="space-y-4">
                  <div>
                    <dt className="text-xs font-medium text-muted uppercase tracking-wider mb-1">
                      Type
                    </dt>
                    <dd className="text-sm text-foreground">{venue.type}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted uppercase tracking-wider mb-1">
                      Location
                    </dt>
                    <dd className="text-sm text-foreground">{venue.location}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted uppercase tracking-wider mb-1">
                      Footfall
                    </dt>
                    <dd className="text-sm text-foreground">
                      {venue.approximateFootfall}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted uppercase tracking-wider mb-1">
                      Audience
                    </dt>
                    <dd className="text-sm text-foreground">
                      {venue.audienceType}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted uppercase tracking-wider mb-1">
                      Wall space available
                    </dt>
                    <dd className="text-sm text-foreground">{venue.wallSpace}</dd>
                  </div>
                </dl>
              </div>

              {/* CTA card */}
              <div className="bg-accent/5 border border-accent/20 rounded-sm p-6">
                <h3 className="text-lg mb-3">
                  Get discovered by venues like this
                </h3>
                <p className="text-sm text-muted leading-relaxed mb-5">
                  Apply to join Wallspace and your profile will be visible to{" "}
                  {venue.name} and every other venue on the platform looking for
                  artwork that matches your style.
                </p>
                <Button href="/apply" size="md" className="w-full justify-center">
                  Apply to Join
                </Button>
                <p className="mt-3 text-xs text-muted text-center">
                  First month free for all approved artists
                </p>
              </div>

              {/* Back to venues */}
              <a
                href="/spaces"
                className="flex items-center justify-center gap-2 w-full py-2.5 text-sm text-muted hover:text-accent border border-border rounded-sm transition-colors duration-150"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 2.5L4.5 7 9 11.5" />
                </svg>
                See all venues
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
