"use client";

// Public-surface artwork-requests list. Used standalone on
// /artwork-requests and inline as a tab on /spaces.
//
// Data source: /api/artwork-requests/public (unauth, curated fields,
// joined with venue_profiles for the venue name + image).

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import EmptyState from "@/components/EmptyState";

export interface PublicArtworkRequest {
  id: string;
  title: string;
  description: string;
  intent: string[];
  styles: string[];
  mediums: string[];
  budget_min_pence: number | null;
  budget_max_pence: number | null;
  qr_revenue_share_percent: number | null;
  location: string | null;
  timescale: string | null;
  created_at: string;
  venue_slug: string | null;
  venue_name: string;
  venue_type: string | null;
  venue_location: string | null;
  venue_image: string | null;
}

function formatBudget(minP: number | null, maxP: number | null): string | null {
  if (!minP && !maxP) return null;
  const min = minP ? Math.round(minP / 100) : 0;
  const max = maxP ? Math.round(maxP / 100) : 0;
  if (min && max) return `£${min} to £${max}`;
  if (min) return `From £${min}`;
  if (max) return `Up to £${max}`;
  return null;
}

function arrangementSummary(r: PublicArtworkRequest): string {
  const parts: string[] = [];
  if (r.intent.includes("display")) {
    parts.push(
      r.qr_revenue_share_percent != null
        ? `QR display · ${r.qr_revenue_share_percent}% to artist`
        : "Display",
    );
  }
  if (r.intent.includes("purchase")) parts.push("Purchase");
  if (r.intent.includes("commission")) parts.push("Commission");
  if (r.intent.includes("loan")) parts.push("Loan");
  return parts.join(" · ");
}

export default function ArtworkRequestsList() {
  const [rows, setRows] = useState<PublicArtworkRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/artwork-requests/public", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setRows(data.requests || []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-muted text-center py-16">Loading requests…</p>;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No open requests right now"
        hint="Venues post here when they&rsquo;re actively looking for work. Check back soon, or browse spaces directly."
        cta={{ label: "Browse spaces", href: "/spaces" }}
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {rows.map((r) => {
        const budget = formatBudget(r.budget_min_pence, r.budget_max_pence);
        const arrangement = arrangementSummary(r);
        const venueHref = r.venue_slug ? `/venues/${r.venue_slug}` : null;
        return (
          <li
            key={r.id}
            className="relative bg-surface border border-border rounded-sm overflow-hidden transition-all hover:border-accent/30 hover:shadow-sm"
          >
            {r.venue_image && (
              <div className="h-36 relative bg-border/20">
                <Image
                  src={r.venue_image}
                  alt={r.venue_name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              </div>
            )}
            <div className="p-5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted">
                    {r.venue_type || "Venue"}
                    {r.venue_location ? ` · ${r.venue_location}` : ""}
                  </p>
                  <h3 className="text-base font-medium text-foreground truncate">
                    {r.venue_name}
                  </h3>
                </div>
              </div>

              <p className="text-sm font-medium text-foreground mb-1.5">{r.title}</p>
              <p className="text-xs text-muted leading-relaxed line-clamp-3 mb-3">
                {r.description}
              </p>

              {arrangement && (
                <div className="mb-3">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
                    Arrangement
                  </p>
                  <p className="text-xs text-foreground/80">{arrangement}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 mb-3">
                {budget && (
                  <span className="text-[10px] px-2 py-0.5 bg-foreground/5 text-foreground/70 rounded-sm">
                    {budget}
                  </span>
                )}
                {r.timescale && (
                  <span className="text-[10px] px-2 py-0.5 bg-foreground/5 text-foreground/70 rounded-sm capitalize">
                    {r.timescale}
                  </span>
                )}
                {r.location && !r.venue_location && (
                  <span className="text-[10px] px-2 py-0.5 bg-foreground/5 text-foreground/70 rounded-sm">
                    {r.location}
                  </span>
                )}
              </div>

              {(r.styles?.length || r.mediums?.length) ? (
                <div className="flex flex-wrap gap-1 mb-3">
                  {r.styles.slice(0, 3).map((s) => (
                    <span
                      key={`s-${s}`}
                      className="text-[10px] px-2 py-0.5 bg-accent/5 text-accent border border-accent/15 rounded-full"
                    >
                      {s}
                    </span>
                  ))}
                  {r.mediums.slice(0, 2).map((m) => (
                    <span
                      key={`m-${m}`}
                      className="text-[10px] px-2 py-0.5 bg-foreground/5 text-foreground/70 rounded-full"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
                {venueHref ? (
                  <Link
                    href={venueHref}
                    className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                  >
                    View venue →
                  </Link>
                ) : (
                  <span className="text-xs text-muted">Venue details unavailable</span>
                )}
                <Link
                  href={`/login?next=${encodeURIComponent(`/artist-portal/artwork-requests/${r.id}`)}`}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  Sign in to respond
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
