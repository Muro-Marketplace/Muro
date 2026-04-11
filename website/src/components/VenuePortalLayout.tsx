"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { label: "Dashboard", href: "/venue-portal" },
  { label: "Placements", href: "/venue-portal/placements" },
  { label: "Messages", href: "/venue-portal/messages" },
  { label: "Browse Portfolios", href: "/browse" },
  { label: "Saved Artists", href: "/venue-portal/saved" },
  { label: "My Orders", href: "/venue-portal/orders" },
  { label: "Venue Profile", href: "/venue-portal/profile" },
  { label: "Premium Tools", href: "/venue-portal/premium" },
  { label: "Settings", href: "/venue-portal/settings" },
];

const bottomItems = [
  { label: "Browse Site", href: "/" },
];

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    );
  }

  if (!user || userType !== "venue") return null;

  function isActive(href: string) {
    if (href === "/venue-portal") return pathname === "/venue-portal";
    return pathname === href;
  }

  const NavContent = () => (
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
    <div className="flex min-h-[calc(100vh-3.5rem)] lg:min-h-[calc(100vh-4rem)] bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-[#F5F3F0] border-r border-border sticky top-14 lg:top-16 self-start h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-4rem)]">
        <NavContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`lg:hidden fixed top-14 left-0 bottom-0 z-50 w-64 bg-[#F5F3F0] border-r border-border transform transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <NavContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-6 lg:pb-8">{children}</div>
      </div>
    </div>
  );
}
