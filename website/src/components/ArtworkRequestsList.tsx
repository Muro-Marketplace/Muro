"use client";

// Artist-gated artwork-requests list. Used standalone on
// /artwork-requests and inline as a tab on /spaces.
//
// Data source: /api/artwork-requests/public (auth-required, returns
// curated fields joined with venue_profiles for the venue name + image).
// Non-artists see a gated explainer with the right CTAs instead of
// the list, and the API double-checks the caller is a verified artist
// so a direct fetch can't bypass the UI gate.

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

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
    // E23: qr_revenue_share_percent is the VENUE'S share of each QR sale
    // (canonical direction, same as placements.revenue_share_percent).
    // Derive the artist-facing "you keep X%" from it rather than showing
    // the raw number as if it were the artist's cut.
    parts.push(
      r.qr_revenue_share_percent != null
        ? `QR display · you keep ${100 - r.qr_revenue_share_percent}% of sales`
        : "Display",
    );
  }
  if (r.intent.includes("purchase")) parts.push("Purchase");
  if (r.intent.includes("commission")) parts.push("Commission");
  if (r.intent.includes("loan")) parts.push("Loan");
  return parts.join(" · ");
}

export default function ArtworkRequestsList() {
  const { user, userType, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<PublicArtworkRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const isArtist = !!user && userType === "artist";

  useEffect(() => {
    if (authLoading) return;
    if (!isArtist) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    authFetch("/api/artwork-requests/public", { cache: "no-store" })
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
  }, [authLoading, isArtist]);

  if (authLoading || (isArtist && loading)) {
    return <p className="text-sm text-muted text-center py-16">Loading requests…</p>;
  }

  // Gate. Only verified artists can see what venues are asking for, so
  // we don't broadcast active demand back to the venues themselves and
  // we keep the channel a useful artist-side workflow instead of a
  // browseable feed.
  if (!isArtist) {
    if (!user) {
      return (
        <EmptyState
          title="Open requests are for Wallplace artists"
          hint="Sign in as an artist to browse what venues are looking for and respond directly. New here? Apply to join, accepted artists get their first month free."
          cta={{ label: "Sign in", href: "/login?next=/spaces?view=requests" }}
          secondaryCta={{ label: "Apply to join", href: "/apply" }}
        />
      );
    }
    return (
      <EmptyState
        title="Open requests are for artists"
        hint={
          userType === "venue"
            ? "Open requests is the artist-side view of venue demand. To post your own request, head to your venue portal."
            : "This list is reserved for Wallplace artists. If you'd like to apply, we'd love to see your work."
        }
        cta={
          userType === "venue"
            ? { label: "Open venue portal", href: "/venue-portal/artwork-requests" }
            : { label: "Apply to join as an artist", href: "/apply" }
        }
      />
    );
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
                  href={`/artist-portal/artwork-requests/${r.id}`}
                  className="text-xs font-medium text-foreground hover:text-accent transition-colors"
                >
                  Respond →
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
