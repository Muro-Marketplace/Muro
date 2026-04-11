"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { label: "Dashboard", href: "/artist-portal" },
  { label: "Messages", href: "/artist-portal/messages" },
  { label: "Edit Profile", href: "/artist-portal/profile" },
  { label: "My Portfolio", href: "/artist-portal/portfolio" },
  { label: "Collections", href: "/artist-portal/collections" },
  { label: "QR Labels", href: "/artist-portal/labels" },
  { label: "Placements", href: "/artist-portal/placements" },
  { label: "Orders", href: "/artist-portal/orders" },
  { label: "Analytics", href: "/artist-portal/analytics" },
  { label: "Billing", href: "/artist-portal/billing" },
  { label: "Settings", href: "/artist-portal/settings" },
];

const secondaryItems = [
  { label: "Browse Site", href: "/" },
];

interface ArtistPortalLayoutProps {
  children: React.ReactNode;
  activePath: string;
}

export default function ArtistPortalLayout({
  children,
  activePath,
}: ArtistPortalLayoutProps) {
  const router = useRouter();
  const { user, loading, userType, displayName, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || userType !== "artist")) {
      router.replace("/login");
    }
  }, [loading, user, userType, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    );
  }

  if (!user || userType !== "artist") return null;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-14 lg:top-16 left-0 h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-4rem)]
          w-56 bg-[#F5F3F0] border-r border-border z-30
          flex flex-col
          transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-0.5 px-2">
            {navItems.map((item) => {
              const isActive = activePath === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      block text-sm py-2 px-3 rounded-sm transition-colors duration-150
                      ${
                        isActive
                          ? "text-accent font-medium bg-accent/8"
                          : "text-foreground/70 hover:text-foreground hover:bg-white/60"
                      }
                    `}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-4 mx-4 border-t border-border" />

          <ul className="space-y-0.5 px-2">
            {secondaryItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className="block text-sm py-2 px-3 rounded-sm text-muted hover:text-foreground hover:bg-white/60 transition-colors duration-150"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <button
                onClick={() => signOut()}
                className="w-full text-left text-sm py-2 px-3 rounded-sm text-muted hover:text-foreground hover:bg-white/60 transition-colors duration-150"
              >
                Logout
              </button>
            </li>
          </ul>
        </nav>

        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-medium">
              {displayName?.charAt(0)?.toUpperCase() || "A"}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground leading-tight">{displayName || "Artist"}</p>
              <p className="text-xs text-muted">Artist</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 lg:ml-56 min-w-0 mt-14 lg:mt-16">
        {/* Mobile header bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-border sticky top-14 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-sm hover:bg-background transition-colors"
            aria-label="Open navigation"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <span className="text-sm font-medium text-foreground">Artist Portal</span>
        </div>

        <main className="p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
