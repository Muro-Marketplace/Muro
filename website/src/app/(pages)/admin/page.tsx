"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AdminPortalLayout from "@/components/AdminPortalLayout";
import { authFetch } from "@/lib/api-client";

interface Stats {
  applications: { total: number; pending: number; accepted: number; rejected: number };
  artists: number;
  venues: number;
  // Added in /api/admin/stats expansion (item #23). All optional so old
  // deployments without these fields render gracefully.
  placements?: {
    total: number;
    pending: number;
    active: number;
    completed: number;
    cancelled: number;
  };
  qrScans?: {
    total: number;
    last7d: number;
    last30d: number;
  };
  payouts?: {
    grossCents: number;
    count: number;
    last30dCents: number;
    last30dCount: number;
  };
}

function formatGbp(cents: number): string {
  if (!Number.isFinite(cents)) return "£0";
  const pounds = cents / 100;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: pounds >= 100 ? 0 : 2,
  }).format(pounds);
}

interface Application {
  id: string;
  name: string;
  email: string;
  primary_medium: string;
  created_at: string;
  status: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentApps, setRecentApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, appsRes] = await Promise.all([
          authFetch("/api/admin/stats"),
          authFetch("/api/admin/applications?status=pending"),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (appsRes.ok) {
          const data = await appsRes.json();
          setRecentApps((data.applications || []).slice(0, 5));
        }
      } catch (err) {
        console.error("Failed to load admin stats:", err);
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <AdminPortalLayout activePath="/admin">
      <h1 className="text-2xl lg:text-3xl mb-8">Admin Dashboard</h1>

      {loading ? (
        <p className="text-muted text-sm">Loading stats...</p>
      ) : !stats ? (
        <p className="text-muted text-sm">Failed to load stats. Make sure the database is set up.</p>
      ) : (
        <>
          {/* Stat cards, applications + accounts headline */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Pending Applications", value: stats.applications.pending, accent: true },
              { label: "Total Applications", value: stats.applications.total },
              { label: "Registered Artists", value: stats.artists },
              { label: "Registered Venues", value: stats.venues },
            ].map((card) => (
              <div key={card.label} className="bg-white border border-border rounded-sm p-5">
                <p className="text-xs text-muted uppercase tracking-wider mb-1">{card.label}</p>
                <p className={`text-3xl font-serif ${card.accent ? "text-accent" : "text-foreground"}`}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          {/* Marketplace activity, placements / QR scans / payouts. Added in
              the admin expansion (#23) so the dashboard reflects what the
              platform is doing day-to-day, not just sign-ups. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {/* Placements */}
            <div className="bg-white border border-border rounded-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted uppercase tracking-wider">Placements</p>
                <span className="text-[10px] text-muted/70">All time</span>
              </div>
              <p className="text-3xl font-serif text-foreground mb-3">
                {stats.placements?.total ?? 0}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <span className="text-muted">Pending</span>
                <span className="text-right font-medium text-foreground tabular-nums">
                  {stats.placements?.pending ?? 0}
                </span>
                <span className="text-muted">Active</span>
                <span className="text-right font-medium text-emerald-700 tabular-nums">
                  {stats.placements?.active ?? 0}
                </span>
                <span className="text-muted">Completed</span>
                <span className="text-right font-medium text-foreground tabular-nums">
                  {stats.placements?.completed ?? 0}
                </span>
                <span className="text-muted">Cancelled</span>
                <span className="text-right font-medium text-muted/70 tabular-nums">
                  {stats.placements?.cancelled ?? 0}
                </span>
              </div>
            </div>

            {/* QR scans */}
            <div className="bg-white border border-border rounded-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted uppercase tracking-wider">QR Scans</p>
                <span className="text-[10px] text-muted/70">All time</span>
              </div>
              <p className="text-3xl font-serif text-foreground mb-3">
                {stats.qrScans?.total ?? 0}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <span className="text-muted">Last 7 days</span>
                <span className="text-right font-medium text-foreground tabular-nums">
                  {stats.qrScans?.last7d ?? 0}
                </span>
                <span className="text-muted">Last 30 days</span>
                <span className="text-right font-medium text-foreground tabular-nums">
                  {stats.qrScans?.last30d ?? 0}
                </span>
              </div>
            </div>

            {/* Payouts / gross merchandise */}
            <div className="bg-white border border-border rounded-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted uppercase tracking-wider">Gross Sales</p>
                <span className="text-[10px] text-muted/70">All time</span>
              </div>
              <p className="text-3xl font-serif text-foreground mb-3 tabular-nums">
                {formatGbp(stats.payouts?.grossCents ?? 0)}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <span className="text-muted">Orders</span>
                <span className="text-right font-medium text-foreground tabular-nums">
                  {stats.payouts?.count ?? 0}
                </span>
                <span className="text-muted">Last 30 days</span>
                <span className="text-right font-medium text-foreground tabular-nums">
                  {formatGbp(stats.payouts?.last30dCents ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-3 mb-8">
            <Link
              href="/admin/applications"
              className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
            >
              Review Applications
              {stats.applications.pending > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                  {stats.applications.pending}
                </span>
              )}
            </Link>
            <Link
              href="/admin/artists"
              className="px-4 py-2 text-sm font-medium text-foreground bg-surface border border-border hover:bg-background rounded-sm transition-colors"
            >
              View Artists
            </Link>
            <Link
              href="/admin/venues"
              className="px-4 py-2 text-sm font-medium text-foreground bg-surface border border-border hover:bg-background rounded-sm transition-colors"
            >
              View Venues
            </Link>
          </div>

          {/* Recent pending applications */}
          {recentApps.length > 0 && (
            <div>
              <h2 className="text-lg font-medium mb-4">Recent Pending Applications</h2>
              <div className="bg-white border border-border rounded-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface/50">
                      <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">Name</th>
                      <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">Medium</th>
                      <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentApps.map((app) => (
                      <tr key={app.id} className="border-b border-border last:border-b-0">
                        <td className="py-3 px-4">
                          <p className="font-medium text-foreground">{app.name}</p>
                          <p className="text-xs text-muted">{app.email}</p>
                        </td>
                        <td className="py-3 px-4 text-muted">{app.primary_medium || "–"}</td>
                        <td className="py-3 px-4 text-muted">
                          {new Date(app.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </AdminPortalLayout>
  );
}
