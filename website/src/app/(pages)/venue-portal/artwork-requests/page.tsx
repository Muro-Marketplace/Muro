"use client";

// Venue's own artwork-request management.
// - List of requests they've posted with quick stats
// - "New request" CTA opens the form

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import {
  clearRecentRequest,
  getRecentRequests,
} from "@/lib/recent-artwork-requests";

interface Row {
  id: string;
  title: string;
  description: string;
  intent: string[];
  status: "open" | "closed" | "fulfilled";
  visibility: "public" | "semi_public" | "private";
  budget_min_pence: number | null;
  budget_max_pence: number | null;
  created_at: string;
  /** Set when the row came from the local "just submitted" cache,
   *  not the API. Used to surface a subtle "syncing" affordance so
   *  the user understands why it's appearing. */
  _local?: boolean;
}

export default function VenueArtworkRequestsPage() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/artwork-requests?mine=1");
      const data = await res.json();
      const apiRows: Row[] = data.requests || [];

      // QA-driven workaround: the API's `?mine=1` filter sometimes
      // fails to return a request the venue has just inserted, even
      // though it's already visible on the public venue page. Merge
      // any rows the venue cached locally on submit so the list
      // doesn't read as "No requests yet" while the row actually
      // exists. Dedupe by id, and if the API now returns the cached
      // row, drop it from the cache so we don't render twice.
      const apiIds = new Set(apiRows.map((r) => r.id));
      const cached = getRecentRequests();
      const localOnly: Row[] = [];
      for (const r of cached) {
        if (apiIds.has(r.id)) {
          clearRecentRequest(r.id);
          continue;
        }
        localOnly.push({
          id: r.id,
          title: r.title,
          description: r.description,
          intent: r.intent,
          status: r.status,
          visibility: (r.visibility as Row["visibility"]) || "semi_public",
          budget_min_pence: r.budget_min_pence,
          budget_max_pence: r.budget_max_pence,
          created_at: r.created_at,
          _local: true,
        });
      }
      // Local-only rows on top so a venue lands on their just-submitted
      // request first.
      setRows([...localOnly, ...apiRows]);
    } catch {
      setRows(
        getRecentRequests().map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          intent: r.intent,
          status: r.status,
          visibility: (r.visibility as Row["visibility"]) || "semi_public",
          budget_min_pence: r.budget_min_pence,
          budget_max_pence: r.budget_max_pence,
          created_at: r.created_at,
          _local: true,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!authLoading && user) load(); }, [authLoading, user, load]);

  return (
    <VenuePortalLayout activePath="/venue-portal/artwork-requests">
      <div className="max-w-3xl px-4 sm:px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-serif">Artwork requests</h1>
            <p className="text-sm text-muted mt-1">Tell artists what you&rsquo;re looking for. They&rsquo;ll reply with works, placements, offers, or commission ideas.</p>
          </div>
          <Link
            href="/venue-portal/artwork-requests/new"
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-sm transition-colors shrink-0"
          >
            + New request
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted bg-surface border border-border rounded-sm p-6 text-center">
            <p className="mb-3">No requests yet.</p>
            <Link href="/venue-portal/artwork-requests/new" className="text-accent hover:underline">Post your first request →</Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/venue-portal/artwork-requests/${r.id}`}
                  className="block bg-surface border border-border hover:border-accent/40 rounded-sm p-5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <h3 className="text-base font-medium">{r.title}</h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {r._local && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-sm border bg-amber-50 text-amber-700 border-amber-200"
                          title="Just submitted. Showing from local cache while it syncs to your portal."
                        >
                          Syncing
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border capitalize ${
                        r.status === "open" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-foreground/5 text-foreground/40 border-border"
                      }`}>{r.status}</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted line-clamp-2 mb-2">{r.description}</p>
                  <div className="flex flex-wrap gap-2 text-[10px] text-muted">
                    {r.intent.map((i) => <span key={i} className="px-1.5 py-0.5 bg-foreground/5 rounded-sm capitalize">{i}</span>)}
                    {(r.budget_min_pence || r.budget_max_pence) && (
                      <span className="px-1.5 py-0.5 bg-foreground/5 rounded-sm">
                        £{((r.budget_min_pence || 0) / 100).toFixed(0)} to £{((r.budget_max_pence || 0) / 100).toFixed(0)}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </VenuePortalLayout>
  );
}
