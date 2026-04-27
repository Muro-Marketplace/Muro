"use client";

import { useState, useEffect } from "react";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import PlacementActionItems from "@/components/PlacementActionItems";
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
  link?: string;
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

interface OnboardingItem {
  key: string;
  label: string;
  complete: boolean;
  href: string;
}

export default function ArtistPortalPage() {
  const { displayName, user } = useAuth();
  const [stats, setStats] = useState({ placements: 0, sales: "£0", enquiries: 0, views: 0 });
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("none");
  const [onboardingItems, setOnboardingItems] = useState<OnboardingItem[]>([]);
  const [onboardingDismissed, setOnboardingDismissed] = useState(true);

  useEffect(() => {
    // Check if onboarding was previously dismissed
    const dismissed = typeof window !== "undefined" && localStorage.getItem("wallplace-onboarding-complete") === "true";
    setOnboardingDismissed(dismissed);
  }, []);

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

      // Build onboarding checklist
      const profile = data.profile || {};
      const placements = data.placements || [];
      const worksCount = data.worksCount ?? 0;

      const hasBio = !!(profile.short_bio || profile.extended_bio);
      const hasLocation = !!profile.location;
      const hasStyleTag = Array.isArray(profile.style_tags) && profile.style_tags.length > 0;
      const profileComplete = hasBio && hasLocation && hasStyleTag;

      // "Set your shipping price" was removed — shipping is per-work
      // (and per-size), not a single profile-level number, so a
      // standalone onboarding step never matched how artists
      // actually configure it. The shipping fields on the work form
      // (with the row-level + size-level estimator) handle this in
      // the right place.
      const items: OnboardingItem[] = [
        { key: "profile",  label: "Complete your profile",   complete: profileComplete,                                  href: "/artist-portal/profile" },
        { key: "work",     label: "Upload your first work",  complete: worksCount > 0,                                   href: "/artist-portal/portfolio" },
        { key: "payouts",  label: "Set up payouts",          complete: !!profile.stripe_connect_account_id,              href: "/artist-portal/billing" },
        { key: "placement",label: "Get your first placement", complete: placements.some((p: { status: string }) => p.status === "active"), href: "/artist-portal/placements" },
      ];
      setOnboardingItems(items);

      // If all items are complete, auto-dismiss after a brief moment
      if (items.every((i) => i.complete) && typeof window !== "undefined") {
        setTimeout(() => {
          localStorage.setItem("wallplace-onboarding-complete", "true");
          setOnboardingDismissed(true);
        }, 3000);
      }

      // Build activity from dashboard data
      const activityItems: ActivityItem[] = [];
      const conversations = data.conversations || [];

      const mySlug = profile.slug || "";
      const myUserId = profile.user_id || "";
      for (const p of placements.slice(0, 10)) {
        const time = p.responded_at || p.created_at;
        const venueName = formatName(p.venue);
        const placementLink = `/placements/${encodeURIComponent(p.id)}`;
        const iAmRequester = p.requester_user_id && p.requester_user_id === myUserId;
        if (p.status === "pending" && !iAmRequester) {
          activityItems.push({ id: "p-" + p.id, text: `Placement request: ${p.work_title || "Artwork"} at ${venueName}`, time: formatRelativeTime(time), sortTime: new Date(time).getTime(), type: "placement", link: placementLink });
        } else if (p.status === "active" && iAmRequester) {
          // Artist hears back when their request was accepted.
          activityItems.push({ id: "pa-" + p.id, text: `Placement accepted: ${p.work_title || "Artwork"} at ${venueName}`, time: formatRelativeTime(time), sortTime: new Date(time).getTime(), type: "placement", link: placementLink });
        } else if (p.status === "active" && !iAmRequester) {
          // Artist accepted an incoming venue request — surface the success quietly.
          activityItems.push({ id: "pa-" + p.id, text: `Placement live: ${p.work_title || "Artwork"} at ${venueName}`, time: formatRelativeTime(time), sortTime: new Date(time).getTime(), type: "placement", link: placementLink });
        } else if (p.status === "declined" && iAmRequester) {
          activityItems.push({ id: "pd-" + p.id, text: `Placement declined: ${p.work_title || "Artwork"}`, time: formatRelativeTime(time), sortTime: new Date(time).getTime(), type: "placement", link: placementLink });
        }
      }

      for (const c of conversations) {
        // Only surface inbound messages — things the artist needs to
        // react to. If the latest message was sent by them, skip it.
        const isInbound = c.latestSender && c.latestSender !== mySlug;
        if (!isInbound) continue;
        const name = formatName(c.otherParty);
        const preview = c.latestMessage?.slice(0, 50) || "";
        activityItems.push({ id: "m-" + c.conversationId, text: `${name}: "${preview}${c.latestMessage?.length > 50 ? "..." : ""}"`, time: formatRelativeTime(c.lastActivity), sortTime: new Date(c.lastActivity).getTime(), type: c.unreadCount > 0 ? "enquiry" : "message", link: "/artist-portal/messages" });
      }

      activityItems.sort((a, b) => b.sortTime - a.sortTime);
      setActivity(activityItems.slice(0, 8));
    }
    loadDashboard();
  }, []);

  const onboardingComplete = onboardingItems.filter((i) => i.complete).length;
  const onboardingTotal = onboardingItems.length;
  const allComplete = onboardingTotal > 0 && onboardingComplete === onboardingTotal;

  function dismissOnboarding() {
    if (typeof window !== "undefined") {
      localStorage.setItem("wallplace-onboarding-complete", "true");
    }
    setOnboardingDismissed(true);
  }

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

      {/* Dashboard order: Getting Started → Stats → Action Items → Activity.
          Matches the venue dashboard so the setup checklist leads, numbers
          follow, and outstanding to-dos sit just above the activity feed. */}

      {/* Subscription prompt */}
      {subscriptionStatus === "none" && (
        <div className="mb-6 bg-accent/5 border border-accent/20 rounded-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Choose a plan to unlock your full portal</p>
            <p className="text-xs text-muted mt-0.5">All plans include a 30-day free trial.</p>
          </div>
          <Button href="/artist-portal/billing" variant="accent" size="sm">Choose a Plan</Button>
        </div>
      )}

      {/* Onboarding checklist */}
      {!onboardingDismissed && onboardingItems.length > 0 && (
        <div className="mb-6 bg-surface border border-border rounded-sm overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-border">
            <div
              className="h-1 bg-accent transition-all duration-500 ease-out"
              style={{ width: `${onboardingTotal > 0 ? (onboardingComplete / onboardingTotal) * 100 : 0}%` }}
            />
          </div>

          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-medium text-foreground">
                  {allComplete ? "You're all set!" : "Getting Started"}
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  {allComplete
                    ? "Great work! Your artist portal is fully set up."
                    : `${onboardingComplete} of ${onboardingTotal} complete. Finish setting up to start getting placements`}
                </p>
              </div>
              {!allComplete && (
                <span className="shrink-0 ml-4 text-xs font-medium text-accent bg-accent/10 px-2.5 py-1 rounded-full">
                  {onboardingComplete}/{onboardingTotal}
                </span>
              )}
            </div>

            {/* Checklist items */}
            {allComplete ? (
              <div className="flex items-center gap-3 py-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-sm text-foreground">Your portal is ready. Start connecting with venues!</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {onboardingItems.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-sm transition-colors group ${
                        item.complete
                          ? "opacity-60"
                          : "hover:bg-accent/5"
                      }`}
                    >
                      {/* Checkbox icon */}
                      {item.complete ? (
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="2 7 5.5 10.5 12 3.5" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-border group-hover:border-accent/50 shrink-0 transition-colors" />
                      )}

                      {/* Label */}
                      <span className={`flex-1 text-sm ${
                        item.complete
                          ? "line-through text-muted"
                          : "text-foreground"
                      }`}>
                        {item.label}
                      </span>

                      {/* Action arrow for incomplete items */}
                      {!item.complete && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* Dismiss link */}
            <div className="flex justify-end mt-3 pt-3 border-t border-border">
              <button
                onClick={dismissOnboarding}
                className="text-xs text-muted hover:text-foreground transition-colors"
              >
                {allComplete ? "Close" : "Dismiss"}
              </button>
            </div>
          </div>
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

      {/* Placement Action Items */}
      <PlacementActionItems userId={user?.id} role="artist" />

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
                const Row = (
                  <>
                    <div className={`w-8 h-8 rounded-full ${t.bg} ${t.text} flex items-center justify-center shrink-0`}>
                      {t.icon}
                    </div>
                    <span className={`w-20 shrink-0 text-[11px] font-medium ${t.text} uppercase tracking-wider hidden sm:block`}>
                      {t.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug truncate">{item.text}</p>
                      <p className="text-[11px] text-muted mt-0.5">{item.time}</p>
                    </div>
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.link ? (
                      <Link href={item.link} className="px-4 sm:px-6 py-3.5 flex items-center gap-3 hover:bg-background/60 transition-colors">
                        {Row}
                      </Link>
                    ) : (
                      <div className="px-4 sm:px-6 py-3.5 flex items-center gap-3">{Row}</div>
                    )}
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
