"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import { authFetch } from "@/lib/api-client";

const dateRanges = ["Last 7 days", "Last 30 days", "Last 3 months", "Last 12 months", "All time"];

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

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState("Last 30 days");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [orders, setOrders] = useState<{ total?: number; created_at?: string }[]>([]);

  useEffect(() => {
    // Fetch from API instead of localStorage
    authFetch("/api/placements")
      .then((r) => r.json())
      .then((data) => {
        if (data.placements) {
          setPlacements(data.placements.map((p: Record<string, unknown>) => ({
            id: p.id,
            workTitle: p.work_title || "Untitled",
            workImage: (p.work_image as string) || "",
            venue: p.venue || "",
            type: (p.arrangement_type || "Free Loan"),
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

  const activePlacements = placements.filter((p) => p.status === "Active").length;
  const pendingPlacements = placements.filter((p) => p.status === "Pending").length;
  const completedPlacements = placements.filter((p) => p.status === "Completed" || p.status === "Sold").length;
  const totalEarnings = orders.reduce((sum: number, o: { total?: number }) => sum + (o.total || 0), 0);
  const uniqueVenues = new Set(placements.map((p) => p.venue)).size;

  // Group placements by venue
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

  // Derive earnings data for chart from orders
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

      {/* Key metric cards */}
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
      <div className="grid grid-cols-3 gap-4 mb-6">
        {placementSummary.map((item) => (
          <div key={item.label} className="bg-surface border border-border rounded-sm p-5 flex items-center gap-4">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${item.color}`}>{item.label}</span>
            <p className="text-2xl font-medium">{item.count}</p>
          </div>
        ))}
      </div>

      {/* Top Performing Works */}
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
                    <td className="px-6 py-3.5 text-right font-medium text-foreground">{p.revenue ?? "—"}</td>
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

/* ── Earnings Chart (pure SVG) ── */
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

  const maxEarnings = Math.max(...data.map((d) => d.earnings), 100);
  const chartHeight = 220;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const xStep = data.length > 1 ? innerWidth / (data.length - 1) : innerWidth;

  const points = data.map((d, i) => ({
    x: padding.left + i * xStep,
    y: padding.top + innerHeight - (d.earnings / maxEarnings) * innerHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`;
  const yTicks = [0, Math.round(maxEarnings / 2), maxEarnings];

  return (
    <div ref={containerRef} className="w-full">
      <svg width={width} height={chartHeight}>
        {yTicks.map((tick) => {
          const y = padding.top + innerHeight - (tick / maxEarnings) * innerHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#E5E2DD" strokeWidth="0.5" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-muted" fontSize="10">
                £{tick}
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
            {hoveredIndex === i && (
              <g>
                <rect x={p.x - 40} y={p.y - 38} width="80" height="28" rx="4" fill="#1A1A1A" />
                <text x={p.x} y={p.y - 20} textAnchor="middle" fill="white" fontSize="11" fontWeight="500">
                  £{data[i].earnings}
                </text>
              </g>
            )}
            <text x={p.x} y={chartHeight - 5} textAnchor="middle" className="fill-muted" fontSize="10">
              {data[i].month}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
