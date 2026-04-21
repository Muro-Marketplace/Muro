"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CartIndicator from "./CartIndicator";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

// When the user is inside the marketplace area (/browse or /spaces-looking-for-art)
// the top-level "Marketplace" link is replaced by these inline tabs.
const marketplaceTabs = [
  { label: "Portfolios", href: "/browse?view=portfolios", match: (p: string, v: string) => p === "/browse" && v !== "gallery" && v !== "collections" },
  { label: "Galleries",  href: "/browse?view=gallery",    match: (p: string, v: string) => p === "/browse" && v === "gallery" },
  { label: "Collections", href: "/browse?view=collections", match: (p: string, v: string) => p === "/browse" && v === "collections" },
  { label: "Spaces", href: "/spaces-looking-for-art", match: (p: string) => p === "/spaces-looking-for-art" },
];

type NavLink = { label: string; href: string; subLinks?: { label: string; href: string; description?: string }[] };

const publicNavLinks: NavLink[] = [
  { label: "Marketplace", href: "/browse" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Blog", href: "/blog" },
  { label: "Spaces", href: "/spaces-looking-for-art" },
  { label: "Waitlist", href: "/waitlist" },
];

const loggedInNavLinks: NavLink[] = [
  { label: "Marketplace", href: "/browse" },
  { label: "Spaces", href: "/spaces-looking-for-art" },
];

const venueNavLinks: NavLink[] = [
  { label: "Marketplace", href: "/browse" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Blog", href: "/blog" },
];

const moreLinks = [
  { label: "How It Works", href: "/how-it-works" },
  { label: "Blog", href: "/blog" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "FAQs", href: "/faqs" },
  { label: "Pricing", href: "/pricing" },
];

const immersiveRoutes = ["/venues", "/artists", "/about", "/how-it-works"];

// Marketplace tabs pulled into their own component so the useSearchParams call
// is isolated behind a <Suspense> boundary. Without that, every page that
// renders the shared Header would be forced into dynamic rendering, which
// breaks the static prerender for pages like /admin/applications.
function MarketplaceTabsNav({ pathname, isPortal, showSolid }: { pathname: string; isPortal: boolean; showSolid: boolean }) {
  const searchParams = useSearchParams();
  const view = searchParams?.get("view") || "";
  const onDark = isPortal || !showSolid;
  return (
    <>
      {marketplaceTabs.map((tab) => {
        const active = tab.match(pathname, view);
        const cls = active
          ? (onDark ? "text-white font-semibold border-b-2 border-white" : "text-foreground font-semibold border-b-2 border-accent")
          : (onDark ? "text-white/70 hover:text-white" : "text-muted hover:text-foreground");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`text-sm transition-colors duration-300 py-1 ${cls}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </>
  );
}

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const isImmersive = immersiveRoutes.includes(pathname);
  const { user, userType, displayName, signOut, loading: authLoading } = useAuth();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [msgDropdownOpen, setMsgDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [conversations, setConversations] = useState<{ conversationId: string; otherPartyDisplayName: string; otherPartyImage: string | null; otherParty: string; latestMessage: string; unreadCount: number; lastActivity: string }[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; type: string; title: string; description: string; time: string; link: string }[]>([]);
  const msgDropdownRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const moreDropdownRef = useRef<HTMLDivElement>(null);
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false);
  const [marketplaceDropdownOpen, setMarketplaceDropdownOpen] = useState(false);
  const marketplaceDropdownRef = useRef<HTMLDivElement>(null);

  const isMarketplaceArea = pathname.startsWith("/browse") || pathname === "/spaces-looking-for-art";

  const portalBase = userType === "venue" ? "/venue-portal" : userType === "customer" ? "/customer-portal" : "/artist-portal";
  const [resolvedSlug, setResolvedSlug] = useState("");

  // Fetch unread message count when logged in
  const fetchUnread = useCallback(() => {
    if (!user) return;
    authFetch("/api/messages/unread")
      .then((r) => r.json())
      .then((data) => setUnreadCount(data.count || 0))
      .catch(() => {});
  }, [user]);

  // Fetch unread notification count (mirror messages pattern — on mount + poll)
  const fetchUnreadNotifs = useCallback(() => {
    if (!user) return;
    authFetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => setUnreadNotifCount(data.unreadCount || 0))
      .catch(() => setUnreadNotifCount(0));
  }, [user]);

  useEffect(() => {
    fetchUnread();
    fetchUnreadNotifs();
    // Poll every 60 seconds
    const interval = setInterval(() => { fetchUnread(); fetchUnreadNotifs(); }, 60000);
    return () => clearInterval(interval);
  }, [fetchUnread, fetchUnreadNotifs]);

  // Refresh unread count when notification dropdown closes (user likely saw them)
  useEffect(() => {
    if (!notifDropdownOpen && user) fetchUnreadNotifs();
  }, [notifDropdownOpen, user, fetchUnreadNotifs]);

  useEffect(() => {
    if (!isImmersive) return;
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isImmersive]);

  // Resolve the user's actual slug from their profile (try both endpoints)
  useEffect(() => {
    if (!user) { setResolvedSlug(""); return; }
    async function resolve() {
      // Try the expected endpoint first
      const primary = userType === "venue" ? "/api/venue-profile" : "/api/artist-profile";
      try {
        const res = await authFetch(primary);
        const data = await res.json();
        if (data.profile?.slug) { setResolvedSlug(data.profile.slug); return; }
      } catch { /* continue */ }
      // Fallback: try the other endpoint
      const fallback = userType === "venue" ? "/api/artist-profile" : "/api/venue-profile";
      try {
        const res = await authFetch(fallback);
        const data = await res.json();
        if (data.profile?.slug) { setResolvedSlug(data.profile.slug); return; }
      } catch { /* give up */ }
    }
    resolve();
  }, [user, userType]);

  // Load conversations when dropdown opens (also retries when slug resolves)
  useEffect(() => {
    if (!msgDropdownOpen || !user || !resolvedSlug) return;
    authFetch(`/api/messages?slug=${resolvedSlug}`)
      .then((r) => r.json())
      .then((data) => { if (data.conversations) setConversations(data.conversations.slice(0, 6)); })
      .catch(() => {});
  }, [msgDropdownOpen, user, resolvedSlug]);

  // Refresh unread count when message dropdown closes (user likely read messages)
  useEffect(() => {
    if (!msgDropdownOpen && user) fetchUnread();
  }, [msgDropdownOpen, user, fetchUnread]);

  // Load notifications from the persistent notifications table, with a fallback
  // to derived placements/messages data for environments where the table
  // does not yet exist or has no rows.
  useEffect(() => {
    if (!notifDropdownOpen || !user) return;
    async function loadNotifs() {
      try {
        const res = await authFetch("/api/notifications");
        const data = await res.json();
        const rows = Array.isArray(data.notifications) ? data.notifications : [];
        if (rows.length > 0) {
          setNotifications(rows.slice(0, 12));
          return;
        }
      } catch { /* fall through to derived */ }

      if (!resolvedSlug) return;
      const notifs: typeof notifications = [];
      try {
        const placementsRes = await authFetch("/api/placements");
        const placementsData = await placementsRes.json();
        for (const p of (placementsData.placements || []).slice(0, 10)) {
          if (p.status === "pending") {
            notifs.push({ id: p.id, type: "placement", title: "Placement Request", description: `${p.work_title || "Artwork"} — ${p.venue || p.artist_slug || ""}`, time: p.created_at, link: `${portalBase}/placements` });
          } else if (p.status === "active" && p.responded_at) {
            notifs.push({ id: p.id + "-a", type: "placement_accepted", title: "Placement Accepted", description: `${p.work_title || "Artwork"} — ${p.venue || p.artist_slug || ""}`, time: p.responded_at, link: `${portalBase}/placements` });
          } else if (p.status === "declined" && p.responded_at) {
            notifs.push({ id: p.id + "-d", type: "placement_declined", title: "Placement Declined", description: `${p.work_title || "Artwork"} — ${p.venue || p.artist_slug || ""}`, time: p.responded_at, link: `${portalBase}/placements` });
          }
        }
        const msgsRes = await authFetch(`/api/messages?slug=${resolvedSlug}`);
        const msgsData = await msgsRes.json();
        for (const c of (msgsData.conversations || []).slice(0, 5)) {
          if (c.unreadCount > 0) {
            notifs.push({ id: "msg-" + c.conversationId, type: "message", title: "New Message", description: `${c.otherPartyDisplayName || c.otherParty}: ${c.latestMessage}`.slice(0, 80), time: c.lastActivity, link: `${portalBase}/messages` });
          }
        }
      } catch { /* empty */ }
      notifs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setNotifications(notifs.slice(0, 12));
    }
    loadNotifs();
  }, [notifDropdownOpen, user, resolvedSlug, portalBase]);

  // Close dropdowns on click outside
  useEffect(() => {
    if (!msgDropdownOpen && !notifDropdownOpen && !moreDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (msgDropdownOpen && msgDropdownRef.current && !msgDropdownRef.current.contains(e.target as Node)) {
        setMsgDropdownOpen(false);
      }
      if (notifDropdownOpen && notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setNotifDropdownOpen(false);
      }
      if (moreDropdownOpen && moreDropdownRef.current && !moreDropdownRef.current.contains(e.target as Node)) {
        setMoreDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [msgDropdownOpen, notifDropdownOpen, moreDropdownOpen]);

  // Close dropdowns on route change
  useEffect(() => { setMsgDropdownOpen(false); setNotifDropdownOpen(false); setMoreDropdownOpen(false); }, [pathname]);

  const isPortal = pathname.startsWith("/artist-portal") || pathname.startsWith("/venue-portal") || pathname.startsWith("/customer-portal");
  const isBrowsePage = pathname === "/browse";
  const isSpacesPage = pathname === "/spaces-looking-for-art";
  const showSolid = !isImmersive || scrolled;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${
        isPortal
          ? "bg-[#1A1A1A]"
          : showSolid
          ? "bg-white border-b border-border"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="flex items-center justify-between h-14 lg:h-16">
          {/* Logo */}
          <Link
            href="/"
            className={`font-serif text-2xl lg:text-3xl tracking-tight transition-colors duration-300 ${
              isPortal || !showSolid ? "text-white" : "text-foreground"
            }`}
          >
            Wallplace
          </Link>

          {/* Desktop Navigation — centered on page */}
          <nav className="hidden lg:flex items-center gap-7 absolute left-1/2 -translate-x-1/2" role="navigation" aria-label="Main navigation">
            {isMarketplaceArea ? (
              // F47 — marketplace tabs replace the normal nav while inside /browse or /spaces-looking-for-art
              <Suspense fallback={null}>
                <MarketplaceTabsNav pathname={pathname} isPortal={isPortal} showSolid={showSolid} />
              </Suspense>
            ) : (
            (user ? (userType === "venue" ? venueNavLinks : loggedInNavLinks) : publicNavLinks).map((link) => {
              const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
              const activeClass = isActive
                ? (isPortal || !showSolid ? "text-white font-semibold" : "text-foreground font-semibold")
                : (isPortal || !showSolid ? "text-white/70 hover:text-white" : "text-muted hover:text-foreground");

              if (link.subLinks && link.subLinks.length > 0) {
                const isMarketplace = link.href === "/browse";
                return (
                  <div
                    key={link.href}
                    ref={isMarketplace ? marketplaceDropdownRef : null}
                    className="relative"
                    onMouseEnter={() => isMarketplace && setMarketplaceDropdownOpen(true)}
                    onMouseLeave={() => isMarketplace && setMarketplaceDropdownOpen(false)}
                  >
                    <Link
                      href={link.href}
                      onClick={() => isMarketplace && setMarketplaceDropdownOpen(false)}
                      className={`text-sm transition-colors duration-300 flex items-center gap-1 ${activeClass}`}
                    >
                      {link.label}
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`transition-transform duration-200 ${marketplaceDropdownOpen && isMarketplace ? "rotate-180" : ""}`}>
                        <polyline points="2 4 6 8 10 4" />
                      </svg>
                    </Link>
                    {isMarketplace && marketplaceDropdownOpen && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50">
                        <div className="w-64 bg-white border border-border rounded-sm shadow-lg py-2">
                          {link.subLinks.map((sub) => (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={() => setMarketplaceDropdownOpen(false)}
                              className="block px-4 py-2 hover:bg-surface transition-colors"
                            >
                              <p className="text-sm text-foreground">{sub.label}</p>
                              {sub.description && (
                                <p className="text-[11px] text-muted mt-0.5">{sub.description}</p>
                              )}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm transition-colors duration-300 ${activeClass}`}
                >
                  {link.label}
                </Link>
              );
            })
            )}
            {/* More dropdown — logged in only */}
            {user && !isMarketplaceArea && (
              <div className="relative" ref={moreDropdownRef}>
                <button
                  onClick={() => { setMoreDropdownOpen(!moreDropdownOpen); setMsgDropdownOpen(false); setNotifDropdownOpen(false); }}
                  className={`text-sm transition-colors duration-300 flex items-center gap-1 ${
                    isPortal || !showSolid
                      ? "text-white/80 hover:text-white"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  More
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`transition-transform duration-200 ${moreDropdownOpen ? "rotate-180" : ""}`}>
                    <polyline points="2 4 6 8 10 4" />
                  </svg>
                </button>
                {moreDropdownOpen && (
                  <div className="absolute top-full mt-2 right-0 w-48 bg-white border border-border rounded-sm shadow-lg py-2 z-50">
                    {moreLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="block px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-surface transition-colors"
                        onClick={() => setMoreDropdownOpen(false)}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-2.5">
            {user ? (
              <>
                {/* Messages dropdown */}
                <div className="relative" ref={msgDropdownRef}>
                  <button
                    onClick={() => { setMsgDropdownOpen(!msgDropdownOpen); setNotifDropdownOpen(false); }}
                    className={`relative p-2 transition-colors duration-300 ${
                      isPortal || !showSolid ? "text-white/70 hover:text-white" : "text-muted hover:text-foreground"
                    }`}
                    title="Messages"
                    aria-label="Messages"
                    aria-expanded={msgDropdownOpen}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-bold text-white bg-accent rounded-full leading-none">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Dropdown panel */}
                  {msgDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-border rounded-sm shadow-lg overflow-hidden z-[110]">
                      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">Messages</p>
                        <Link href={`${portalBase}/messages`} onClick={() => setMsgDropdownOpen(false)} className="text-xs text-accent hover:text-accent-hover">View All</Link>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {conversations.length === 0 ? (
                          <p className="text-xs text-muted text-center py-8">No messages yet</p>
                        ) : (
                          conversations.map((conv) => (
                            <button
                              key={conv.conversationId}
                              onClick={() => {
                                setMsgDropdownOpen(false);
                                router.push(`${portalBase}/messages?artist=${conv.otherParty}&artistName=${encodeURIComponent(conv.otherPartyDisplayName)}`);
                              }}
                              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[#FAF8F5] transition-colors border-b border-border last:border-b-0"
                            >
                              {conv.otherPartyImage ? (
                                <img src={conv.otherPartyImage} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                                  <span className="text-xs font-medium text-accent">{conv.otherPartyDisplayName?.charAt(0)?.toUpperCase()}</span>
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium text-foreground truncate">{conv.otherPartyDisplayName}</p>
                                  {conv.unreadCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                                </div>
                                <p className="text-xs text-muted truncate">{conv.latestMessage}</p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                      <div className="px-4 py-2.5 border-t border-border bg-[#FAF8F5]">
                        <Link href={`${portalBase}/messages`} onClick={() => setMsgDropdownOpen(false)} className="block text-center text-xs font-medium text-accent hover:text-accent-hover">
                          Open Full Inbox
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notifications dropdown */}
                <div className="relative" ref={notifDropdownRef}>
                  <button
                    onClick={() => { setNotifDropdownOpen(!notifDropdownOpen); setMsgDropdownOpen(false); }}
                    className={`relative p-2 transition-colors duration-300 ${
                      isPortal || !showSolid ? "text-white/70 hover:text-white" : "text-muted hover:text-foreground"
                    }`}
                    title="Notifications"
                    aria-label="Notifications"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    {unreadNotifCount > 0 && notifDropdownOpen === false && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-bold text-white bg-accent rounded-full leading-none">
                        {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                      </span>
                    )}
                  </button>

                  {notifDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-border rounded-sm shadow-lg overflow-hidden z-[110]">
                      <div className="px-4 py-3 border-b border-border">
                        <p className="text-sm font-medium text-foreground">Notifications</p>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="py-8 text-center">
                            <p className="text-xs text-muted">No new notifications</p>
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <Link
                              key={n.id}
                              href={n.link || "#"}
                              onClick={() => {
                                setNotifDropdownOpen(false);
                                // Mark as read in the background — ignore errors (e.g. derived items)
                                if (n.id && !n.id.startsWith("msg-")) {
                                  authFetch("/api/notifications", {
                                    method: "PATCH",
                                    body: JSON.stringify({ id: n.id }),
                                  }).catch(() => {});
                                }
                              }}
                              className="block px-4 py-3 hover:bg-[#FAF8F5] transition-colors border-b border-border last:border-b-0"
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                  n.type === "placement" ? "bg-amber-100" : n.type === "placement_declined" ? "bg-red-100" : n.type === "message" ? "bg-accent/10" : "bg-green-100"
                                }`}>
                                  {n.type === "placement" ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                                  ) : n.type === "placement_declined" ? (
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                                  ) : n.type === "message" ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                  ) : (
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#15803D" strokeWidth="2" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                                  <p className="text-xs text-muted truncate">{n.description}</p>
                                  <p className="text-[10px] text-muted mt-0.5">{new Date(n.time).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                                </div>
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Portal link */}
                <Link
                  href={portalBase}
                  className={`text-sm px-3 py-2 transition-colors duration-300 ${
                    isPortal || !showSolid ? "text-white/90 hover:text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  {userType === "venue" ? "Venue Portal" : userType === "customer" ? "My Account" : "Artist Portal"}
                </Link>
                <button
                  onClick={() => signOut()}
                  className={`text-sm transition-colors duration-300 ${
                    isPortal || !showSolid ? "text-white/90 hover:text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  Logout
                </button>
              </>
            ) : !authLoading && !user ? (
              <>
                <Link
                  href="/login"
                  className={`text-sm px-4 py-2 transition-colors duration-300 ${
                    isPortal || !showSolid ? "text-white/90 hover:text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className={`text-sm px-4 py-2 rounded-sm transition-colors duration-300 ${
                    isPortal || !showSolid ? "bg-white/10 text-white hover:bg-white/20" : "bg-accent text-white hover:bg-accent-hover"
                  }`}
                >
                  Sign Up
                </Link>
              </>
            ) : null}
            <CartIndicator className={isPortal || !showSolid ? "text-white" : "text-foreground"} />
          </div>

          {/* Mobile Menu Toggle */}
          <div className="lg:hidden flex items-center">
            <button
              type="button"
              className={`p-2 -mr-2 transition-colors duration-300 ${
                isPortal || !showSolid ? "text-white" : "text-foreground"
              }`}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
            >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              {mobileMenuOpen ? (
                <>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </>
              ) : (
                <>
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </>
              )}
            </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <>
        <div className="lg:hidden fixed inset-0 bg-black/20 z-40" onClick={() => setMobileMenuOpen(false)} />
        <div className="lg:hidden border-t border-border bg-white relative z-50">
          <div className="mx-auto max-w-[1400px] px-6 py-6 space-y-6">
            {/* Primary nav links */}
            <nav className="flex flex-col gap-4">
              {(user ? (userType === "venue" ? venueNavLinks : loggedInNavLinks) : publicNavLinks).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-base text-foreground font-medium hover:text-accent transition-colors duration-200"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            {/* Portal link — right after nav, before everything else */}
            {user && (
              <Link
                href={userType === "venue" ? "/venue-portal" : userType === "customer" ? "/customer-portal" : "/artist-portal"}
                className="block text-base font-medium text-accent hover:text-accent-hover transition-colors -mt-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                {userType === "venue" ? "Venue Portal" : userType === "customer" ? "My Account" : "Artist Portal"}
              </Link>
            )}
            {/* More pages — logged in only */}
            {user && (
              <div className="pt-2 border-t border-border">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted mb-2">More</p>
                <div className="flex flex-col gap-2">
                  {moreLinks.map((link) => (
                    <Link key={link.href} href={link.href} className="text-sm text-muted hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen(false)}>
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-3 pt-4 border-t border-border">
              {user ? (
                <>
                  <div className="flex flex-col gap-3">
                    <Link
                      href={`${portalBase}/messages`}
                      className="flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      Messages
                      {unreadCount > 0 && (
                        <span className="min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-accent rounded-full leading-none">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </Link>
                    <Link
                      href={`${portalBase}`}
                      className="flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                      Notifications
                    </Link>
                  </div>
                  <button
                    onClick={() => { signOut(); setMobileMenuOpen(false); }}
                    className="text-sm text-muted hover:text-foreground transition-colors duration-200 text-left"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-center text-sm px-5 py-3 rounded-sm border border-border text-foreground hover:bg-foreground/5"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Login
                  </Link>
                  <Link
                    href="/signup"
                    className="text-center text-sm px-5 py-3 rounded-sm bg-foreground text-white hover:bg-foreground/90"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
        </>
      )}
    </header>
  );
}
