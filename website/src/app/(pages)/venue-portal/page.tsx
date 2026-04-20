"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { useAuth } from "@/context/AuthContext";
import { useSaved } from "@/context/SavedContext";
import { authFetch } from "@/lib/api-client";

interface OnboardingItem {
  key: string;
  label: string;
  complete: boolean;
  href: string;
}

interface ActivityItem {
  id: string;
  text: string;
  time: string;
  sortTime: number;
  type: "placement" | "placement_accepted" | "placement_declined" | "message" | "enquiry" | "order" | "view";
  link?: string;
}

const activityTypes: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  placement: {
    label: "Request", bg: "bg-amber-50", text: "text-amber-600",
    icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>),
  },
  placement_accepted: {
    label: "Accepted", bg: "bg-green-50", text: "text-green-600",
    icon: (<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>),
  },
  placement_declined: {
    label: "Declined", bg: "bg-red-50", text: "text-red-600",
    icon: (<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>),
  },
  message: {
    label: "Message", bg: "bg-blue-50", text: "text-blue-600",
    icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>),
  },
  enquiry: {
    label: "Enquiry", bg: "bg-purple-50", text: "text-purple-600",
    icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>),
  },
  order: {
    label: "Order", bg: "bg-accent/8", text: "text-accent",
    icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" /></svg>),
  },
  view: {
    label: "View", bg: "bg-gray-50", text: "text-gray-500",
    icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>),
  },
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatName(raw: string): string {
  if (!raw) return "";
  if (raw.includes(" ")) return raw;
  return raw.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function VenueDashboardPage() {
  const { displayName } = useAuth();
  const { savedItems } = useSaved();
  const savedArtistCount = savedItems.filter((s) => s.type === "artist").length;
  const [stats, setStats] = useState([
    { label: "Saved Artists", value: String(savedArtistCount) },
    { label: "Total Spent", value: "\u00a30" },
    { label: "Revenue Share Earned", value: "\u00a30" },
    { label: "QR Scans", value: "0" },
  ]);
  const [loading, setLoading] = useState(true);
  const [onboardingItems, setOnboardingItems] = useState<OnboardingItem[]>([]);
  const [onboardingDismissed, setOnboardingDismissed] = useState(true);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    const dismissed = typeof window !== "undefined" && localStorage.getItem("wallplace-venue-onboarding-complete") === "true";
    setOnboardingDismissed(dismissed);
  }, []);

  useEffect(() => {
    Promise.all([
      authFetch("/api/dashboard").then((r) => r.json()).catch(() => ({})),
      authFetch("/api/placements").then((r) => r.json()).catch(() => ({ placements: [] })),
    ]).then(([dashboardData, placementsData]) => {
      const orders = dashboardData.orders || [];
      const totalSpent = orders.reduce((sum: number, o: { total?: number }) => sum + (o.total || 0), 0);
      const placements = placementsData.placements || [];
      const revenueEarned = placements.reduce(
        (sum: number, p: { revenue?: number }) => sum + (p.revenue || 0), 0
      );

      setStats([
        { label: "Saved Artists", value: String(savedArtistCount) },
        { label: "Total Spent", value: `\u00a3${totalSpent.toLocaleString()}` },
        { label: "Revenue Share Earned", value: `\u00a3${revenueEarned.toLocaleString()}` },
        { label: "QR Scans", value: "0" },
      ]);

      // Build onboarding checklist
      const profile = dashboardData.profile || {};
      const sentMessageCount = dashboardData.sentMessageCount ?? 0;

      const hasName = !!profile.name;
      const hasType = !!(profile.type || profile.venue_type);
      const hasLocation = !!(profile.location || profile.city || profile.postcode || profile.address_line1);
      const profileComplete = hasName && hasType && hasLocation;

      const hasPreferences = (Array.isArray(profile.preferred_styles) && profile.preferred_styles.length > 0)
        || (Array.isArray(profile.preferred_themes) && profile.preferred_themes.length > 0);

      // "Browse artist portfolios" — track via localStorage
      const hasBrowsed = typeof window !== "undefined" && localStorage.getItem("wallplace-venue-has-browsed") === "true";

      const items: OnboardingItem[] = [
        { key: "profile",     label: "Complete your venue profile",       complete: profileComplete,                          href: "/venue-portal/profile" },
        { key: "preferences", label: "Describe what you're looking for",  complete: hasPreferences,                           href: "/venue-portal/profile" },
        { key: "browse",      label: "Browse artist portfolios",          complete: hasBrowsed,                               href: "/browse" },
        { key: "enquiry",     label: "Send your first enquiry",           complete: sentMessageCount > 0,                     href: "/browse" },
        { key: "payouts",     label: "Set up payouts",                    complete: !!profile.stripe_connect_account_id,       href: "/venue-portal/settings" },
      ];
      setOnboardingItems(items);

      // Auto-dismiss if all complete
      if (items.every((i) => i.complete) && typeof window !== "undefined") {
        setTimeout(() => {
          localStorage.setItem("wallplace-venue-onboarding-complete", "true");
          setOnboardingDismissed(true);
        }, 3000);
      }

      // Build Recent Activity — mirror of artist portal
      const activityItems: ActivityItem[] = [];

      for (const p of placements.slice(0, 15)) {
        const time = p.responded_at || p.created_at;
        if (!time) continue;
        const artistName = formatName(p.artist_slug || "");
        const workTitle = p.work_title || "Artwork";
        if (p.status === "pending") {
          activityItems.push({ id: "p-" + p.id, text: `Placement request: ${workTitle}${artistName ? ` — ${artistName}` : ""}`, time: formatRelativeTime(time), sortTime: new Date(time).getTime(), type: "placement", link: "/venue-portal/placements" });
        } else if (p.status === "active") {
          activityItems.push({ id: "pa-" + p.id, text: `Placement accepted: ${workTitle}${artistName ? ` — ${artistName}` : ""}`, time: formatRelativeTime(time), sortTime: new Date(time).getTime(), type: "placement_accepted", link: "/venue-portal/placements" });
        } else if (p.status === "declined") {
          activityItems.push({ id: "pd-" + p.id, text: `Placement declined: ${workTitle}${artistName ? ` — ${artistName}` : ""}`, time: formatRelativeTime(time), sortTime: new Date(time).getTime(), type: "placement_declined", link: "/venue-portal/placements" });
        }
      }

      for (const o of orders.slice(0, 8) as Array<{ id?: string; total?: number; created_at?: string; artist_slug?: string }>) {
        if (!o.created_at) continue;
        const artistName = formatName(o.artist_slug || "");
        activityItems.push({
          id: "o-" + (o.id || o.created_at),
          text: `Order placed${o.total ? ` for \u00a3${o.total}` : ""}${artistName ? ` — ${artistName}` : ""}`,
          time: formatRelativeTime(o.created_at),
          sortTime: new Date(o.created_at).getTime(),
          type: "order",
          link: "/venue-portal/orders",
        });
      }

      activityItems.sort((a, b) => b.sortTime - a.sortTime);
      setActivity(activityItems.slice(0, 8));
    }).finally(() => setLoading(false));
  }, [savedArtistCount]);

  const onboardingComplete = onboardingItems.filter((i) => i.complete).length;
  const onboardingTotal = onboardingItems.length;
  const allComplete = onboardingTotal > 0 && onboardingComplete === onboardingTotal;

  function dismissOnboarding() {
    if (typeof window !== "undefined") {
      localStorage.setItem("wallplace-venue-onboarding-complete", "true");
    }
    setOnboardingDismissed(true);
  }

  return (
    <VenuePortalLayout>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-serif text-2xl lg:text-3xl text-foreground">
              Welcome back, {displayName || "there"}
            </h1>
          </div>
          <p className="text-sm text-muted">Here&apos;s what&apos;s happening with your account.</p>
        </div>
        <span className="shrink-0 px-3 py-1 text-xs font-medium bg-background border border-border rounded-full text-muted">
          Free Plan
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white border border-border rounded-sm p-5"
          >
            <p className={`text-2xl font-serif text-foreground mb-1 ${loading ? "animate-pulse" : ""}`}>
              {loading ? "\u2014" : stat.value}
            </p>
            <p className="text-xs text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Onboarding checklist */}
      {!onboardingDismissed && onboardingItems.length > 0 && (
        <div className="mb-6 bg-white border border-border rounded-sm overflow-hidden">
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
                <h2 className="font-serif text-lg text-foreground">
                  {allComplete ? "You're all set!" : "Getting Started"}
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  {allComplete
                    ? "Your venue portal is fully set up. Start discovering artists!"
                    : `${onboardingComplete} of ${onboardingTotal} complete. Finish setting up to start finding art for your space`}
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
                <p className="text-sm text-foreground">Your venue is ready. Browse portfolios and start connecting with artists!</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {onboardingItems.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={() => {
                        // Mark "browse" as complete on first click
                        if (item.key === "browse" && typeof window !== "undefined") {
                          localStorage.setItem("wallplace-venue-has-browsed", "true");
                        }
                      }}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Quick Actions */}
        <div className="lg:col-span-2 bg-white border border-border rounded-sm p-6">
          <h2 className="font-serif text-lg text-foreground mb-5">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Browse Portfolios", href: "/browse", description: "Find art for your space" },
              { label: "View Enquiries", href: "/venue-portal/enquiries", description: "Check your messages" },
              { label: "Your Orders", href: "/venue-portal/orders", description: "Track purchases" },
              { label: "Update Preferences", href: "/venue-portal/profile", description: "Tell artists what you need" },
            ].map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center justify-between w-full px-4 py-3 bg-background border border-border rounded-sm text-foreground hover:border-accent/40 hover:bg-accent/5 transition-colors duration-150 group"
              >
                <div>
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-[11px] text-muted mt-0.5">{action.description}</p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted group-hover:text-accent transition-colors shrink-0 ml-3">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white border border-border rounded-sm p-6">
          <h2 className="font-serif text-lg text-foreground mb-5">
            Summary
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Saved artists</span>
              <span className="font-medium">{savedArtistCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Orders</span>
              <span className="font-medium">{stats[2]?.value || "0"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Total spent</span>
              <span className="font-medium">{stats[3]?.value || "\u00a30"}</span>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-border">
            <Link href="/browse" className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent/90 transition-colors">
              Browse Art
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Activity (mirror of artist portal) */}
      <div className="bg-surface border border-border rounded-sm mb-8">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-medium">Recent Activity</h2>
        </div>
        {activity.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted">
            No recent activity yet. Start by{" "}
            <Link href="/browse" className="text-accent hover:underline">browsing portfolios</Link>.
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
    </VenuePortalLayout>
  );
}
