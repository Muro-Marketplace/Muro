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
  { label: "My Offers", href: "/artist-portal/offers" },
  { label: "Artwork Requests", href: "/artist-portal/artwork-requests" },
  { label: "Collections", href: "/artist-portal/collections" },
  { label: "Saved", href: "/artist-portal/saved" },
  { label: "Orders", href: "/artist-portal/orders" },
  { label: "QR Labels", href: "/artist-portal/labels" },
  { label: "Social Posts", href: "/artist-portal/posts" },
  { label: "Analytics", href: "/artist-portal/analytics" },
  { label: "Billing", href: "/artist-portal/billing" },
];

const secondaryItems = [
  { label: "Settings", href: "/artist-portal/settings" },
];

// All navigable artist-portal pages: used for the document.title sync
// below so every page reads as "<Section> | Artist Portal | Wallplace"
// instead of inheriting the default "Wallplace | Curated Art for
// Commercial Spaces". Includes the dynamic sub-routes (showroom/[id],
// orders/[id]) by suffix, since those pages reuse this layout with the
// parent activePath.
const allNav = [...navItems, ...secondaryItems];

function titleFor(activePath: string): string {
  // Strip query strings / trailing slashes before matching.
  const cleanPath = activePath.replace(/[?#].*$/, "").replace(/\/$/, "") || "/";
  // Exact match first.
  const exact = allNav.find((n) => n.href === cleanPath);
  if (exact) return exact.label;
  // Sub-route match: longest matching prefix wins ("/artist-portal/orders/123"
  // → "Orders").
  const sorted = [...allNav].sort((a, b) => b.href.length - a.href.length);
  const prefix = sorted.find(
    (n) => n.href !== "/artist-portal" && cleanPath.startsWith(`${n.href}/`),
  );
  if (prefix) return prefix.label;
  return "Artist Portal";
}

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
  // Tracks the artist_profiles existence check. We can't render the
  // portal until we know whether to keep them here or bounce them to
  // /apply — otherwise newly-signed-up artists with no profile row see
  // the portal chrome flash before the redirect kicks in.
  const [profileCheck, setProfileCheck] = useState<"loading" | "missing" | "present">("loading");

  // Sync the tab title to the current portal page. The parent route's
  // metadata template is a server-rendered concept, but every portal
  // page is a client component, so we patch document.title from here.
  // QA flagged every portal page reading the same generic site title,
  // which made the bookmark/tab story useless for portal users.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const section = titleFor(activePath);
    document.title = `${section} | Artist Portal | Wallplace`;
  }, [activePath]);

  useEffect(() => {
    if (!loading && (!user || userType !== "artist")) {
      router.replace("/login");
    }
  }, [loading, user, userType, router]);

  useEffect(() => {
    if (loading) return;
    if (!user || userType !== "artist") {
      // Auth-fail branch is handled by the other effect (router.replace
      // to /login). Keep the check in a single state so we don't render
      // portal chrome during the redirect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfileCheck("missing");
      return;
    }
    let cancelled = false;
    setProfileCheck("loading");
    authFetch("/api/artist-profile")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        // Brand-new artist accounts (signed up, never approved /
        // never filled in the application) land here with no
        // artist_profile row. The portal pages all rely on that row
        // existing — billing throws "Artist profile not found" on
        // /api/subscribe, profile page sits on "Loading…" forever.
        // Send them through /apply instead so they can complete the
        // application. Once an admin approves it the profile row is
        // created and this guard naturally lets them in.
        if (!data?.profile) {
          setProfileCheck("missing");
          router.replace("/apply");
          return;
        }
        if (data.profile.profile_image) setProfileImage(data.profile.profile_image);
        setProfileCheck("present");
      })
      .catch(() => {
        // Treat a failed check as missing so we don't render the portal
        // for an account that may not actually have a profile. The
        // /apply redirect is the safe default; if the network was just
        // flaky, the user can retry from there.
        if (cancelled) return;
        setProfileCheck("missing");
        router.replace("/apply");
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user, userType, router]);

  // Keep the loading screen visible until BOTH the auth check and the
  // artist_profile existence check resolve. Without this guard, the
  // portal chrome (sidebar + dashboard tiles) renders for ~500ms while
  // the profile check is in flight, then the user is bounced to /apply
  // — that flash is exactly what the previous fix introduced.
  if (loading || profileCheck === "loading") {
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

  if (!user || userType !== "artist" || profileCheck !== "present") return null;

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
