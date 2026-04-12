"use client";

import { useState, useEffect } from "react";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import Button from "@/components/Button";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

interface ActivityItem {
  id: string;
  text: string;
  time: string;
  sortTime: number;
  type: "enquiry" | "sale" | "placement" | "message" | "view";
}

const activityTypes: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  message: {
    label: "Message",
    bg: "bg-blue-50",
    text: "text-blue-600",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  enquiry: {
    label: "Enquiry",
    bg: "bg-purple-50",
    text: "text-purple-600",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  placement: {
    label: "Placement",
    bg: "bg-accent/8",
    text: "text-accent",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  sale: {
    label: "Sale",
    bg: "bg-green-50",
    text: "text-green-600",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
  },
  view: {
    label: "View",
    bg: "bg-gray-50",
    text: "text-gray-500",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
};

/** Convert a slug like "the-copper-kettle" to "The Copper Kettle" */
function formatName(raw: string): string {
  if (!raw) return "Venue";
  // If it already has spaces, it's a proper name
  if (raw.includes(" ")) return raw;
  return raw
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ArtistPortalPage() {
  const { displayName } = useAuth();
  const [stats, setStats] = useState({ placements: 0, sales: "£0", enquiries: 0, views: 0 });
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("none");

  useEffect(() => {
    // Single API call for entire dashboard
    async function loadDashboard() {
      const data = await authFetch("/api/dashboard").then((r) => r.json()).catch(() => ({}));

      if (data.profile?.subscription_status) setSubscriptionStatus(data.profile.subscription_status);

      if (data.stats) {
        setStats({
          placements: data.stats.activePlacements || 0,
          sales: `\u00a3${(data.stats.totalRevenue || 0).toLocaleString()}`,
          enquiries: data.stats.enquiries || 0,
          views: data.stats.views || 0,
        });
      }

      // Build activity from dashboard data
      const items: ActivityItem[] = [];
      const placements = data.placements || [];
      const conversations = data.conversations || [];

      for (const p of placements.slice(0, 10)) {
        const time = p.responded_at || p.created_at;
        const venueName = formatName(p.venue);
        if (p.status === "pending") {
          items.push({ id: "p-" + p.id, text: `Placement request: ${p.work_title || "Artwork"} — ${venueName}`, time: formatRelativeTime(time), sortTime: new Date(time).getTime(), type: "placement" });
        } else if (p.status === "active") {
          items.push({ id: "pa-" + p.id, text: `Placement accepted: ${p.work_title || "Artwork"} at ${venueName}`, time: formatRelativeTime(time), sortTime: new Date(time).getTime(), type: "placement" });
        } else if (p.status === "declined") {
          items.push({ id: "pd-" + p.id, text: `Placement declined: ${p.work_title || "Artwork"}`, time: formatRelativeTime(time), sortTime: new Date(time).getTime(), type: "placement" });
        }
      }

      for (const c of conversations) {
        const name = formatName(c.otherParty);
        const preview = c.latestMessage?.slice(0, 50) || "";
        items.push({ id: "m-" + c.conversationId, text: `${name}: "${preview}${c.latestMessage?.length > 50 ? "..." : ""}"`, time: formatRelativeTime(c.lastActivity), sortTime: new Date(c.lastActivity).getTime(), type: c.unreadCount > 0 ? "enquiry" : "message" });
      }

      items.sort((a, b) => b.sortTime - a.sortTime);
      setActivity(items.slice(0, 8));
    }
    loadDashboard();
  }, []);

  return (
    <ArtistPortalLayout activePath="/artist-portal">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl mb-1">Welcome back, {displayName?.split(" ")[0] || "Artist"}</h1>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent/10 text-accent px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
            Your artist portal
          </span>
        </div>
        <Button href="/artist-portal/portfolio" variant="secondary" size="sm">
          Edit Portfolio
        </Button>
      </div>

      {/* Subscription prompt */}
      {subscriptionStatus === "none" && (
        <div className="mb-6 bg-accent/5 border border-accent/20 rounded-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Choose a plan to unlock your full portal</p>
            <p className="text-xs text-muted mt-0.5">All plans include a free trial. Founding artists get 6 months free.</p>
          </div>
          <Button href="/artist-portal/billing" variant="accent" size="sm">Choose a Plan</Button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Active Placements", value: String(stats.placements) },
          { label: "Total Sales", value: stats.sales },
          { label: "Enquiries This Month", value: String(stats.enquiries) },
          { label: "Profile Views", value: String(stats.views) },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface border border-border rounded-sm p-5">
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
          {activity.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted">
              No recent activity yet. Start by{" "}
              <Link href="/artist-portal/placements" className="text-accent hover:underline">logging a placement</Link>.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((item) => {
                const t = activityTypes[item.type] || activityTypes.view;
                return (
                  <li key={item.id} className="px-4 sm:px-6 py-3.5 flex items-center gap-3">
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-full ${t.bg} ${t.text} flex items-center justify-center shrink-0`}>
                      {t.icon}
                    </div>
                    {/* Type label — fixed width column */}
                    <span className={`w-20 shrink-0 text-[11px] font-medium ${t.text} uppercase tracking-wider hidden sm:block`}>
                      {t.label}
                    </span>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug truncate">{item.text}</p>
                      <p className="text-[11px] text-muted mt-0.5">{item.time}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-surface border border-border rounded-sm">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-medium">Quick Actions</h2>
          </div>
          <div className="p-6 flex flex-col gap-3">
            {[
              { href: "/artist-portal/portfolio", label: "Edit Portfolio", icon: <><rect x="2" y="2" width="12" height="12" rx="1" stroke="#C17C5A" strokeWidth="1.25" /><path d="M5 8h6M5 5.5h6M5 10.5h4" stroke="#C17C5A" strokeWidth="1.25" strokeLinecap="round" /></> },
              { href: "/artist-portal/analytics", label: "View Analytics", icon: <path d="M2 12l4-4 3 3 5-7" stroke="#C17C5A" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /> },
              { href: "/artist-portal/placements", label: "Update Availability", icon: <><rect x="2" y="3" width="12" height="10" rx="1" stroke="#C17C5A" strokeWidth="1.25" /><path d="M5 7h6M5 10h4" stroke="#C17C5A" strokeWidth="1.25" strokeLinecap="round" /><path d="M8 1v4" stroke="#C17C5A" strokeWidth="1.25" strokeLinecap="round" /></> },
              { href: "/artist-portal/labels", label: "Print QR Labels", icon: <><rect x="1" y="1" width="6" height="6" rx="0.5" stroke="#C17C5A" strokeWidth="1.25" /><rect x="9" y="1" width="6" height="6" rx="0.5" stroke="#C17C5A" strokeWidth="1.25" /><rect x="1" y="9" width="6" height="6" rx="0.5" stroke="#C17C5A" strokeWidth="1.25" /><rect x="9" y="9" width="6" height="6" rx="0.5" stroke="#C17C5A" strokeWidth="1.25" /></> },
            ].map(({ href, label, icon }) => (
              <Link key={href} href={href} className="flex items-center gap-3 p-3 rounded-sm border border-border hover:bg-background transition-colors text-sm text-foreground">
                <span className="w-8 h-8 rounded-sm bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">{icon}</svg>
                </span>
                {label}
              </Link>
            ))}
          </div>

          {/* Summary from localStorage */}
          <div className="px-6 pb-6">
            <div className="bg-background rounded-sm p-4">
              <p className="text-xs text-muted mb-3 font-medium uppercase tracking-wide">Summary</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Earnings</span>
                  <span className="font-medium">{stats.sales}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Active placements</span>
                  <span className="font-medium">{stats.placements}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ArtistPortalLayout>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
