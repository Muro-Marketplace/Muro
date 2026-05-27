"use client";

// Phase 2.8 A3. Read-only financials dashboard.

import { useEffect, useState } from "react";
import AdminPortalLayout from "@/components/AdminPortalLayout";
import { authFetch } from "@/lib/api-client";

interface FinancialsResponse {
  subscriptions: {
    total: number;
    byPlan: Record<string, number>;
    mrrPence: number;
  };
  failedPayments: { thisMonth: number; lastMonth: number };
  upcomingRenewals: Array<{
    placement_id: string;
    monthly_amount_pence: number;
    current_period_end: string;
  }>;
  revenue: { thisMonthPence: number; yearAgoPence: number };
  topVenues: Array<{ userId: string; totalPence: number }>;
  topArtists: Array<{ userId: string; totalPence: number }>;
}

function fmt(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

export default function AdminFinancialsPage() {
  const [data, setData] = useState<FinancialsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/admin/financials");
        if (!cancelled) {
          if (!res.ok) {
            setError("Could not load financials");
          } else {
            const body = await res.json();
            setData(body);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Network error");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <AdminPortalLayout activePath="/admin/financials">
      <div className="max-w-6xl px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl mb-2">Financials</h1>
          <p className="text-sm text-muted">
            Read-only snapshot. v2 will add refund + cancel actions.
          </p>
        </div>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Tile title="Active subscriptions" value={String(data.subscriptions.total)}>
              <ul className="text-[11px] text-muted space-y-0.5">
                {Object.entries(data.subscriptions.byPlan).map(([plan, count]) => (
                  <li key={plan} className="capitalize">{plan}: {count}</li>
                ))}
              </ul>
            </Tile>
            <Tile title="MRR" value={fmt(data.subscriptions.mrrPence)} />
            <Tile
              title="Failed payments"
              value={String(data.failedPayments.thisMonth)}
              subtitle={`last month: ${data.failedPayments.lastMonth}`}
            />
            <Tile
              title="Revenue this month"
              value={fmt(data.revenue.thisMonthPence)}
              subtitle={`YoY: ${fmt(data.revenue.yearAgoPence)}`}
            />
            <Tile
              title="Renewals next 7 days"
              value={String(data.upcomingRenewals.length)}
            />
            <Tile
              title="Total subs MRR"
              value={fmt(data.subscriptions.mrrPence)}
            />
            <TileWide title="Top 10 venues by spend">
              <ol className="text-xs text-foreground space-y-0.5 list-decimal pl-4">
                {data.topVenues.map((v) => (
                  <li key={v.userId} className="flex justify-between gap-3">
                    <code className="truncate text-[10px] text-muted">{v.userId}</code>
                    <span className="font-medium">{fmt(v.totalPence)}/mo</span>
                  </li>
                ))}
                {data.topVenues.length === 0 && <li className="text-muted">No active billings yet.</li>}
              </ol>
            </TileWide>
            <TileWide title="Top 10 artists by earnings">
              <ol className="text-xs text-foreground space-y-0.5 list-decimal pl-4">
                {data.topArtists.map((a) => (
                  <li key={a.userId} className="flex justify-between gap-3">
                    <code className="truncate text-[10px] text-muted">{a.userId}</code>
                    <span className="font-medium">{fmt(a.totalPence)}</span>
                  </li>
                ))}
                {data.topArtists.length === 0 && <li className="text-muted">No earnings yet.</li>}
              </ol>
            </TileWide>
          </div>
        ) : null}
      </div>
    </AdminPortalLayout>
  );
}

function Tile({
  title,
  value,
  subtitle,
  children,
}: {
  title: string;
  value: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-sm p-4">
      <p className="text-[11px] text-muted uppercase tracking-wider mb-2">{title}</p>
      <p className="text-2xl font-medium text-foreground">{value}</p>
      {subtitle && <p className="text-[11px] text-muted mt-1">{subtitle}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function TileWide({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-sm p-4 md:col-span-2 lg:col-span-3">
      <p className="text-[11px] text-muted uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
}
