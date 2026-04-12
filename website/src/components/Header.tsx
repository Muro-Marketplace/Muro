"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CartIndicator from "./CartIndicator";
import SearchBar from "./SearchBar";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

const navLinks = [
  { label: "Marketplace", href: "/browse" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Blog", href: "/blog" },
  { label: "Spaces", href: "/spaces-looking-for-art" },
  { label: "Waitlist", href: "/waitlist" },
];

const immersiveRoutes = ["/venues", "/artists", "/browse", "/about", "/how-it-works"];

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const isImmersive = immersiveRoutes.includes(pathname);
  const { user, userType, displayName, signOut, loading: authLoading } = useAuth();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [msgDropdownOpen, setMsgDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [conversations, setConversations] = useState<{ conversationId: string; otherPartyDisplayName: string; otherPartyImage: string | null; otherParty: string; latestMessage: string; unreadCount: number; lastActivity: string }[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; type: string; title: string; description: string; time: string; link: string }[]>([]);
  const msgDropdownRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    fetchUnread();
    // Poll every 60 seconds
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

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

  // Load notifications when dropdown opens — placements, messages, enquiries
  useEffect(() => {
    if (!notifDropdownOpen || !user || !resolvedSlug) return;
    async function loadNotifs() {
      const notifs: typeof notifications = [];
      try {
        // Placements
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
        // Unread messages
        const msgsRes = await authFetch(`/api/messages?slug=${resolvedSlug}`);
        const msgsData = await msgsRes.json();
        for (const c of (msgsData.conversations || []).slice(0, 5)) {
          if (c.unreadCount > 0) {
            notifs.push({ id: "msg-" + c.conversationId, type: "message", title: "New Message", description: `${c.otherPartyDisplayName || c.otherParty}: ${c.latestMessage}`.slice(0, 80), time: c.lastActivity, link: `${portalBase}/messages` });
          }
        }
      } catch { /* empty */ }
      // Sort by time descending
      notifs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setNotifications(notifs.slice(0, 12));
    }
    loadNotifs();
  }, [notifDropdownOpen, user, resolvedSlug, portalBase]);

  // Close dropdowns on click outside
  useEffect(() => {
    if (!msgDropdownOpen && !notifDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (msgDropdownOpen && msgDropdownRef.current && !msgDropdownRef.current.contains(e.target as Node)) {
        setMsgDropdownOpen(false);
      }
      if (notifDropdownOpen && notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setNotifDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [msgDropdownOpen, notifDropdownOpen]);

  // Close dropdowns on route change
  useEffect(() => { setMsgDropdownOpen(false); setNotifDropdownOpen(false); }, [pathname]);

  const isPortal = pathname.startsWith("/artist-portal") || pathname.startsWith("/venue-portal");
  const showSolid = !isImmersive || scrolled;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 h-14 lg:h-16 ${
        isPortal
          ? "border-b border-white/10"
          : showSolid
          ? "bg-white border-b border-border"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      {/* Dark gallery background for portal pages */}
      {isPortal && (
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <img src="https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1920&h=200&fit=crop&crop=center" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/45 to-black/55" />
        </div>
      )}
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

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-7" role="navigation" aria-label="Main navigation">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors duration-300 ${
                  isPortal || !showSolid
                    ? "text-white/80 hover:text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Search */}
          <SearchBar variant={isPortal || !showSolid ? "dark" : "light"} mode="desktop" />

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-2.5">
            {!authLoading && user ? (
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
                    {notifications.length > 0 && notifDropdownOpen === false && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-bold text-white bg-accent rounded-full leading-none">
                        {notifications.length > 9 ? "9+" : notifications.length}
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
                              href={n.link}
                              onClick={() => setNotifDropdownOpen(false)}
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
                  {userType === "venue" ? "Venue Portal" : "Artist Portal"}
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
            ) : !authLoading ? (
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

          {/* Mobile Search + Menu Toggle */}
          <div className="lg:hidden flex items-center">
            <SearchBar variant={isPortal || !showSolid ? "dark" : "light"} mode="mobile" />
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
            <nav className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-base text-muted hover:text-foreground transition-colors duration-200"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="flex flex-col gap-3 pt-4 border-t border-border">
              {user ? (
                <>
                  <div className="flex items-center gap-4 pb-2">
                    <Link
                      href={`${portalBase}/messages`}
                      className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
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
                  </div>
                  {/* Portal navigation */}
                  <div className="pt-2 border-t border-border">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted mb-2">
                      {userType === "venue" ? "Venue Portal" : userType === "customer" ? "My Account" : "Artist Portal"}
                    </p>
                    <div className="flex flex-col gap-2">
                      {(userType === "artist" ? [
                        { label: "Dashboard", href: "/artist-portal" },
                        { label: "Placements", href: "/artist-portal/placements" },
                        { label: "Orders", href: "/artist-portal/orders" },
                        { label: "QR Labels", href: "/artist-portal/labels" },
                        { label: "Edit Profile", href: "/artist-portal/profile" },
                        { label: "Settings", href: "/artist-portal/settings" },
                      ] : userType === "venue" ? [
                        { label: "Dashboard", href: "/venue-portal" },
                        { label: "Placements", href: "/venue-portal/placements" },
                        { label: "Orders", href: "/venue-portal/orders" },
                        { label: "Saved", href: "/venue-portal/saved" },
                        { label: "Settings", href: "/venue-portal/settings" },
                      ] : [
                        { label: "My Orders", href: "/customer-portal" },
                      ]).map((item) => (
                        <Link key={item.href} href={item.href} className="text-sm text-foreground/70 hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen(false)}>
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => { signOut(); setMobileMenuOpen(false); }}
                    className="text-base text-muted hover:text-foreground transition-colors duration-200"
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
