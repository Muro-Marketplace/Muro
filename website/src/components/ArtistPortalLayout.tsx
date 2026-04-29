"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

// Nav order: Dashboard → Profile / Portfolio → Messages → Placements → rest.
// (See plan item #8, Profile first, then Messages, then Placements.)
//
// Settings used to live alongside the rest in the primary list with
// "Browse Site" relegated to a secondary section. Browse-Site was
// noise: every artist already has the global header link to leave
// the portal, so a duplicate sidebar entry served no purpose. We
// dropped it and moved Settings into the secondary slot so it sits
// under a divider, visually separated from the main workflow links
//, matches the pattern used in venue-portal.
const navItems = [
  { label: "Dashboard", href: "/artist-portal" },
  { label: "Edit Profile", href: "/artist-portal/profile" },
  { label: "My Portfolio", href: "/artist-portal/portfolio" },
  { label: "Showroom", href: "/artist-portal/showroom" },
  { label: "Messages", href: "/artist-portal/messages" },
  { label: "Placements", href: "/artist-portal/placements" },
  { label: "Collections", href: "/artist-portal/collections" },
  { label: "Saved", href: "/artist-portal/saved" },
  { label: "Orders", href: "/artist-portal/orders" },
  { label: "QR Labels", href: "/artist-portal/labels" },
  { label: "Analytics", href: "/artist-portal/analytics" },
  { label: "Billing", href: "/artist-portal/billing" },
];

const secondaryItems = [
  { label: "Settings", href: "/artist-portal/settings" },
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
  const [profileImage, setProfileImage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || userType !== "artist")) {
      router.replace("/login");
    }
  }, [loading, user, userType, router]);

  useEffect(() => {
    if (user && userType === "artist") {
      authFetch("/api/artist-profile")
        .then((r) => r.json())
        .then((data) => {
          if (data.profile?.profile_image) setProfileImage(data.profile.profile_image);
        })
        .catch(() => {});
    }
  }, [user, userType]);

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

  if (!user || userType !== "artist") return null;

  return (
    <div className="bg-background flex flex-1">
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
          fixed top-14 lg:top-16 left-0 bottom-0
          w-56 bg-[#F5F3F0] border-r border-border z-30
          flex flex-col
          transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <nav className="flex-1 py-4 overflow-y-auto min-h-0">
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

          <div className="mx-4 my-3 border-t border-border" />

          <div className="px-3 pb-2">
            <div className="flex items-center gap-3">
              {profileImage ? (
                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                  <Image src={profileImage} alt={displayName || "Artist"} width={32} height={32} className="object-cover w-full h-full" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-medium shrink-0">
                  {displayName?.charAt(0)?.toUpperCase() || "A"}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground leading-tight truncate">{displayName || "Artist"}</p>
                <p className="text-xs text-muted">Artist</p>
              </div>
            </div>
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 lg:ml-56 min-w-0">
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
          <span className="text-sm font-medium text-foreground">Artist Portal</span>
        </div>

        <main className="px-4 sm:px-6 lg:px-8 pt-4 pb-6 lg:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
