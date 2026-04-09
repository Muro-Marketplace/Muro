"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { venues } from "@/data/venues";
import Button from "@/components/Button";

const venueTypes = Array.from(new Set(venues.map((v) => v.type))).sort();
const venueLocations = Array.from(new Set(venues.map((v) => v.location))).sort();

function DealBadge({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  if (!active) return null;
  return (
    <span className="inline-block px-2 py-0.5 text-xs bg-accent/10 text-accent border border-accent/20 rounded-sm">
      {label}
    </span>
  );
}

export default function SpacesPage() {
  const [typeFilter, setTypeFilter] = useState("All");
  const [locationFilter, setLocationFilter] = useState("All");

  const filtered = venues.filter((v) => {
    const typeMatch = typeFilter === "All" || v.type === typeFilter;
    const locationMatch =
      locationFilter === "All" || v.location === locationFilter;
    return typeMatch && locationMatch;
  });

  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="relative -mt-14 lg:-mt-16 pt-28 lg:pt-32 pb-16 lg:pb-20 overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1559329007-40df8a9345d8?w=1920&h=600&fit=crop&crop=center"
            alt="Minimal restaurant interior"
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/65" />
        </div>
        <div className="relative z-10 max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <p className="text-accent text-sm font-medium uppercase tracking-wider mb-4">
              Venue Demand
            </p>
            <h1 className="text-4xl lg:text-5xl mb-6 text-white">
              Spaces looking for art
            </h1>
            <p className="text-xl text-white/60 leading-relaxed">
              These are real venues actively seeking artwork for their
              walls. Cafes, restaurants, hotels, coworking spaces – all with
              genuine interest in displaying and acquiring original art. Get your
              work in front of them by joining Wallspace.
            </p>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="py-6 bg-surface border-y border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-2xl font-serif text-foreground">
                {venues.length}
              </p>
              <p className="text-xs text-muted mt-0.5">Venues on the platform</p>
            </div>
            <div>
              <p className="text-2xl font-serif text-foreground">
                {venues.filter((v) => v.interestedInFreeLoan).length}
              </p>
              <p className="text-xs text-muted mt-0.5">Open to free loan</p>
            </div>
            <div>
              <p className="text-2xl font-serif text-foreground">
                {venues.filter((v) => v.interestedInDirectPurchase).length}
              </p>
              <p className="text-xs text-muted mt-0.5">Looking to purchase</p>
            </div>
            <div>
              <p className="text-2xl font-serif text-foreground">
                {venues.filter((v) => v.interestedInRevenueShare).length}
              </p>
              <p className="text-xs text-muted mt-0.5">Open to revenue share</p>
            </div>
          </div>
        </div>
      </section>

      {/* Filters + Grid */}
      <section className="py-16 lg:py-20">
        <div className="max-w-[1200px] mx-auto px-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-10">
            <div className="flex items-center gap-2">
              <label
                htmlFor="type-filter"
                className="text-sm text-muted shrink-0"
              >
                Venue type:
              </label>
              <select
                id="type-filter"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-surface border border-border rounded-sm px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/60 transition-colors duration-200"
              >
                <option value="All">All types</option>
                {venueTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label
                htmlFor="location-filter"
                className="text-sm text-muted shrink-0"
              >
                Location:
              </label>
              <select
                id="location-filter"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="bg-surface border border-border rounded-sm px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/60 transition-colors duration-200"
              >
                <option value="All">All locations</option>
                {venueLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
            {(typeFilter !== "All" || locationFilter !== "All") && (
              <button
                onClick={() => {
                  setTypeFilter("All");
                  setLocationFilter("All");
                }}
                className="text-sm text-muted hover:text-accent underline underline-offset-2 transition-colors duration-150"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Result count */}
          <p className="text-sm text-muted mb-6">
            Showing {filtered.length} venue{filtered.length !== 1 ? "s" : ""}
          </p>

          {/* Grid */}
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((venue) => (
                <Link
                  key={venue.slug}
                  href={`/spaces/${venue.slug}`}
                  className="group block"
                >
                  <div className="bg-surface border border-border rounded-sm overflow-hidden hover:border-accent/30 hover:shadow-sm transition-all duration-300 flex flex-col h-full">
                    {/* Image */}
                    <div className="aspect-[4/3] overflow-hidden relative">
                      <img
                        src={venue.image}
                        alt={venue.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-3 left-3">
                        <span className="inline-block px-2.5 py-1 bg-white/90 text-xs font-medium text-foreground rounded-sm">
                          {venue.type}
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5 flex flex-col flex-1">
                      <h2 className="text-lg font-medium text-foreground mb-1">
                        {venue.name}
                      </h2>
                      <p className="text-sm text-muted mb-3">
                        {venue.location} &middot; {venue.approximateFootfall}{" "}
                        footfall
                      </p>

                      {/* Deal signals */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        <DealBadge
                          label="Free loan"
                          active={venue.interestedInFreeLoan}
                        />
                        <DealBadge
                          label="Revenue share"
                          active={venue.interestedInRevenueShare}
                        />
                        <DealBadge
                          label="Wants to buy"
                          active={venue.interestedInDirectPurchase}
                        />
                      </div>

                      {/* Preferred styles */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {venue.preferredStyles.slice(0, 3).map((style) => (
                          <span
                            key={style}
                            className="inline-block px-2 py-0.5 text-xs text-muted bg-background border border-border rounded-sm"
                          >
                            {style}
                          </span>
                        ))}
                      </div>

                      <p className="text-xs text-muted leading-relaxed line-clamp-2 flex-1">
                        {venue.description}
                      </p>

                      <p className="text-xs text-accent mt-3 group-hover:underline underline-offset-2 transition-all duration-150">
                        View venue &rarr;
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <p className="text-muted">
                No venues match the current filters.
              </p>
              <button
                onClick={() => {
                  setTypeFilter("All");
                  setLocationFilter("All");
                }}
                className="mt-4 text-sm text-accent hover:underline underline-offset-2"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Artist CTA */}
      <section className="py-20 lg:py-24 bg-surface border-t border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl mb-4">
              Get your work in front of these venues
            </h2>
            <p className="text-muted leading-relaxed mb-8">
              Apply to join Wallspace and your profile will be visible to every
              venue on the platform. When a venue is looking for work that
              matches your style, we put you in front of them.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button href="/apply" size="lg">
                Apply to Join
              </Button>
              <Button href="/pricing" variant="secondary" size="lg">
                View Pricing
              </Button>
            </div>
            <p className="mt-6 text-sm text-muted">
              First month free. First 20 approved artists get 6 months free.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
