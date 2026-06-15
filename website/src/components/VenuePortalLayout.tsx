"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

// Nav order: Dashboard → Profile → Messages → Placements → rest (plan #8).
const navItems = [
  { label: "Dashboard", href: "/venue-portal" },
  { label: "Venue Profile", href: "/venue-portal/profile" },
  { label: "Messages", href: "/venue-portal/messages" },
  { label: "Placements", href: "/venue-portal/placements" },
  { label: "My Offers", href: "/venue-portal/offers" },
  { label: "Artwork Requests", href: "/venue-portal/artwork-requests" },
  { label: "My Walls", href: "/venue-portal/walls" },
  { label: "Saved", href: "/venue-portal/saved" },
  { label: "QR Labels", href: "/venue-portal/labels" },
  { label: "Analytics", href: "/venue-portal/analytics" },
  { label: "My Orders", href: "/venue-portal/orders" },
];

const bottomItems = [
  { label: "Settings", href: "/venue-portal/settings" },
];

/**
 * Per-route document title. Every portal page previously inherited the
 * site-wide "Wallplace | Curated Art for Commercial Spaces" title, which
 * made flipping between portal tabs impossible to tell apart from the
 * browser tab strip. Match by longest-prefix so /venue-portal/walls/abc
 * still resolves to "My Walls".
 */
const TITLE_BY_PREFIX: Array<readonly [string, string]> = [
  ["/venue-portal/artwork-requests", "Artwork Requests"],
  ["/venue-portal/analytics", "Analytics"],
  ["/venue-portal/messages", "Messages"],
  ["/venue-portal/placements", "Placements"],
  ["/venue-portal/offers", "My Offers"],
  ["/venue-portal/walls", "My Walls"],
  ["/venue-portal/saved", "Saved"],
  ["/venue-portal/labels", "QR Labels"],
  ["/venue-portal/orders", "My Orders"],
  ["/venue-portal/profile", "Venue Profile"],
  ["/venue-portal/settings", "Settings"],
  ["/venue-portal", "Dashboard"],
];

function portalTitleFor(pathname: string): string {
  for (const [prefix, label] of TITLE_BY_PREFIX) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return `${label} · Venue Portal · Wallplace`;
    }
  }
  return "Venue Portal · Wallplace";
}

interface VenuePortalLayoutProps {
  children: React.ReactNode;
  activePath?: string;
}

export default function VenuePortalLayout({
  children,
}: VenuePortalLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, userType, displayName, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || userType !== "venue")) {
      router.replace("/login");
    }
  }, [loading, user, userType, router]);

  // Set a per-page document.title so the browser tab strip is
  // distinguishable when several portal pages are open at once. The
  // app root metadata still owns the public site title; this only
  // runs while inside the portal and is restored on navigation away
  // by Next's own metadata pipeline.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = portalTitleFor(pathname);
  }, [pathname]);

  // Self-heal the caller's venue_profiles row on first portal visit.
  // The registration flow inserts the row with user_id=NULL (the user
  // isn't signed in yet); ensureProfile links it, OR inserts a minimal
  // row if the original orphan was never created / got lost. Without
  // this, every venue-only API call (placements, offers, artwork
  // requests) errors with a misleading "Artist profile not found".
  useEffect(() => {
    if (!user || !user.email_confirmed_at) return;
    authFetch("/api/venue-profile", {
      method: "PATCH",
      body: JSON.stringify({ ensureProfile: true }),
    }).catch(() => {});
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-48 h-1 bg-border rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full animate-[loading_1.5s_ease-in-out_infinite]" />
        </div>
        <p className="text-muted text-xs">Loading your portal...</p>
        <style>{`
          @keyframes loading {
            0% { width: 0%; margin-left: 0; }
            50% { width: 60%; margin-left: 20%; }
            100% { width: 0%; margin-left: 100%; }
          }
        `}</style>
      </div>
    );
  }

  if (!user || userType !== "venue") return null;

  function isActive(href: string) {
    if (href === "/venue-portal") return pathname === "/venue-portal";
    // For section roots like /venue-portal/walls, also match nested paths.
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  // Rendered as a JSX value (not a nested component) so we satisfy
  // react-hooks/static-components: defining a component inside another
  // component creates a fresh component identity on every render, which
  // remounts the subtree and trashes any child state.
  const navContent = (
    <nav className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-border">
        <p className="text-xs font-medium uppercase tracking-widest text-muted">
          Venue Portal
        </p>
      </div>
      <div className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-150 rounded-sm mx-1 ${
                  isActive(item.href)
                    ? "bg-accent/8 text-accent font-medium"
                    : "text-foreground/70 hover:text-foreground hover:bg-white/60"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mx-4 my-3 border-t border-border" />
        <ul className="space-y-0.5">
          {bottomItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted hover:text-foreground hover:bg-white/60 transition-colors duration-150 rounded-sm mx-1"
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <button
              onClick={() => signOut()}
              className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm text-muted hover:text-foreground hover:bg-white/60 transition-colors duration-150 rounded-sm mx-1"
            >
              Logout
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );

  return (
    <div className="flex flex-1 bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-[#F5F3F0] border-r border-border sticky top-0 lg:top-16 self-start h-[100dvh]">
        {navContent}
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile drawer. aria-hidden when closed so screen readers
          don't see the duplicate nav (the desktop sidebar above is
          always present in the DOM and exposes the same links).
          Without this, AT users hear every portal nav item twice
          and the QA report shows the duplicate <aside> in the
          accessibility tree. */}
      <aside
        className={`lg:hidden fixed top-14 left-0 bottom-0 z-50 w-64 bg-[#F5F3F0] border-r border-border transform transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!sidebarOpen}
      >
        {navContent}
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Mobile top bar with hamburger */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background sticky top-14 z-10">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 -ml-1.5 text-foreground/70 hover:text-foreground transition-colors"
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-medium text-foreground">Venue Portal</span>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-6 lg:pb-8">{children}</div>
      </div>
    </div>
  );
}
