"use client";

// Artists browse open venue artwork requests + respond.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import { authFetch } from "@/lib/api-client";

interface RequestRow {
  id: string;
  title: string;
  description: string;
  intent: string[];
  styles: string[];
  mediums: string[];
  budget_min_pence: number | null;
  budget_max_pence: number | null;
  location: string | null;
  timescale: string | null;
  venue_slug: string | null;
  venue_name: string | null;
  created_at: string;
}

export default function ArtistArtworkRequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 2.1 D1: default view shows only requests this artist has
  // engaged with (responded or saved a draft). The toggle flips to
  // the full open-requests feed. Phase 2.5 (B1) will paywall the
  // "All open requests" view behind subscription.
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // authFetch attaches the Supabase bearer token so the API can
      // resolve the artist's slug and include any private requests
      // they've been invited to. The plain fetch() variant didn't
      // forward the token, so artists never saw their private
      // invitations and the inbox always read as "No open requests"
      // for accounts the venue had hand-picked.
      const qs = showAll ? "status=open" : "status=open&mine_only=1";
      const res = await authFetch(`/api/artwork-requests?${qs}`);
      const data = await res.json();
      setRows(data.requests || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => { load(); }, [load]);

  return (
    <ArtistPortalLayout activePath="/artist-portal/artwork-requests">
      <div className="max-w-3xl px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-serif">Artwork requests</h1>
          <p className="text-sm text-muted mt-1">
            Venues telling the platform what they&rsquo;re looking for. Each response counts towards your daily venue-outreach allowance.
          </p>
        </div>

        <div className="flex items-center gap-1 mb-6 border-b border-border" role="tablist">
          <button
            onClick={() => setShowAll(false)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              !showAll
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
            role="tab"
            aria-selected={!showAll}
          >
            My responses
          </button>
          <button
            onClick={() => setShowAll(true)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              showAll
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
            role="tab"
            aria-selected={showAll}
          >
            All open requests
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">
            {showAll
              ? "No open requests right now."
              : "You haven't responded to any requests yet. Tap \"All open requests\" to browse them."}
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/artist-portal/artwork-requests/${r.id}`}
                  className="block bg-surface border border-border hover:border-accent/40 rounded-sm p-5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-base font-medium">{r.title}</h3>
                    <span className="text-[10px] text-muted">
                      {r.venue_name || "Venue"}
                    </span>
                  </div>
                  <p className="text-sm text-muted line-clamp-2 mb-3">{r.description}</p>
                  <div className="flex flex-wrap gap-2 text-[10px]">
                    {r.intent.map((i) => <span key={i} className="px-1.5 py-0.5 bg-accent/5 text-accent rounded-sm capitalize">{i}</span>)}
                    {r.mediums.slice(0, 4).map((m) => <span key={m} className="px-1.5 py-0.5 bg-foreground/5 text-foreground/70 rounded-sm">{m}</span>)}
                    {(r.budget_min_pence || r.budget_max_pence) && (
                      <span className="px-1.5 py-0.5 bg-foreground/5 text-foreground/70 rounded-sm">
                        £{((r.budget_min_pence || 0) / 100).toFixed(0)} to £{((r.budget_max_pence || 0) / 100).toFixed(0)}
                      </span>
                    )}
                    {r.location && <span className="px-1.5 py-0.5 bg-foreground/5 text-foreground/70 rounded-sm">{r.location}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ArtistPortalLayout>
  );
}
