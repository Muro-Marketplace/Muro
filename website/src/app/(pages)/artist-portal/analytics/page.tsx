"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import { authFetch } from "@/lib/api-client";
import { arrangementLabel } from "@/lib/placements/status";

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

interface Placement {
  id: string;
  workTitle: string;
  workImage: string;
  venue: string;
  type: string;
  revenueSharePercent?: number;
  status: string;
  date: string;
  revenue: string | null;
}

interface AnalyticsData {
  totals: {
    profile_views: number;
    artwork_views: number;
    qr_scans: number;
    enquiries: number;
    venue_views: number;
  };
  views_over_time: { date: string; profile_views: number; artwork_views: number; qr_scans: number }[];
  top_works: { work_id: string; title: string; views: number }[];
  traffic_sources: { source: string; count: number }[];
  venue_viewers: { venue_name: string; venue_type: string; viewed_at: string }[] | null;
  venue_viewer_count: number;
  is_premium: boolean;
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState("Last 30 days");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [orders, setOrders] = useState<{ total?: number; created_at?: string }[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Fetch placements and orders (unchanged)
  useEffect(() => {
    authFetch("/api/placements")
      .then((r) => r.json())
      .then((data) => {
        if (data.placements) {
          setPlacements(data.placements.map((p: Record<string, unknown>) => ({
            id: p.id,
            workTitle: p.work_title || "Untitled",
            workImage: (p.work_image as string) || "",
            venue: p.venue || "",
            type: arrangementLabel({
              arrangement_type: p.arrangement_type as string | null,
              monthly_fee_gbp: p.monthly_fee_gbp as number | null,
              qr_enabled: p.qr_enabled as boolean | null,
              message: p.message as string | null,
            }),
            revenueSharePercent: p.revenue_share_percent as number | undefined,
            status: (p.status || "active"),
            date: p.created_at ? new Date(p.created_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
            revenue: p.revenue ? `\u00a3${p.revenue}` : null,
          })));
        }
      })
      .catch(() => {});

    authFetch("/api/orders")
      .then((r) => r.json())
      .then((data) => { if (data.orders) setOrders(data.orders); })
      .catch(() => {});
  }, []);

  // Fetch engagement analytics (reacts to date range changes)
  useEffect(() => {
    setAnalyticsLoading(true);
    authFetch(`/api/analytics/artist?range=${dateRangeToParam(dateRange)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.totals) setAnalytics(data);
      })
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  }, [dateRange]);

  const activePlacements = placements.filter((p) => p.status === "Active").length;
  const pendingPlacements = placements.filter((p) => p.status === "Pending").length;
  const completedPlacements = placements.filter((p) => p.status === "Completed" || p.status === "Sold").length;
  const totalEarnings = orders.reduce((sum: number, o: { total?: number }) => sum + (o.total || 0), 0);
  const uniqueVenues = new Set(placements.map((p) => p.venue)).size;

  const venuePerformance = useMemo(() => {
    const map: Record<string, { venue: string; pieces: number; sales: number; revenue: number; status: string }> = {};
    placements.forEach((p) => {
      if (!map[p.venue]) map[p.venue] = { venue: p.venue, pieces: 0, sales: 0, revenue: 0, status: "Active" };
      map[p.venue].pieces++;
      if (p.status === "Sold" && p.revenue) {
        map[p.venue].sales++;
        map[p.venue].revenue += parseFloat(p.revenue.replace(/[^0-9.]/g, "")) || 0;
      }
      if (p.status === "Completed") map[p.venue].status = "Completed";
    });
    return Object.values(map);
  }, [placements]);

  const earningsData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const data: { month: string; earnings: number; sales: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = months[d.getMonth()];
      const monthOrders = orders.filter((o) => {
        if (!o.created_at) return false;
        const od = new Date(o.created_at);
        return od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear();
      });
      data.push({
        month: monthStr,
        earnings: monthOrders.reduce((s: number, o: { total?: number }) => s + (o.total || 0), 0),
        sales: monthOrders.length,
      });
    }
    return data;
  }, [orders]);

  const placementSummary = [
    { label: "Active", count: activePlacements, color: "bg-green-100 text-green-700" },
    { label: "Pending", count: pendingPlacements, color: "bg-amber-100 text-amber-700" },
    { label: "Completed", count: completedPlacements, color: "bg-gray-100 text-gray-600" },
  ];

  // Total traffic for source percentages
  const totalTraffic = analytics?.traffic_sources.reduce((s, t) => s + t.count, 0) || 0;

  return (
    <ArtistPortalLayout activePath="/artist-portal/analytics">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h1 className="text-2xl lg:text-3xl">Analytics</h1>
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 text-sm border border-border rounded-sm px-3 py-2 bg-surface hover:bg-background transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-muted">
              <rect x="1" y="2" width="12" height="11" rx="1" stroke="currentColor" strokeWidth="1.25" />
              <path d="M1 5h12M4.5 1v2M9.5 1v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
            {dateRange}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-muted">
              <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-surface border border-border rounded-sm shadow-sm z-10">
              {dateRanges.map((range) => (
                <button
                  key={range}
                  onClick={() => { setDateRange(range); setDropdownOpen(false); }}
                  className={`w-full text-left text-sm px-3 py-2 hover:bg-background transition-colors first:rounded-t-sm last:rounded-b-sm ${
                    range === dateRange ? "text-accent font-medium" : "text-foreground"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── ENGAGEMENT METRICS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Profile Views"
          value={analytics?.totals.profile_views ?? 0}
          subtitle={dateRange}
          loading={analyticsLoading}
        />
        <MetricCard
          label="Artwork Views"
          value={analytics?.totals.artwork_views ?? 0}
          subtitle={dateRange}
          loading={analyticsLoading}
        />
        <MetricCard
          label="QR Scans"
          value={analytics?.totals.qr_scans ?? 0}
          subtitle={dateRange}
          loading={analyticsLoading}
        />
        <MetricCard
          label="Enquiries"
          value={analytics?.totals.enquiries ?? 0}
          subtitle={dateRange}
          loading={analyticsLoading}
        />
      </div>

      {/* ── VIEWS OVER TIME ── */}
      {analytics && analytics.views_over_time.length > 0 && (
        <div className="bg-surface border border-border rounded-sm mb-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-base font-medium">Views Over Time</h2>
            <span className="text-xs text-muted">{dateRange}</span>
          </div>
          <div className="px-6 py-6">
            <ViewsChart data={analytics.views_over_time} />
          </div>
        </div>
      )}

      {/* ── TRAFFIC SOURCES ── */}
      {analytics && analytics.traffic_sources.length > 0 && (
        <div className="bg-surface border border-border rounded-sm mb-6">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-medium">Traffic Sources</h2>
          </div>
          <div className="px-6 py-5 space-y-3">
            {analytics.traffic_sources.map((src) => {
              const pct = totalTraffic > 0 ? Math.round((src.count / totalTraffic) * 100) : 0;
              const label = src.source === "qr" ? "QR Code" : src.source === "browse" ? "Browse" : src.source === "direct" ? "Direct" : src.source;
              return (
                <div key={src.source}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-foreground capitalize">{label}</span>
                    <span className="text-muted">{src.count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-border/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TOP WORKS BY VIEWS ── */}
      {analytics && analytics.top_works.length > 0 && (
        <div className="bg-surface border border-border rounded-sm mb-6">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-medium">Top Performing Works</h2>
          </div>
          <div className="divide-y divide-border">
            {analytics.top_works.map((work, i) => (
              <div key={work.work_id} className="px-6 py-3 flex items-center gap-3">
                <span className="text-xs text-muted w-5 shrink-0 tabular-nums">{i + 1}.</span>
                <span className="text-sm text-foreground truncate flex-1">{work.title}</span>
                <span className="text-sm text-muted tabular-nums shrink-0">{work.views} view{work.views !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── VENUES THAT VIEWED YOU ── */}
      <div className="bg-surface border border-border rounded-sm mb-6">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-medium">Venues That Viewed You</h2>
          {analytics && !analytics.is_premium && (
            <span className="text-xs text-accent font-medium">Premium Feature</span>
          )}
        </div>
        {analyticsLoading ? (
          <div className="px-6 py-8 text-center text-sm text-muted">Loading...</div>
        ) : analytics?.is_premium && analytics.venue_viewers ? (
          analytics.venue_viewers.length > 0 ? (
            <div className="divide-y divide-border">
              {analytics.venue_viewers.map((v, i) => (
                <div key={i} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">{v.venue_name}</p>
                    <p className="text-xs text-muted capitalize">{v.venue_type}</p>
                  </div>
                  <span className="text-xs text-muted">
                    {new Date(v.viewed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-sm text-muted">
              No venues have viewed your profile yet in this period.
            </div>
          )
        ) : (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-foreground font-medium mb-1">
              {analytics?.venue_viewer_count ?? 0} venue{(analytics?.venue_viewer_count ?? 0) !== 1 ? "s" : ""} viewed your profile
            </p>
            <p className="text-xs text-muted mb-3">Upgrade to Premium to see which venues are looking at your work</p>
            <Link
              href="/artist-portal/billing"
              className="px-4 py-2 text-xs font-medium text-white bg-accent rounded-sm hover:bg-accent/90 transition-colors inline-block"
            >
              Upgrade to Premium
            </Link>
          </div>
        )}
      </div>

      {/* ── EXISTING: Revenue metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-sm p-5">
          <p className="text-sm text-muted mb-1">Total Earnings</p>
          <p className="text-2xl font-medium">£{totalEarnings.toLocaleString()}</p>
          <p className="text-xs text-muted mt-1">All time</p>
        </div>
        <div className="bg-surface border border-border rounded-sm p-5">
          <p className="text-sm text-muted mb-1">Pieces Placed</p>
          <p className="text-2xl font-medium">{placements.length}</p>
          <p className="text-xs text-muted mt-1">Across {uniqueVenues} venue{uniqueVenues !== 1 ? "s" : ""}</p>
        </div>
        <div className="bg-surface border border-border rounded-sm p-5">
          <p className="text-sm text-muted mb-1">Active</p>
          <p className="text-2xl font-medium">{activePlacements}</p>
          <p className="text-xs text-muted mt-1">Currently on display</p>
        </div>
        <div className="bg-surface border border-border rounded-sm p-5">
          <p className="text-sm text-muted mb-1">Orders</p>
          <p className="text-2xl font-medium">{orders.length}</p>
          <p className="text-xs text-muted mt-1">All time</p>
        </div>
      </div>

      {/* Earnings chart */}
      <div className="bg-surface border border-border rounded-sm mb-6 overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-medium">Earnings Over Time</h2>
          <span className="text-xs text-muted">{dateRange}</span>
        </div>
        <div className="px-6 py-6">
          <EarningsChart data={earningsData} />
        </div>
      </div>

      {/* Placement Status Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {placementSummary.map((item) => (
          <div key={item.label} className="bg-surface border border-border rounded-sm p-4 sm:p-5 flex items-center gap-3">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${item.color}`}>{item.label}</span>
            <p className="text-2xl font-medium">{item.count}</p>
          </div>
        ))}
      </div>

      {/* Placements table */}
      <div className="bg-surface border border-border rounded-sm mb-6">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-medium">Placements</h2>
        </div>
        {placements.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted">
            No placements logged yet. Go to <a href="/artist-portal/placements" className="text-accent hover:underline">Placements</a> to log your first.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th className="text-left text-xs text-muted font-medium px-6 py-3">Title</th>
                  <th className="text-left text-xs text-muted font-medium px-4 py-3">Venue</th>
                  <th className="text-left text-xs text-muted font-medium px-4 py-3">Type</th>
                  <th className="text-left text-xs text-muted font-medium px-4 py-3">Status</th>
                  <th className="text-right text-xs text-muted font-medium px-6 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {placements.slice(0, 10).map((p) => (
                  <tr key={p.id} className="hover:bg-background/60 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-foreground whitespace-nowrap">{p.workTitle}</td>
                    <td className="px-4 py-3.5 text-muted whitespace-nowrap">{p.venue}</td>
                    <td className="px-4 py-3.5 text-muted text-xs">{p.type}</td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        p.status === "Active" ? "bg-green-100 text-green-700" :
                        p.status === "Sold" ? "bg-blue-100 text-blue-700" :
                        p.status === "Pending" ? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>{p.status}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-medium text-foreground">{p.revenue ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Performance by Venue */}
      {venuePerformance.length > 0 && (
        <div className="bg-surface border border-border rounded-sm">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-medium">Performance by Venue</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th className="text-left text-xs text-muted font-medium px-6 py-3">Venue</th>
                  <th className="text-right text-xs text-muted font-medium px-4 py-3">Pieces</th>
                  <th className="text-right text-xs text-muted font-medium px-4 py-3">Sales</th>
                  <th className="text-right text-xs text-muted font-medium px-4 py-3">Revenue</th>
                  <th className="text-left text-xs text-muted font-medium px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {venuePerformance.map((row) => (
                  <tr key={row.venue} className="hover:bg-background/60 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-foreground">{row.venue}</td>
                    <td className="px-4 py-3.5 text-right text-foreground">{row.pieces}</td>
                    <td className="px-4 py-3.5 text-right text-foreground">{row.sales}</td>
                    <td className="px-4 py-3.5 text-right font-medium text-foreground">£{row.revenue}</td>
                    <td className="px-6 py-3.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        row.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                      }`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ArtistPortalLayout>
  );
}

/* ── Metric Card ── */
function MetricCard({ label, value, subtitle, loading }: { label: string; value: number; subtitle: string; loading: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-sm p-5">
      <p className="text-sm text-muted mb-1">{label}</p>
      {loading ? (
        <div className="h-8 w-16 bg-border/30 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-medium">{value.toLocaleString()}</p>
      )}
      <p className="text-xs text-muted mt-1">{subtitle}</p>
    </div>
  );
}

/* ── Views Chart (multi-line SVG) ── */
function ViewsChart({ data }: { data: { date: string; profile_views: number; artwork_views: number; qr_scans: number }[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);

  useEffect(() => {
    function measure() {
      if (containerRef.current) setWidth(containerRef.current.offsetWidth);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const maxVal = Math.max(...data.map((d) => Math.max(d.profile_views, d.artwork_views, d.qr_scans)), 1);
  const chartHeight = 220;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const xStep = data.length > 1 ? innerWidth / (data.length - 1) : innerWidth;

  const lines = [
    { key: "profile_views" as const, color: "#C17C5A", label: "Profile" },
    { key: "artwork_views" as const, color: "#7C9A5A", label: "Artworks" },
    { key: "qr_scans" as const, color: "#5A7C9A", label: "QR Scans" },
  ];

  function getPoints(key: "profile_views" | "artwork_views" | "qr_scans") {
    return data.map((d, i) => ({
      x: padding.left + i * xStep,
      y: padding.top + innerHeight - (d[key] / maxVal) * innerHeight,
    }));
  }

  function toPath(points: { x: number; y: number }[]) {
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  }

  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  // Show at most ~14 x-axis labels to avoid overlap
  const labelEvery = Math.max(1, Math.ceil(data.length / 14));

  return (
    // Plan F #13: scroll horizontally if the viewport is narrower
    // than the minimum legible chart width (400px). Inside the scroll
    // wrapper the SVG keeps its measured-width responsive behaviour;
    // the min-width clamp on the inner div prevents legend collapse
    // and unreadable axis labels on iPhone SE-sized screens.
    <div className="w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <div ref={containerRef} className="min-w-[400px]">
        {/* Legend */}
        <div className="flex items-center gap-4 mb-3">
          {lines.map((line) => (
            <div key={line.key} className="flex items-center gap-1.5">
              <div className="w-3 h-[2px] rounded-full" style={{ backgroundColor: line.color }} />
              <span className="text-[10px] text-muted">{line.label}</span>
            </div>
          ))}
        </div>
        <svg width={width} height={chartHeight}>
        {yTicks.map((tick) => {
          const y = padding.top + innerHeight - (tick / maxVal) * innerHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#E5E2DD" strokeWidth="0.5" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-muted" fontSize="10">
                {tick}
              </text>
            </g>
          );
        })}
        {lines.map((line) => {
          const points = getPoints(line.key);
          return (
            <path
              key={line.key}
              d={toPath(points)}
              fill="none"
              stroke={line.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        {/* Hover zones + x labels */}
        {data.map((d, i) => {
          const x = padding.left + i * xStep;
          const dateLabel = new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          return (
            <g key={i}>
              <rect
                x={x - xStep / 2}
                y={padding.top}
                width={xStep}
                height={innerHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              {hoveredIndex === i && (() => {
                const tw = 110;
                const tx = Math.max(padding.left, Math.min(x - tw / 2, width - padding.right - tw));
                const tcx = tx + tw / 2;
                return (
                  <g>
                    <line x1={x} y1={padding.top} x2={x} y2={padding.top + innerHeight} stroke="#E5E2DD" strokeWidth="1" strokeDasharray="3,3" />
                    <rect x={tx} y={padding.top - 2} width={tw} height="50" rx="4" fill="#1A1A1A" />
                    <text x={tcx} y={padding.top + 14} textAnchor="middle" fill="#C17C5A" fontSize="10">
                      Profile: {d.profile_views}
                    </text>
                    <text x={tcx} y={padding.top + 28} textAnchor="middle" fill="#7C9A5A" fontSize="10">
                      Artwork: {d.artwork_views}
                    </text>
                    <text x={tcx} y={padding.top + 42} textAnchor="middle" fill="#5A7C9A" fontSize="10">
                      QR: {d.qr_scans}
                    </text>
                  </g>
                );
              })()}
              {i % labelEvery === 0 && (
                <text x={x} y={chartHeight - 5} textAnchor="middle" className="fill-muted" fontSize="10">
                  {dateLabel}
                </text>
              )}
            </g>
          );
        })}
        </svg>
      </div>
    </div>
  );
}

/* ── Earnings Chart (pure SVG) ── */
function niceMax(val: number): number {
  if (val <= 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(val)));
  const norm = val / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

// Compact format for chart axis labels: "£12k" / "£500". For full
// currency strings (£12,345.67) use formatPounds from @/lib/format-currency.
function formatPoundsCompact(val: number): string {
  if (val >= 1000) return `£${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`;
  return `£${val.toLocaleString()}`;
}

function EarningsChart({ data }: { data: { month: string; earnings: number; sales: number }[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);

  useEffect(() => {
    function measure() {
      if (containerRef.current) setWidth(containerRef.current.offsetWidth);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const rawMax = Math.max(...data.map((d) => d.earnings), 0);
  const maxEarnings = niceMax(rawMax || 100);
  const chartHeight = 220;
  const padding = { top: 20, right: 20, bottom: 30, left: 55 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const xStep = data.length > 1 ? innerWidth / (data.length - 1) : innerWidth;

  const points = data.map((d, i) => ({
    x: padding.left + i * xStep,
    y: padding.top + innerHeight - (d.earnings / maxEarnings) * innerHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`;

  // 5 evenly spaced ticks for a clean axis
  const yTicks = [0, maxEarnings * 0.25, maxEarnings * 0.5, maxEarnings * 0.75, maxEarnings];

  return (
    // Plan F #13: same horizontal-scroll pattern as the views chart so
    // the earnings line stays legible on phones.
    <div className="w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <div ref={containerRef} className="min-w-[400px]">
        <svg width={width} height={chartHeight}>
        {yTicks.map((tick) => {
          const y = padding.top + innerHeight - (tick / maxEarnings) * innerHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#E5E2DD" strokeWidth="0.5" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-muted" fontSize="10">
                {formatPoundsCompact(Math.round(tick))}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill="#C17C5A" fillOpacity="0.08" />
        <path d={linePath} fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <rect x={p.x - xStep / 2} y={padding.top} width={xStep} height={innerHeight} fill="transparent"
              onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)} />
            <circle cx={p.x} cy={p.y} r={hoveredIndex === i ? 5 : 3}
              fill={hoveredIndex === i ? "#C17C5A" : "#fff"} stroke="#C17C5A" strokeWidth="2" />
            {hoveredIndex === i && (() => {
              const tooltipW = 110;
              const tooltipX = Math.max(padding.left, Math.min(p.x - tooltipW / 2, width - padding.right - tooltipW));
              const tooltipCenterX = tooltipX + tooltipW / 2;
              return (
                <g>
                  <rect x={tooltipX} y={p.y - 48} width={tooltipW} height="38" rx="4" fill="#1A1A1A" />
                  <text x={tooltipCenterX} y={p.y - 28} textAnchor="middle" fill="white" fontSize="12" fontWeight="500">
                    £{data[i].earnings.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </text>
                  <text x={tooltipCenterX} y={p.y - 14} textAnchor="middle" fill="#999" fontSize="10">
                    {data[i].sales} sale{data[i].sales !== 1 ? "s" : ""}
                  </text>
                </g>
              );
            })()}
            <text x={p.x} y={chartHeight - 5} textAnchor="middle" className="fill-muted" fontSize="10">
              {data[i].month}
            </text>
          </g>
        ))}
        </svg>
      </div>
    </div>
  );
}
