"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session, AuthError } from "@supabase/supabase-js";
import { parseRole, type SignupRole, type UserRole } from "@/lib/auth-roles";
import { clearPortalGetCache } from "@/lib/portal-get";
import { clearCurrentArtistCache } from "@/lib/current-artist-cache";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userType: UserRole | null;
  displayName: string | null;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (
    email: string,
    password: string,
    // E35d: SignupRole, not UserRole. UserRole includes "admin", so this
    // signature let any caller ask GoTrue for an admin account with the anon
    // key. Admin is granted server-side only (ADR 0008).
    metadata: { user_type: SignupRole; display_name: string },
  ) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);

  // Fetch subscription info for artists
  const fetchSubscription = useCallback(async (u: User | null) => {
    if (!u) { setSubscriptionStatus(null); setSubscriptionPlan(null); return; }
    const uType = u.user_metadata?.user_type;
    if (uType !== "artist") { setSubscriptionStatus(null); setSubscriptionPlan(null); return; }
    try {
      const { data } = await supabase
        .from("artist_profiles")
        .select("subscription_status, subscription_plan")
        .eq("user_id", u.id)
        .single();
      setSubscriptionStatus(data?.subscription_status ?? null);
      setSubscriptionPlan(data?.subscription_plan ?? null);
    } catch {
      setSubscriptionStatus(null);
      setSubscriptionPlan(null);
    }
  }, []);

  // Tracks user IDs we've already fired /api/auth/welcome for in this
  // tab. Lives outside React state so it isn't reset by Strict Mode
  // remounts or state updater replays. Without this, multiple SIGNED_IN
  // events (initial session restore + subsequent OAuth callback) plus
  // React 19's updater double-invocation in dev produced 4+ POSTs and the
  // backend race-condition shipped duplicate welcome emails.
  const welcomedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Restore session on mount, set user immediately, don't wait for subscription
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      fetchSubscription(s?.user ?? null);
    });

    // Listen for auth state changes. Supabase fires TOKEN_REFRESHED on tab
    // focus when the session is nearing expiry, if we update user/session
    // state every time, every consumer hook re-runs and it looks like the
    // whole page is reloading on tab switch. Compare IDs and only update
    // when it's actually a different user (sign-in / sign-out), not a
    // silent refresh. The session object itself still gets updated for the
    // next Supabase request to use.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        setSession(s);
        // Welcome fan-out lives OUTSIDE the setUser callback so React
        // can't replay it (Strict Mode double-invokes updater functions
        // in dev, which previously caused duplicate POSTs).
        const nextUser = s?.user ?? null;
        if (
          nextUser &&
          s?.access_token &&
          event === "SIGNED_IN" &&
          !welcomedRef.current.has(nextUser.id)
        ) {
          welcomedRef.current.add(nextUser.id);
          // Fire-and-forget; we don't block UI on email send. The server
          // route is idempotent (email_events.idempotency_key UNIQUE) so
          // a stray duplicate from another tab is still safe.
          fetch("/api/auth/welcome", {
            method: "POST",
            headers: { Authorization: `Bearer ${s.access_token}` },
          }).catch(() => { /* best-effort */ });
        }
        setUser((prev) => {
          const prevId = prev?.id || null;
          const nextId = nextUser?.id || null;
          if (prevId === nextId) return prev;
          // Whoever is signed in has changed, including to nobody. Both caches
          // are keyed by URL alone, so anything held from the previous session
          // must go before the next one can read it.
          clearPortalGetCache();
          clearCurrentArtistCache();
          fetchSubscription(nextUser);
          return nextUser;
        });
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchSubscription]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      metadata: { user_type: SignupRole; display_name: string },
    ) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          // 09 item 3.2: this and apply/claim were the two signup paths with no
          // emailRedirectTo, so their confirmation link landed on Supabase's
          // default redirect rather than back on the site. The three
          // signup/* pages already pass exactly this.
          emailRedirectTo:
            typeof window === "undefined"
              ? undefined
              : `${window.location.origin}/login?next=${encodeURIComponent("/browse")}`,
        },
      });
      return { error };
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const userType = parseRole(user?.user_metadata?.user_type);
  const displayName = (user?.user_metadata?.display_name as string) ?? null;

  return (
    <AuthContext.Provider
      value={{ user, session, loading, userType, displayName, subscriptionStatus, subscriptionPlan, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
