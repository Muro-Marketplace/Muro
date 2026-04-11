"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

export default function VenueDashboardPage() {
  const { displayName } = useAuth();
  const [stats, setStats] = useState([
    { label: "Saved Artists", value: "0" },
    { label: "Active Enquiries", value: "0" },
    { label: "Orders", value: "0" },
    { label: "Total Spent", value: "\u00a30" },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authFetch("/api/orders").then((r) => r.json()).catch(() => ({ orders: [] })),
    ]).then(([ordersData]) => {
      const orders = ordersData.orders || [];
      const totalSpent = orders.reduce((sum: number, o: { total?: number }) => sum + (o.total || 0), 0);

      setStats([
        { label: "Saved Artists", value: "0" },
        { label: "Active Enquiries", value: "0" },
        { label: "Orders", value: String(orders.length) },
        { label: "Total Spent", value: `\u00a3${totalSpent.toLocaleString()}` },
      ]);
    }).finally(() => setLoading(false));
  }, []);

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Getting Started */}
        <div className="lg:col-span-2 bg-white border border-border rounded-sm p-6">
          <h2 className="font-serif text-lg text-foreground mb-5">
            Getting Started
          </h2>
          <ul className="space-y-4">
            {[
              { text: "Browse artist portfolios and find art that fits your space", link: "/browse" },
              { text: "Send an enquiry to artists you like", link: "/browse" },
              { text: "Update your venue preferences so artists can find you", link: "/venue-portal/profile" },
            ].map((item) => (
              <li key={item.text} className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <Link href={item.link} className="text-sm text-foreground hover:text-accent transition-colors leading-snug">
                    {item.text}
                  </Link>
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
            {[
              { label: "Browse Portfolios", href: "/browse" },
              { label: "View Enquiries", href: "/venue-portal/enquiries" },
              { label: "Your Orders", href: "/venue-portal/orders" },
              { label: "Update Preferences", href: "/venue-portal/profile" },
            ].map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center justify-between w-full px-4 py-3 bg-background border border-border rounded-sm text-sm text-foreground hover:border-accent/40 hover:bg-accent/5 transition-colors duration-150 group"
              >
                <span>{action.label}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted group-hover:text-accent transition-colors">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </VenuePortalLayout>
  );
}
