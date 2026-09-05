"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { fetchArtistProfileShared } from "@/lib/artist-profile-source";
import { loginPathWithNext } from "@/lib/login-redirect";
import LoadErrorState from "./LoadErrorState";
import {
  artistPortalNav,
  activeGroupFor,
  navGroupKey,
  navItemOwnsPath,
  navPageFor,
  sectionTabsFor,
  type PortalNavItem,
} from "@/lib/portal-nav";
import PortalSectionTabs from "./PortalSectionTabs";

// H6: the nav lists moved to src/lib/portal-nav.ts. The header's portal
// dropdown kept a second hand-written copy of them and had silently drifted
// (it was missing Enquiries, My Offers, Social Posts and Blogs). Both read the
// same module now. Ordering, grouping and the reasoning behind each entry live
// there.
const NAV = artistPortalNav();
const { primary: navItems, secondary: secondaryItems } = NAV;

// Every page reads as "<Section> | Artist Portal | Wallplace" instead of
// inheriting the default "Wallplace | Curated Art for Commercial Spaces".
// navPageFor resolves the dynamic sub-routes (orders/[id]) by prefix, since
// those pages reuse this layout with the parent activePath, and names a
// grouped page by its own label ("Orders", "My Portfolio"), never by its group.
function titleFor(activePath: string): string {
  return navPageFor(NAV, activePath)?.label ?? "Artist Portal";
}

const ROW_BASE = "text-sm rounded-sm transition-colors duration-150";
const ROW_ACTIVE = "text-accent font-medium bg-accent/8";
const ROW_IDLE = "text-foreground/70 hover:text-foreground hover:bg-white/60";

function rowClass(active: boolean): string {
  return `${ROW_BASE} ${active ? ROW_ACTIVE : ROW_IDLE}`;
}

// A group remembers whether it is expanded under this prefix, one key per
// group. Every read and write is wrapped: the accessor itself throws where
// site data is blocked (some private windows, some embedded contexts), and
// setItem throws when the quota is full. Collapsed is the answer in every
// failure case.
const STORAGE_PREFIX = "wallplace.artistNav.";

function readStoredExpanded(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function writeStoredExpanded(key: string, expanded: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, expanded ? "1" : "0");
  } catch {
    // Nothing to do: the state still holds for this visit.
  }
}

interface SidebarGroupProps {
  group: PortalNavItem;
  activePath: string;
  onNavigate: () => void;
}

