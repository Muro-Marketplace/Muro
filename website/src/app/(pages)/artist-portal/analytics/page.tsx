"use client";

import { useState, useRef, useEffect } from "react";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";

const dateRanges = ["Last 7 days", "Last 30 days", "Last 3 months", "Last 12 months", "All time"];

const topWorks = [
  { title: "Last Light on Mare Street", venue: "Ozone Coffee", views: 184, enquiries: 7, sales: 2, revenue: "£560" },
  { title: "Hackney Wick, Dawn", venue: "The Copper Kettle", views: 142, enquiries: 5, sales: 1, revenue: "£320" },
  { title: "Canal Series No. 4", venue: "Workshop Coffee", views: 98, enquiries: 3, sales: 1, revenue: "£280" },
  { title: "Bermondsey Rooftops", venue: "Redemption Roasters", views: 76, enquiries: 2, sales: 0, revenue: "—" },
  { title: "Sunday Market, E8", venue: "Climpson & Sons", views: 62, enquiries: 1, sales: 0, revenue: "—" },
];

const venuePerformance = [
  { venue: "Ozone Coffee", pieces: 3, sales: 2, revenue: "£560", status: "Active" },
  { venue: "The Copper Kettle", pieces: 2, sales: 1, revenue: "£320", status: "Active" },
  { venue: "Workshop Coffee", pieces: 1, sales: 1, revenue: "£280", status: "Completed" },
];

const placementSummary = [
  { label: "Active", count: 5, color: "bg-green-100 text-green-700" },
  { label: "Pending", count: 2, color: "bg-amber-100 text-amber-700" },
  { label: "Completed", count: 8, color: "bg-gray-100 text-gray-600" },
];

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState("Last 30 days");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <ArtistPortalLayout activePath="/artist-portal/analytics">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h1 className="text-2xl lg:text-3xl">Analytics</h1>
        {/* Date range selector */}
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
          <p className="text-sm text-muted mb-1">Monthly Earnings</p>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-medium">£1,420</p>
            <span className="mb-0.5 text-xs font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">+12%</span>
          </div>
          <p className="text-xs text-muted mt-1">vs. last month</p>
        </div>
        <div className="bg-surface border border-border rounded-sm p-5">
          <p className="text-sm text-muted mb-1">Total Earnings</p>
          <p className="text-2xl font-medium">£2,840</p>
          <p className="text-xs text-muted mt-1">All time</p>
        </div>
        <div className="bg-surface border border-border rounded-sm p-5">
          <p className="text-sm text-muted mb-1">Pieces Placed</p>
          <p className="text-2xl font-medium">8</p>
          <p className="text-xs text-muted mt-1">Across 4 venues</p>
        </div>
        <div className="bg-surface border border-border rounded-sm p-5">
          <p className="text-sm text-muted mb-1">Conversion Rate</p>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-medium">23%</p>
          </div>
          <p className="text-xs text-muted mt-1">Enquiry to placement</p>
        </div>
      </div>

      {/* Earnings chart */}
      <div className="bg-surface border border-border rounded-sm mb-6 overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-medium">Earnings Over Time</h2>
          <span className="text-xs text-muted">{dateRange}</span>
        </div>
        <div className="px-6 py-6">
          <EarningsChart />
        </div>
      </div>

      {/* Placement Status Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {placementSummary.map((item) => (
          <div key={item.label} className="bg-surface border border-border rounded-sm p-5 flex items-center gap-4">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${item.color}`}>
              {item.label}
            </span>
            <p className="text-2xl font-medium">{item.count}</p>
          </div>
        ))}
      </div>

      {/* Top Performing Works */}
      <div className="bg-surface border border-border rounded-sm mb-6">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-medium">Top Performing Works</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="text-left text-xs text-muted font-medium px-6 py-3">Title</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Venue</th>
                <th className="text-right text-xs text-muted font-medium px-4 py-3">Views</th>
                <th className="text-right text-xs text-muted font-medium px-4 py-3">Enquiries</th>
                <th className="text-right text-xs text-muted font-medium px-4 py-3">Sales</th>
                <th className="text-right text-xs text-muted font-medium px-6 py-3">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topWorks.map((work) => (
                <tr key={work.title} className="hover:bg-background/60 transition-colors">
                  <td className="px-6 py-3.5 font-medium text-foreground whitespace-nowrap">{work.title}</td>
                  <td className="px-4 py-3.5 text-muted whitespace-nowrap">{work.venue}</td>
                  <td className="px-4 py-3.5 text-right text-foreground">{work.views}</td>
                  <td className="px-4 py-3.5 text-right text-foreground">{work.enquiries}</td>
                  <td className="px-4 py-3.5 text-right text-foreground">{work.sales}</td>
                  <td className="px-6 py-3.5 text-right font-medium text-foreground">{work.revenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Performance by Venue */}
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
                  <td className="px-4 py-3.5 text-right font-medium text-foreground">{row.revenue}</td>
                  <td className="px-6 py-3.5">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        row.status === "Active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ArtistPortalLayout>
  );
}

/* ── Earnings Chart (pure SVG, no dependencies) ── */

// Mock data — replace with real API data when backend is ready
const earningsData = [
  { month: "Oct", earnings: 120, sales: 1 },
  { month: "Nov", earnings: 280, sales: 2 },
  { month: "Dec", earnings: 0, sales: 0 },
  { month: "Jan", earnings: 320, sales: 1 },
  { month: "Feb", earnings: 560, sales: 2 },
  { month: "Mar", earnings: 480, sales: 2 },
  { month: "Apr", earnings: 1080, sales: 3 },
];

function EarningsChart() {
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

  const maxEarnings = Math.max(...earningsData.map((d) => d.earnings), 100);
  const chartHeight = 220;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const xStep = innerWidth / (earningsData.length - 1);

  const points = earningsData.map((d, i) => ({
    x: padding.left + i * xStep,
    y: padding.top + innerHeight - (d.earnings / maxEarnings) * innerHeight,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`;

  const yTicks = [0, Math.round(maxEarnings / 2), maxEarnings];

  return (
    <div ref={containerRef} className="w-full">
      <svg width={width} height={chartHeight}>
        {/* Grid lines */}
        {yTicks.map((tick) => {
          const y = padding.top + innerHeight - (tick / maxEarnings) * innerHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#E5E2DD" strokeWidth="0.5" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-muted" fontSize="10">
                &pound;{tick}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="#C17C5A" fillOpacity="0.08" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Data points + hover targets */}
        {points.map((p, i) => (
          <g key={i}>
            {/* Invisible hover target */}
            <rect
              x={p.x - xStep / 2}
              y={padding.top}
              width={xStep}
              height={innerHeight}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
            {/* Dot */}
            <circle
              cx={p.x}
              cy={p.y}
              r={hoveredIndex === i ? 5 : 3}
              fill={hoveredIndex === i ? "#C17C5A" : "#fff"}
              stroke="#C17C5A"
              strokeWidth="2"
            />
            {/* Hover tooltip */}
            {hoveredIndex === i && (
              <g>
                <rect x={p.x - 40} y={p.y - 38} width="80" height="28" rx="4" fill="#1A1A1A" />
                <text x={p.x} y={p.y - 20} textAnchor="middle" fill="white" fontSize="11" fontWeight="500">
                  &pound;{earningsData[i].earnings}
                </text>
              </g>
            )}
            {/* X-axis label */}
            <text x={p.x} y={chartHeight - 5} textAnchor="middle" className="fill-muted" fontSize="10">
              {earningsData[i].month}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
