"use client";

import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import Button from "@/components/Button";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

const stats = [
  { label: "Active Placements", value: "3" },
  { label: "Total Sales", value: "£2,840" },
  { label: "Enquiries This Month", value: "12" },
  { label: "Profile Views", value: "284" },
];

const recentActivity = [
  {
    id: 1,
    text: "New enquiry from The Copper Kettle",
    time: "2 hours ago",
    type: "enquiry",
  },
  {
    id: 2,
    text: "Piece sold: Last Light on Mare Street – £280",
    time: "Yesterday",
    type: "sale",
  },
  {
    id: 3,
    text: "Your placement at Ozone Coffee was renewed",
    time: "3 days ago",
    type: "placement",
  },
  {
    id: 4,
    text: "Profile viewed by Redemption Roasters",
    time: "4 days ago",
    type: "view",
  },
  {
    id: 5,
    text: "New enquiry from Workshop Coffee",
    time: "1 week ago",
    type: "enquiry",
  },
];

const typeColors: Record<string, string> = {
  enquiry: "bg-blue-100 text-blue-700",
  sale: "bg-green-100 text-green-700",
  placement: "bg-accent/15 text-accent",
  view: "bg-gray-100 text-gray-600",
};

const typeLabels: Record<string, string> = {
  enquiry: "Enquiry",
  sale: "Sale",
  placement: "Placement",
  view: "View",
};

export default function ArtistPortalPage() {
  const { displayName } = useAuth();
  return (
    <ArtistPortalLayout activePath="/artist-portal">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl mb-1">Welcome back, {displayName?.split(" ")[0] || "Artist"}</h1>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent/10 text-accent px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
              Premium · Trial active
            </span>
            <span className="text-xs text-muted">24 days remaining</span>
          </div>
        </div>
        <Button href="/artist-portal/portfolio" variant="secondary" size="sm">
          Edit Portfolio
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-surface border border-border rounded-sm p-5"
          >
            <p className="text-sm text-muted mb-1">{stat.label}</p>
            <p className="text-2xl font-medium text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-sm">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-medium">Recent Activity</h2>
          </div>
          <ul className="divide-y divide-border">
            {recentActivity.map((item) => (
              <li key={item.id} className="px-6 py-4 flex items-start gap-4">
                <span
                  className={`mt-0.5 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${typeColors[item.type]}`}
                >
                  {typeLabels[item.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">{item.text}</p>
                  <p className="text-xs text-muted mt-0.5">{item.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Quick Actions */}
        <div className="bg-surface border border-border rounded-sm">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-medium">Quick Actions</h2>
          </div>
          <div className="p-6 flex flex-col gap-3">
            <Link
              href="/artist-portal/portfolio"
              className="flex items-center gap-3 p-3 rounded-sm border border-border hover:bg-background transition-colors text-sm text-foreground"
            >
              <span className="w-8 h-8 rounded-sm bg-accent/10 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="2" width="12" height="12" rx="1" stroke="#C17C5A" strokeWidth="1.25" />
                  <path d="M5 8h6M5 5.5h6M5 10.5h4" stroke="#C17C5A" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
              </span>
              Edit Portfolio
            </Link>
            <Link
              href="/artist-portal/analytics"
              className="flex items-center gap-3 p-3 rounded-sm border border-border hover:bg-background transition-colors text-sm text-foreground"
            >
              <span className="w-8 h-8 rounded-sm bg-accent/10 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 12l4-4 3 3 5-7" stroke="#C17C5A" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              View Analytics
            </Link>
            <Link
              href="/artist-portal/placements"
              className="flex items-center gap-3 p-3 rounded-sm border border-border hover:bg-background transition-colors text-sm text-foreground"
            >
              <span className="w-8 h-8 rounded-sm bg-accent/10 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="3" width="12" height="10" rx="1" stroke="#C17C5A" strokeWidth="1.25" />
                  <path d="M5 7h6M5 10h4" stroke="#C17C5A" strokeWidth="1.25" strokeLinecap="round" />
                  <path d="M8 1v4" stroke="#C17C5A" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
              </span>
              Update Availability
            </Link>
            <Link
              href="/artist-portal/labels"
              className="flex items-center gap-3 p-3 rounded-sm border border-border hover:bg-background transition-colors text-sm text-foreground"
            >
              <span className="w-8 h-8 rounded-sm bg-accent/10 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="6" height="6" rx="0.5" stroke="#C17C5A" strokeWidth="1.25" />
                  <rect x="9" y="1" width="6" height="6" rx="0.5" stroke="#C17C5A" strokeWidth="1.25" />
                  <rect x="1" y="9" width="6" height="6" rx="0.5" stroke="#C17C5A" strokeWidth="1.25" />
                  <rect x="9" y="9" width="6" height="6" rx="0.5" stroke="#C17C5A" strokeWidth="1.25" />
                </svg>
              </span>
              Print QR Labels
            </Link>
          </div>

          {/* Summary */}
          <div className="px-6 pb-6">
            <div className="bg-background rounded-sm p-4">
              <p className="text-xs text-muted mb-3 font-medium uppercase tracking-wide">This month</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Earnings</span>
                  <span className="font-medium">£560</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">New enquiries</span>
                  <span className="font-medium">12</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Pieces sold</span>
                  <span className="font-medium">2</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ArtistPortalLayout>
  );
}
