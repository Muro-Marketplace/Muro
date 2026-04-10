"use client";

import Link from "next/link";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { useAuth } from "@/context/AuthContext";

const stats = [
  { label: "Saved Artists", value: "8" },
  { label: "Active Enquiries", value: "3" },
  { label: "Artworks on Display", value: "5" },
  { label: "Total Spent", value: "£1,200" },
];

const recentActivity = [
  {
    id: 1,
    text: "Enquiry response from Maya Chen",
    time: "2 hours ago",
    type: "response",
  },
  {
    id: 2,
    text: "New artwork added by James Okafor matching your preferences",
    time: "Yesterday",
    type: "match",
  },
  {
    id: 3,
    text: "Order #1024 shipped – estimated delivery 27 Mar",
    time: "2 days ago",
    type: "order",
  },
  {
    id: 4,
    text: "Sofia Andersen accepted your free loan enquiry",
    time: "3 days ago",
    type: "response",
  },
  {
    id: 5,
    text: "Your venue profile was updated successfully",
    time: "5 days ago",
    type: "profile",
  },
];

const activityIcon = (type: string) => {
  switch (type) {
    case "response":
      return (
        <span className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      );
    case "match":
      return (
        <span className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </span>
      );
    case "order":
      return (
        <span className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13" rx="1" />
            <path d="M16 8h4l3 5v3h-7V8z" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
        </span>
      );
    default:
      return (
        <span className="w-8 h-8 rounded-full bg-border/50 flex items-center justify-center shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B6B6B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </span>
      );
  }
};

export default function VenueDashboardPage() {
  const { displayName } = useAuth();
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
            <p className="text-2xl font-serif text-foreground mb-1">
              {stat.value}
            </p>
            <p className="text-xs text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white border border-border rounded-sm p-6">
          <h2 className="font-serif text-lg text-foreground mb-5">
            Recent Activity
          </h2>
          <ul className="space-y-4">
            {recentActivity.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                {activityIcon(item.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">
                    {item.text}
                  </p>
                  <p className="text-xs text-muted mt-0.5">{item.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Quick Actions */}
        <div className="bg-white border border-border rounded-sm p-6">
          <h2 className="font-serif text-lg text-foreground mb-5">
            Quick Actions
          </h2>
          <div className="space-y-3">
            <Link
              href="/browse"
              className="flex items-center justify-between w-full px-4 py-3 bg-background border border-border rounded-sm text-sm text-foreground hover:border-accent/40 hover:bg-accent/5 transition-colors duration-150 group"
            >
              <span>Browse Portfolios</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted group-hover:text-accent transition-colors">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link
              href="/venue-portal/enquiries"
              className="flex items-center justify-between w-full px-4 py-3 bg-background border border-border rounded-sm text-sm text-foreground hover:border-accent/40 hover:bg-accent/5 transition-colors duration-150 group"
            >
              <span>View Enquiries</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted group-hover:text-accent transition-colors">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link
              href="/venue-portal/profile"
              className="flex items-center justify-between w-full px-4 py-3 bg-background border border-border rounded-sm text-sm text-foreground hover:border-accent/40 hover:bg-accent/5 transition-colors duration-150 group"
            >
              <span>Update Preferences</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted group-hover:text-accent transition-colors">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Upgrade CTA */}
      <div className="bg-foreground text-white rounded-sm p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-white/50 mb-2">
              Premium Plan
            </p>
            <h2 className="font-serif text-xl lg:text-2xl mb-3">
              Upgrade to Premium
            </h2>
            <p className="text-sm text-white/70 leading-relaxed mb-4">
              Unlock powerful tools to source art smarter and faster.
            </p>
            <ul className="space-y-1.5">
              {[
                "AI-powered art search tailored to your space",
                "AI Visualiser – see artwork on your walls before you commit",
                "Curated recommendations updated weekly",
                "Optional installation packages",
                "Priority support",
              ].map((benefit) => (
                <li key={benefit} className="flex items-center gap-2 text-sm text-white/80">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3 shrink-0">
            <Link
              href="/venue-portal/premium"
              className="px-6 py-3 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent/90 transition-colors duration-150 text-center"
            >
              Upgrade to Premium
            </Link>
            <Link
              href="/contact"
              className="px-6 py-3 bg-white/10 text-white/80 text-sm rounded-sm hover:bg-white/15 transition-colors duration-150 text-center"
            >
              Contact us for pricing
            </Link>
          </div>
        </div>
      </div>
    </VenuePortalLayout>
  );
}
