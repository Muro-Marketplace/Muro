// Venue analytics, QR scan totals + top works/artists pulled
// from /api/analytics/venue. Mirrors the artist analytics layout
// at a smaller scope; the venue side only gets QR-scan signal at
// the moment because that's all we deterministically know
// happened *at the venue* (page views are tied to the artist's
// site, not the room).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { authFetch } from "@/lib/api-client";

const dateRanges = ["Last 7 days", "Last 30 days", "Last 3 months", "Last 12 months", "All time"];

function dateRangeToParam(range: string): string {
  switch (range) {
    case "Last 7 days": return "7d";
    case "Last 30 days": return "30d";
    case "Last 3 months": return "90d";
    case "Last 12 months": return "12m";
    case "All time": return "all";
    default: return "30d";
  }
}

interface VenueAnalytics {
  totals: { qr_scans: number };
  scans_over_time: { date: string; scans: number }[];
  top_works: { work_id: string; title: string; artist_slug: string | null; scans: number }[];
  top_artists: { artist_slug: string; artist_name: string; scans: number }[];
  range: string;
}

export default function VenueAnalyticsPage() {
  const [dateRange, setDateRange] = useState("Last 30 days");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [data, setData] = useState<VenueAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/analytics/venue?range=${dateRangeToParam(dateRange)}`)
      .then((r) => r.json())
      .then((d: VenueAnalytics & { error?: string }) => {
        if (d.error) {
          console.warn("[venue analytics]", d.error);
          setData(null);
        } else {
          setData(d);
        }
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [dateRange]);

  return (
    <VenuePortalLayout>
      <div className="max-w-5xl pb-24">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-serif text-foreground">Analytics</h1>
            <p className="text-sm text-muted mt-1">
              QR scan activity on the artwork displayed in your venue.
            </p>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              className="px-3 py-2 text-sm border border-border rounded-sm bg-white text-foreground hover:border-foreground/30"
            >
              {dateRange} ▾
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-border rounded-sm shadow-md z-10">
                {dateRanges.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setDateRange(r); setDropdownOpen(false); }}
                    className={`block w-full text-left px-3 py-2 text-sm hover:bg-[#FAF8F5] ${dateRange === r ? "text-accent font-medium" : "text-foreground"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Headline tile */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-surface border border-border rounded-sm p-5">
            <p className="text-xs text-muted uppercase tracking-wider">QR scans</p>
            <p className="text-3xl font-serif text-foreground mt-1">
              {loading ? "…" : data?.totals.qr_scans ?? 0}
            </p>
            <p className="text-[11px] text-muted mt-1">{dateRange.toLowerCase()}</p>
          </div>
          <div className="bg-surface border border-border rounded-sm p-5">
            <p className="text-xs text-muted uppercase tracking-wider">Unique works scanned</p>
            <p className="text-3xl font-serif text-foreground mt-1">
              {loading ? "…" : data?.top_works.length ?? 0}
            </p>
            <p className="text-[11px] text-muted mt-1">across the period</p>
          </div>
          <div className="bg-surface border border-border rounded-sm p-5">
            <p className="text-xs text-muted uppercase tracking-wider">Artists scanned</p>
            <p className="text-3xl font-serif text-foreground mt-1">
              {loading ? "…" : data?.top_artists.length ?? 0}
            </p>
            <p className="text-[11px] text-muted mt-1">across the period</p>
          </div>
        </div>

        {/* Top works */}
        <section className="mb-8">
          <h2 className="text-lg font-serif text-foreground mb-3">Top scanned works</h2>
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : !data || data.top_works.length === 0 ? (
            <p className="text-sm text-muted">No scans yet. Print QR labels for your placements and we&rsquo;ll start tracking them here.</p>
          ) : (
            <div className="bg-surface border border-border rounded-sm divide-y divide-border">
              {data.top_works.map((w) => (
                <div key={w.work_id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{w.title}</p>
                    {w.artist_slug && (
                      <Link
                        href={`/browse/${w.artist_slug}`}
                        className="text-xs text-accent hover:text-accent-hover"
                      >
                        View artist →
                      </Link>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground shrink-0">
                    {w.scans} scan{w.scans === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Top artists */}
        <section className="mb-8">
          <h2 className="text-lg font-serif text-foreground mb-3">Top scanned artists</h2>
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : !data || data.top_artists.length === 0 ? (
            <p className="text-sm text-muted">No scans yet.</p>
          ) : (
            <div className="bg-surface border border-border rounded-sm divide-y divide-border">
              {data.top_artists.map((a) => (
                <div key={a.artist_slug} className="px-4 py-3 flex items-center justify-between gap-3">
                  <Link href={`/browse/${a.artist_slug}`} className="text-sm text-foreground hover:text-accent">
                    {a.artist_name}
                  </Link>
                  <p className="text-sm font-medium text-foreground shrink-0">
                    {a.scans} scan{a.scans === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="bg-[#FAF8F5] border border-border rounded-sm p-5 text-sm text-muted">
          <p>
            Want more scans? Print larger labels with a tagline, or rotate the
            artwork seasonally so regulars notice something new.{" "}
            <Link href="/venue-portal/labels" className="text-accent hover:text-accent-hover">
              Open QR labels →
            </Link>
          </p>
        </div>
      </div>
    </VenuePortalLayout>
  );
}