// One sidebar group: a row whose label navigates to the first child and whose
// chevron shows or hides the child list. The group holding the active route is
// always expanded, so its chevron is disabled rather than left looking like it
// does something. Every other group starts collapsed and remembers its state
// in localStorage. Defined at module level so React keeps one component
// identity across the layout's renders (react-hooks/static-components).
function SidebarGroup({ group, activePath, onNavigate }: SidebarGroupProps) {
  const key = navGroupKey(group);
  const children = group.children ?? [];
  const isActive = children.some((child) => navItemOwnsPath(child, activePath));
  // Read once, in the initialiser rather than an effect. The sidebar is never
  // server-rendered (the layout shows its loader until the client knows who is
  // signed in), so the stored value can safely be the first rendered value.
  const [storedExpanded, setStoredExpanded] = useState(() => readStoredExpanded(key));
  const expanded = isActive || storedExpanded;
  const listId = `artist-nav-group-${key}`;

  function toggle() {
    const next = !expanded;
    setStoredExpanded(next);
    writeStoredExpanded(key, next);
  }

  return (
    <li>
      <div className={`flex items-center ${rowClass(isActive)}`}>
        <Link href={group.href} onClick={onNavigate} className="flex-1 min-w-0 truncate py-2 pl-3 pr-1">
          {group.label}
        </Link>
        <button
          type="button"
          onClick={toggle}
          disabled={isActive}
          aria-expanded={expanded}
          aria-controls={listId}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${group.label}`}
          className="shrink-0 p-2 mr-0.5 rounded-sm text-current disabled:cursor-default"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {/* Always in the DOM so aria-controls has something to point at, hidden
          when collapsed. No display class on the list, or it would override
          the [hidden] rule. */}
      <ul id={listId} hidden={!expanded} className="mt-0.5 space-y-0.5">
        {children.map((child) => (
          <li key={child.href}>
            <Link
              href={child.href}
              onClick={onNavigate}
              className={`block py-1.5 pl-7 pr-3 ${rowClass(navItemOwnsPath(child, activePath))}`}
            >
              {child.label}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}

interface ArtistPortalLayoutProps {
  children: React.ReactNode;
  /**
   * Optional override for the active route. The chrome is rendered once by
   * artist-portal/layout.tsx, which passes nothing and lets the layout read
   * the path itself; the prop is kept so tests can render a given route
   * directly. Same shape VenuePortalLayout already used.
   */
  activePath?: string;
}

export default function ArtistPortalLayout({
  children,
  activePath: activePathProp,
}: ArtistPortalLayoutProps) {
  const pathname = usePathname();
  const activePath = activePathProp ?? pathname ?? "/artist-portal";
  const router = useRouter();
  const { user, loading, userType, displayName, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  // Tracks the artist_profiles existence check. We can't render the
  // portal until we know whether to keep them here or bounce them to
  // /apply — otherwise newly-signed-up artists with no profile row see
  // the portal chrome flash before the redirect kicks in.
  // LA-C046: "failed" is a check that could not complete (500, network), which
  // is not the same as "missing" and must not send an approved artist to /apply.
  const [profileCheck, setProfileCheck] = useState<"loading" | "missing" | "present" | "failed">("loading");
  const [profileCheckKey, setProfileCheckKey] = useState(0);

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
    if (loading) return;
    if (!user) {
      // LA-C004: a signed-out visitor keeps the deep link they arrived on.
      router.replace(loginPathWithNext(window.location.pathname, window.location.search));
      return;
    }
    if (userType !== "artist") {
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
    // Shared with PortalGuard and the page's own useCurrentArtist: one request
    // for all three on the portal's first load, rather than three identical
    // ones each carrying every artist_works row. This caller reads the avatar
    // and whether a row exists, so it asks for the profile alone; it still
    // joins a works request that is already out.
    fetchArtistProfileShared(user.id, { withWorks: false })
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
        if (!data.profile) {
          setProfileCheck("missing");
          router.replace("/apply");
          return;
        }
        if (data.profile.profile_image) setProfileImage(data.profile.profile_image);
        setProfileCheck("present");
      })
      .catch(() => {
        // LA-C046: a failed check is not evidence of a missing profile. The
        // old code redirected to /apply here, which sent approved artists to
        // the application form on any transient failure. Show the failure
        // and let them retry instead.
        if (cancelled) return;
        setProfileCheck("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user, userType, router, profileCheckKey]);

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

  if (user && userType === "artist" && profileCheck === "failed") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <LoadErrorState
            message="Could not load your profile. Please try again."
            onRetry={() => {
              setProfileCheck("loading");
              setProfileCheckKey((k) => k + 1);
            }}
          />
        </div>
      </div>
    );
  }

  if (!user || userType !== "artist" || profileCheck !== "present") return null;

  const closeSidebar = () => setSidebarOpen(false);
  // A grouped page (anything under My Portfolio, Venues & Buyers or Social)
  // carries its siblings as a tab strip above the page; a standalone page
  // carries nothing.
  const activeGroup = activeGroupFor(NAV, activePath);
  const sectionTabs = sectionTabsFor(NAV, activePath);

  return (
    <div className="bg-background flex flex-1">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={closeSidebar}
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
        <nav aria-label="Artist portal" className="flex-1 py-4 overflow-y-auto min-h-0">
          <ul className="space-y-0.5 px-2">
            {navItems.map((item) =>
              item.children ? (
                <SidebarGroup key={item.href} group={item} activePath={activePath} onNavigate={closeSidebar} />
              ) : (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={closeSidebar}
                    className={`block py-2 px-3 ${rowClass(navItemOwnsPath(item, activePath))}`}
                  >
                    {item.label}
                  </Link>
                </li>
              ),
            )}
          </ul>

          <div className="my-4 mx-4 border-t border-border" />

          <ul className="space-y-0.5 px-2">
            {secondaryItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={closeSidebar}
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
          {activeGroup && (
            <PortalSectionTabs tabs={sectionTabs} activePath={activePath} label={activeGroup.label} />
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
