"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import CartIndicator from "./CartIndicator";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

const navLinks = [
  { label: "Discover Art", href: "/browse" },
  { label: "For Venues", href: "/venues" },
  { label: "For Artists", href: "/artists" },
  { label: "Spaces", href: "/spaces" },
];

const immersiveRoutes = ["/venues", "/artists", "/browse", "/about", "/how-it-works"];

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const isImmersive = immersiveRoutes.includes(pathname);
  const { user, userType, signOut, loading: authLoading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const portalBase = userType === "venue" ? "/venue-portal" : "/artist-portal";

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

  const isPortal = pathname.startsWith("/artist-portal") || pathname.startsWith("/venue-portal");
  const showSolid = !isImmersive || scrolled;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 overflow-hidden ${
        isPortal
          ? "border-b border-white/10"
          : showSolid
          ? "bg-white border-b border-border"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      {/* Dark gallery background for portal pages */}
      {isPortal && (
        <div className="absolute inset-0 -z-10">
          <img src="https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1920&h=200&fit=crop&crop=center" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/45 to-black/55" />
        </div>
      )}
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="flex items-center justify-between h-14 lg:h-16">
          {/* Logo */}
          <Link
            href="/"
            className={`font-serif text-xl lg:text-2xl tracking-tight transition-colors duration-300 ${
              isPortal || !showSolid ? "text-white" : "text-foreground"
            }`}
          >
            Wallspace
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-7">
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

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-2.5">
            {!authLoading && user ? (
              <>
                {/* Messages icon */}
                <Link
                  href={`${portalBase}/messages`}
                  className={`relative p-2 transition-colors duration-300 ${
                    isPortal || !showSolid ? "text-white/70 hover:text-white" : "text-muted hover:text-foreground"
                  }`}
                  title="Messages"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-bold text-white bg-accent rounded-full leading-none">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Link>

                {/* Notifications icon */}
                <Link
                  href={portalBase}
                  className={`relative p-2 transition-colors duration-300 ${
                    isPortal || !showSolid ? "text-white/70 hover:text-white" : "text-muted hover:text-foreground"
                  }`}
                  title="Notifications"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </Link>

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
                  href="/apply"
                  className={`text-sm transition-colors duration-300 ${
                    isPortal || !showSolid ? "text-white/90 hover:text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  Apply to Join
                </Link>
              </>
            ) : null}
            <CartIndicator />
          </div>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            className={`lg:hidden p-2 -mr-2 transition-colors duration-300 ${
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
                  <Link
                    href={portalBase}
                    className="text-center text-sm px-5 py-3 rounded-sm border border-border text-foreground hover:bg-foreground/5"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {userType === "venue" ? "Venue Portal" : "Artist Portal"}
                  </Link>
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
                    href="/apply"
                    className="text-base text-muted hover:text-foreground transition-colors duration-200"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Apply to Join
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
