"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session, AuthError } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userType: "artist" | "venue" | "customer" | "admin" | null;
  displayName: string | null;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (
    email: string,
    password: string,
    metadata: { user_type: "artist" | "venue" | "admin"; display_name: string }
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

  useEffect(() => {
    // Restore session on mount — set user immediately, don't wait for subscription
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      fetchSubscription(s?.user ?? null);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        fetchSubscription(s?.user ?? null);
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
      metadata: { user_type: "artist" | "venue" | "customer" | "admin"; display_name: string }
    ) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata },
      });
      return { error };
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const userType = (user?.user_metadata?.user_type as "artist" | "venue" | "customer" | "admin") ?? null;
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
