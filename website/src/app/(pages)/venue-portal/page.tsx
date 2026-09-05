"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import PlacementActionItems from "@/components/PlacementActionItems";
import { useAuth } from "@/context/AuthContext";
import { useSaved } from "@/context/SavedContext";
import { authFetch } from "@/lib/api-client";
import { venueRevenueEarned } from "@/lib/finance/venue-earnings";
import { formatPounds } from "@/lib/format-currency";
import { PROGRAMME_LADDER } from "@/lib/curation-tiers";

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

/** "£79.99 a month for 3 pieces", from the first rung of the programme ladder. */
function formatProgrammeEntry(): string {
  const entry = PROGRAMME_LADDER[0];
  const price = Number.isInteger(entry.monthlyGbp) ? String(entry.monthlyGbp) : entry.monthlyGbp.toFixed(2);
  return `\u00a3${price} a month for ${entry.pieces} pieces`;
}

export default function VenueDashboardPage() {
  const { displayName, user } = useAuth();
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
  // null until /api/walls answers, so the prompt never flashes for a venue
  // that has walls.
  const [wallSummary, setWallSummary] = useState<{ total: number; publicCount: number } | null>(null);

  useEffect(() => {
    const dismissed = typeof window !== "undefined" && localStorage.getItem("wallplace-venue-onboarding-complete") === "true";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnboardingDismissed(dismissed);
  }, []);

  useEffect(() => {
    Promise.all([
      authFetch("/api/dashboard").then((r) => r.json()).catch(() => ({})),
      authFetch("/api/placements").then((r) => r.json()).catch(() => ({ placements: [] })),
      // QR scan count comes from the venue analytics endpoint, which counts
      // analytics_events rows scoped to this venue (event_type=qr_scan).
      // `range=all` so the dashboard tile shows the lifetime number rather
      // than a 30-day window.
      authFetch("/api/analytics/venue?range=all").then((r) => r.json()).catch(() => ({ totals: { qr_scans: 0 } })),
      // E4: the payouts checklist tick needs the real onboarding fact.
      // An account id alone is stored the moment onboarding STARTS.
      authFetch("/api/stripe-connect/status")
        .then((r) => r.json())
        .catch(() => ({} as { onboardingComplete?: boolean })),
      // Walls the venue has measured up, for the "add a wall" prompt.
      authFetch("/api/walls")
        .then((r) => (r.ok ? r.json() : { walls: [] }))
        .catch(() => ({ walls: [] })),
    ]).then(([dashboardData, placementsData, analyticsData, connectData, wallsData]) => {
      const wallRows = Array.isArray(wallsData?.walls) ? (wallsData.walls as Array<{ is_public_on_profile?: boolean }>) : [];
      setWallSummary({ total: wallRows.length, publicCount: wallRows.filter((w) => !!w.is_public_on_profile).length });
      const orders = dashboardData.orders || [];
      // E2: /api/dashboard's venue branch returns orders matched by
      // venue_slug OR buyer_email, so it includes customer QR sales AT the
      // venue. "Total Spent" must only sum the venue's own purchases
      // (buyer_email match, the same rule the Orders page uses), and skips
      // cancelled/refunded orders like the customer portal does.
      const venueEmail = (user?.email || "").toLowerCase();
      const totalSpent = orders.reduce(
        (sum: number, o: { total?: number; buyer_email?: string; status?: string }) => {
          const isOwnPurchase = !!venueEmail && (o.buyer_email || "").toLowerCase() === venueEmail;
          const isVoided = o.status === "cancelled" || o.status === "refunded";
          return isOwnPurchase && !isVoided ? sum + (o.total || 0) : sum;
        },
        0,
      );
      const placements = placementsData.placements || [];
      // QA 2026-08-30 bug 24: this summed `placements.revenue`, a cached column
      // the order pipeline only writes back when an order reaches `delivered`.
      // QR sales never do, so it is NULL on every row and the venue's landing
      // screen read "Revenue Share Earned £0.00" while its own Orders page,
      // one click away, read £10.00 from the orders themselves.
      //
      // Reading the orders directly makes the two screens agree by
      // construction, and matches the repo rule that a mirrored column must be
      // written by a trigger or a cron, never trusted when it is neither.
      const revenueEarned = venueRevenueEarned(orders, venueEmail);

      const qrScans = (analyticsData?.totals?.qr_scans as number | undefined) ?? 0;

      setStats([
        { label: "Saved Artists", value: String(savedArtistCount) },
        { label: "Total Spent", value: formatPounds(totalSpent) },
        { label: "Revenue Share Earned", value: formatPounds(revenueEarned) },
        { label: "QR Scans", value: String(qrScans) },
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

      // "Browse artist portfolios", track via localStorage
      const hasBrowsed = typeof window !== "undefined" && localStorage.getItem("wallplace-venue-has-browsed") === "true";

      const items: OnboardingItem[] = [
        { key: "profile",     label: "Complete your venue profile",       complete: profileComplete,                          href: "/venue-portal/profile" },
        { key: "preferences", label: "Describe what you're looking for",  complete: hasPreferences,                           href: "/venue-portal/profile" },
        { key: "browse",      label: "Browse artist portfolios",          complete: hasBrowsed,                               href: "/browse" },
        { key: "enquiry",     label: "Send your first enquiry",           complete: sentMessageCount > 0,                     href: "/browse" },
        // E4: keyed on the status endpoint's onboardingComplete
        // (charges_enabled && details_submitted), not the raw account id.
        { key: "payouts",     label: "Set up payouts",                    complete: connectData?.onboardingComplete === true,  href: "/venue-portal/settings" },
      ];
      setOnboardingItems(items);

      // Auto-dismiss if all complete
      if (items.every((i) => i.complete) && typeof window !== "undefined") {
        setTimeout(() => {
          localStorage.setItem("wallplace-venue-onboarding-complete", "true");
          setOnboardingDismissed(true);
        }, 3000);
      }

      // Build Recent Activity, mirror of artist portal
      const activityItems: ActivityItem[] = [];

      const myUserId = profile.user_id || "";
      for (const p of placements.slice(0, 15)) {
        const time = p.responded_at || p.created_at;
        if (!time) continue;
        const artistName = formatName(p.artist_slug || "");
        const workTitle = p.work_title || "Artwork";
        // Only surface placement activity that requires attention, skip
        // pending requests the venue sent (they already know) and
        // accepted/declined responses to inbound requests the venue
        // didn't send.
        // F51: placement rows carry the requester as proposed_by_user_id;
        // requester_user_id is a phantom column the rows never have.
        const requesterId = p.requester_user_id ?? p.proposed_by_user_id;
        const iAmRequester = requesterId && requesterId === myUserId;
        if (p.status === "pending" && !iAmRequester) {
          activityItems.push({ id: "p-" + p.id, text: `Placement request: ${workTitle}${artistName ? `, ${artistName}` : ""}`, time: formatRelativeTime(time), sortTime: new Date(time).getTime(), type: "placement", link: `/placements/${encodeURIComponent(p.id as string)}` });
        } else if (p.status === "active" && iAmRequester) {
          activityItems.push({ id: "pa-" + p.id, text: `Placement accepted: ${workTitle}${artistName ? `, ${artistName}` : ""}`, time: formatRelativeTime(time), sortTime: new Date(time).getTime(), type: "placement_accepted", link: `/placements/${encodeURIComponent(p.id as string)}` });
        } else if (p.status === "declined" && iAmRequester) {
          activityItems.push({ id: "pd-" + p.id, text: `Placement declined: ${workTitle}${artistName ? `, ${artistName}` : ""}`, time: formatRelativeTime(time), sortTime: new Date(time).getTime(), type: "placement_declined", link: `/placements/${encodeURIComponent(p.id as string)}` });
        }
      }

      for (const o of orders.slice(0, 8) as Array<{ id?: string; total?: number; created_at?: string; artist_slug?: string }>) {
        if (!o.created_at) continue;
        const artistName = formatName(o.artist_slug || "");
        const amountLabel = typeof o.total === "number" && Number.isFinite(o.total)
          ? ` for ${formatPounds(o.total)}`
          : "";
        activityItems.push({
          id: "o-" + (o.id || o.created_at),
          text: `Order placed${amountLabel}${artistName ? `, ${artistName}` : ""}`,
          time: formatRelativeTime(o.created_at),
          sortTime: new Date(o.created_at).getTime(),
          type: "order",
          link: "/venue-portal/orders",
        });
      }

      activityItems.sort((a, b) => b.sortTime - a.sortTime);
      setActivity(activityItems.slice(0, 8));
    }).finally(() => setLoading(false));
    // user?.email feeds the Total Spent purchase match above; re-run once
    // the auth context resolves so the tile doesn't stick at £0.
  }, [savedArtistCount, user?.email]);

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
      </div>

      {/* Dashboard order:
          1. Getting Started (onboarding), surfaces setup tasks first so
             a new venue lands on the steps to complete.
          2. Stats row, at-a-glance numbers for returning users.
          3. Placement Action Items, outstanding to-dos against live
             placements. Renders nothing when the queue is empty. */}

      {/* Onboarding checklist (Getting Started) */}
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

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white border border-border rounded-sm p-5"
          >
            <p className={`text-2xl font-serif text-foreground mb-1 ${loading ? "animate-pulse" : ""}`}>
              {loading ? "\u2026" : stat.value}
            </p>
            <p className="text-xs text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Placement Action Items */}
      <PlacementActionItems userId={user?.id} role="venue" />

      {/* Wallplace Programmes promo (owner instruction, 3 September 2026:
          this card used to sell Curated; Programmes is the product venues
          are here for). Single-row card, priced from the same ladder the
          /programmes page renders. */}
      {/* Walls prompt (owner instruction, 3 September 2026): venues had to
          find My Walls on their own. A venue with no walls is asked to
          photograph one; a venue whose walls are all private is nudged to
          show them, since artists can lay work out on a public wall before
          they ask. */}
      {wallSummary && wallSummary.total === 0 && (
        <div className="mb-8 bg-white border border-accent/40 rounded-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4" data-testid="walls-prompt">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent mb-1.5">Your walls</p>
            <p className="text-sm font-medium text-foreground">Show artists your walls.</p>
            <p className="text-xs text-muted mt-0.5">
              Upload a photo of a wall and its size. Artists can then lay their work out on it and send you the picture with their request.
            </p>
          </div>
          <Link
            href="/venue-portal/walls/new"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
          >
            Add a wall photo
          </Link>
        </div>
      )}
      {wallSummary && wallSummary.total > 0 && wallSummary.publicCount === 0 && (
        <div className="mb-8 bg-white border border-border rounded-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4" data-testid="walls-nudge">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent mb-1.5">Your walls</p>
            <p className="text-sm font-medium text-foreground">Your walls aren&rsquo;t on your profile yet.</p>
            <p className="text-xs text-muted mt-0.5">
              Tick &ldquo;Show on public profile&rdquo; on a wall and artists can picture their work on it before they ask.
            </p>
          </div>
          <Link
            href="/venue-portal/walls"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-foreground border border-border hover:border-accent/50 rounded-sm transition-colors"
          >
            Open My Walls
          </Link>
        </div>
      )}
      <div className="mb-8 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent border border-accent/30 rounded-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent mb-1.5">Wallplace Programmes</p>
          <p className="text-sm font-medium text-foreground">Original art on rotation, handled for you.</p>
          <p className="text-xs text-muted mt-0.5">
            We curate, install and rotate the work for a monthly fee, from {formatProgrammeEntry()}. The artists get paid every month their work is up.
          </p>
        </div>
        <Link
          href="/programmes"
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
        >
          Explore Programmes
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Quick Actions */}
        <div className="lg:col-span-2 bg-white border border-border rounded-sm p-6">
          <h2 className="font-serif text-lg text-foreground mb-5">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Browse Portfolios", href: "/browse", description: "Find art for your space" },
              // E5/E27: was "View Enquiries" → /venue-portal/enquiries, a page
              // whose backing API GET never existed (enquiries belong to
              // artists). Conversations with artists live in Messages.
              { label: "Your Messages", href: "/venue-portal/messages", description: "Chat with artists" },
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
              <span className="text-muted">Total spent</span>
              <span className="font-medium">{stats[1]?.value || "\u00a30"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Revenue share earned</span>
              <span className="font-medium">{stats[2]?.value || "\u00a30"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">QR scans</span>
              <span className="font-medium">{stats[3]?.value || "0"}</span>
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
