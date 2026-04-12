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

export default function VenueDashboardPage() {
  const { displayName } = useAuth();
  const { savedItems } = useSaved();
  const savedArtistCount = savedItems.filter((s) => s.type === "artist").length;
  const [stats, setStats] = useState([
    { label: "Saved Artists", value: String(savedArtistCount) },
    { label: "Active Enquiries", value: "0" },
    { label: "Orders", value: "0" },
    { label: "Total Spent", value: "\u00a30" },
  ]);
  const [loading, setLoading] = useState(true);
  const [onboardingItems, setOnboardingItems] = useState<OnboardingItem[]>([]);
  const [onboardingDismissed, setOnboardingDismissed] = useState(true);

  useEffect(() => {
    const dismissed = typeof window !== "undefined" && localStorage.getItem("wallplace-venue-onboarding-complete") === "true";
    setOnboardingDismissed(dismissed);
  }, []);

  useEffect(() => {
    Promise.all([
      authFetch("/api/dashboard").then((r) => r.json()).catch(() => ({})),
    ]).then(([dashboardData]) => {
      const orders = dashboardData.orders || [];
      const totalSpent = orders.reduce((sum: number, o: { total?: number }) => sum + (o.total || 0), 0);

      setStats([
        { label: "Saved Artists", value: String(savedArtistCount) },
        { label: "Active Enquiries", value: "0" },
        { label: "Orders", value: String(orders.length) },
        { label: "Total Spent", value: `\u00a3${totalSpent.toLocaleString()}` },
      ]);

      // Build onboarding checklist
      const profile = dashboardData.profile || {};
      const sentMessageCount = dashboardData.sentMessageCount ?? 0;

      const hasName = !!profile.name;
      const hasType = !!profile.venue_type;
      const hasLocation = !!(profile.city || profile.postcode || profile.address_line1);
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
                    : `${onboardingComplete} of ${onboardingTotal} complete — finish setting up to start finding art for your space`}
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
    </VenuePortalLayout>
  );
}
