"use client";

// Venue's own artwork-request management.
// - List of requests they've posted with quick stats
// - "New request" CTA opens the form

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";

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
      setRows(data.requests || []);
    } catch {
      setRows([]);
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
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border capitalize ${
                      r.status === "open" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-foreground/5 text-foreground/40 border-border"
                    }`}>{r.status}</span>
                  </div>
                  <p className="text-sm text-muted line-clamp-2 mb-2">{r.description}</p>
                  <div className="flex flex-wrap gap-2 text-[10px] text-muted">
                    {r.intent.map((i) => <span key={i} className="px-1.5 py-0.5 bg-foreground/5 rounded-sm capitalize">{i}</span>)}
                    {(r.budget_min_pence || r.budget_max_pence) && (
                      <span className="px-1.5 py-0.5 bg-foreground/5 rounded-sm">
                        £{((r.budget_min_pence || 0) / 100).toFixed(0)}–£{((r.budget_max_pence || 0) / 100).toFixed(0)}
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
