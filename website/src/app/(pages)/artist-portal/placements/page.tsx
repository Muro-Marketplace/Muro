"use client";

import { useState } from "react";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";

type FilterTab = "All" | "Active" | "Pending" | "Completed";

const placements = [
  {
    id: 1,
    title: "Last Light on Mare Street",
    venue: "Ozone Coffee",
    type: "Revenue Share",
    status: "Active",
    date: "12 Jan 2026",
    revenue: null,
  },
  {
    id: 2,
    title: "Hackney Wick, Dawn",
    venue: "The Copper Kettle",
    type: "Sale",
    status: "Sold",
    date: "8 Jan 2026",
    revenue: "£320",
  },
  {
    id: 3,
    title: "Canal Series No. 4",
    venue: "Workshop Coffee",
    type: "Free Loan",
    status: "Completed",
    date: "15 Nov 2025",
    revenue: null,
  },
  {
    id: 4,
    title: "Bermondsey Rooftops",
    venue: "Redemption Roasters",
    type: "Revenue Share",
    status: "Pending",
    date: "20 Mar 2026",
    revenue: null,
  },
  {
    id: 5,
    title: "Sunday Market, E8",
    venue: "Climpson & Sons",
    type: "Free Loan",
    status: "Active",
    date: "3 Feb 2026",
    revenue: null,
  },
  {
    id: 6,
    title: "Golden Hour, Peckham Rye",
    venue: "Ozone Coffee",
    type: "Sale",
    status: "Sold",
    date: "28 Oct 2025",
    revenue: "£280",
  },
];

const statusBadge = (status: string) => {
  switch (status) {
    case "Active":
      return "bg-green-100 text-green-700";
    case "Pending":
      return "bg-amber-100 text-amber-700";
    case "Sold":
      return "bg-blue-100 text-blue-700";
    case "Completed":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
};

const tabs: FilterTab[] = ["All", "Active", "Pending", "Completed"];

export default function PlacementsPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>("All");

  const filtered = placements.filter((p) => {
    if (activeTab === "All") return true;
    if (activeTab === "Completed") return p.status === "Completed" || p.status === "Sold";
    return p.status === activeTab;
  });

  return (
    <ArtistPortalLayout activePath="/artist-portal/placements">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h1 className="text-2xl lg:text-3xl">Placements</h1>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>{placements.filter(p => p.status === "Active").length} active</span>
          <span>·</span>
          <span>{placements.filter(p => p.status === "Pending").length} pending</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => {
          const count =
            tab === "All"
              ? placements.length
              : tab === "Completed"
              ? placements.filter(p => p.status === "Completed" || p.status === "Sold").length
              : placements.filter(p => p.status === tab).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab}
              <span
                className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab ? "bg-accent/10 text-accent" : "bg-border text-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table – desktop */}
      <div className="bg-surface border border-border rounded-sm hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="text-left text-xs text-muted font-medium px-6 py-3">Piece</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Venue</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Type</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Status</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Date</th>
                <th className="text-right text-xs text-muted font-medium px-6 py-3">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((placement) => (
                <tr key={placement.id} className="hover:bg-background/60 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-medium text-foreground">{placement.title}</span>
                  </td>
                  <td className="px-4 py-4 text-muted whitespace-nowrap">{placement.venue}</td>
                  <td className="px-4 py-4">
                    <span className="text-xs border border-border rounded-sm px-2 py-0.5 text-muted">
                      {placement.type}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(
                        placement.status
                      )}`}
                    >
                      {placement.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-muted whitespace-nowrap">{placement.date}</td>
                  <td className="px-6 py-4 text-right font-medium text-foreground">
                    {placement.revenue ?? <span className="text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="px-6 py-12 text-center text-muted text-sm">
            No placements found.
          </div>
        )}
      </div>

      {/* Cards – mobile */}
      <div className="sm:hidden space-y-3">
        {filtered.map((placement) => (
          <div key={placement.id} className="bg-surface border border-border rounded-sm p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="font-medium text-foreground text-sm leading-snug">{placement.title}</p>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${statusBadge(
                  placement.status
                )}`}
              >
                {placement.status}
              </span>
            </div>
            <p className="text-sm text-muted mb-3">{placement.venue}</p>
            <div className="flex items-center justify-between text-xs text-muted">
              <div className="flex items-center gap-2">
                <span className="border border-border rounded-sm px-1.5 py-0.5">{placement.type}</span>
                <span>{placement.date}</span>
              </div>
              {placement.revenue && (
                <span className="font-medium text-foreground">{placement.revenue}</span>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted text-sm py-8">No placements found.</p>
        )}
      </div>
    </ArtistPortalLayout>
  );
}
