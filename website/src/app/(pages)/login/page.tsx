"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase";
import { isFlagOn } from "@/lib/feature-flags";
import { safeRedirect } from "@/lib/safe-redirect";
import { portalPathForRole } from "@/lib/auth-roles";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, userType, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const toastFired = useRef(false);

  // Read ?email=… on mount so the portal-switcher flow (which signs the
  // user out and redirects here) can pre-fill the email of the account
  // they're trying to switch into.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const seed = new URLSearchParams(window.location.search).get("email");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (seed) setEmail(seed);
  }, []);

  // Redirect if already logged in. Honours ?next= so a deep link that
  // bounced the user through /login lands them back where they started.
  // We read window.location directly (no useSearchParams) so the page
  // doesn't need a Suspense boundary at prerender time. safeRedirect +
  // portalPathForRole come from Plan A's auth-roles refactor.
  useEffect(() => {
    if (authLoading || !user) return;
    if (!toastFired.current) {
      toastFired.current = true;
      showToast("You're already signed in. Redirecting…", { durationMs: 2500 });
    }
    const params =
      typeof window === "undefined"
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search);
    // Canonical param is ?next=. Back-compat: legacy ?redirect= links
    // (e.g. old artwork-page message button) also honoured here.
    const next = params.get("next") ?? params.get("redirect");
    router.replace(safeRedirect(next, portalPathForRole(userType)));
  }, [authLoading, user, userType, router, showToast]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // F54, rate-limit precheck (IP-scoped). Cloudflare edge rules are the
    // primary line of defence; this catches attempts that slip past.
    try {
      const precheck = await fetch("/api/auth/precheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "login" }),
      });
      if (precheck.status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
        setLoading(false);
        return;
      }
    } catch { /* network error, fall through and let Supabase handle */ }

    const { error: authError } = await signIn(email, password);

    if (authError) {
      setError(authError.message === "Invalid login credentials"
        ? "Invalid email or password"
        : authError.message
      );
      setLoading(false);
      return;
    }

    // Redirect happens via the useEffect above when user state updates
  }

  // Don't render form while checking auth
  if (authLoading) return null;
  if (user) return null;

  // Build the ?next= suffix to forward onto the Sign up cross-link.
  // Reads the same params as the redirect useEffect above; validated so
  // external URLs produce no suffix (clean /signup link, no dangling param).
  const signupParams =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const signupSafeNext = safeRedirect(
    signupParams.get("next") ?? signupParams.get("redirect"),
    "",
  );
  const signupNextSuffix = signupSafeNext
    ? `?next=${encodeURIComponent(signupSafeNext)}`
    : "";

  return (
    <div className="relative min-h-[calc(110vh-3.5rem)] sm:min-h-[calc(100vh-3.5rem)] lg:min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 py-16">
      {/* Background image */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=1920&h=1080&fit=crop&crop=center"
          alt="Abstract pour painting in yellow, ink and bone"
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <div className="w-full max-w-md -mt-[8vh] sm:mt-0">
        {/* Heading */}
        <div className="text-center mb-8">
          <h1 className="text-3xl lg:text-4xl mb-2 text-white">Welcome back</h1>
          <p className="text-white/50 text-sm">Sign in to your Wallplace account</p>
        </div>

        {/* Login form */}
        <div className="bg-white/95 backdrop-blur-sm rounded-sm p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Your password"
                minLength={6}
                className="w-full px-4 py-3 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>

            <div className="text-right">
              <Link href="/forgot-password" className="text-xs text-muted hover:text-accent transition-colors">
                Forgot password?
              </Link>
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* OAuth (Google / Apple), hidden until providers are enabled in
              Supabase. Flip NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE=1 in Vercel
              once both providers are configured. */}
          {!isFlagOn("OAUTH_GOOGLE_APPLE") && (
            <p className="text-[11px] text-muted text-center mt-3">
              Email + password only for now. Google and Apple sign-in coming soon.
            </p>
          )}
          {isFlagOn("OAUTH_GOOGLE_APPLE") && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted">or continue with</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    // Login doesn't know the user's role yet; default to
                    // "customer". oauth-finalize never overwrites an
                    // existing user_type, so a returning artist still
                    // lands in the artist portal.
                    const next = safeRedirect(
                      new URLSearchParams(window.location.search).get("next"),
                      "/browse",
                    );
                    let state = "";
                    try {
                      const r = await fetch("/api/auth/oauth-sign-state", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ role: "customer", next }),
                      });
                      if (r.ok) state = (await r.json()).state || "";
                    } catch { /* fall through */ }
                    await supabase.auth.signInWithOAuth({
                      provider: "google",
                      options: {
                        redirectTo: `${window.location.origin}/auth/callback`,
                        queryParams: { access_type: "offline", prompt: "consent", state },
                      },
                    });
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-sm text-sm font-medium text-foreground hover:bg-background transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Google
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const next = safeRedirect(
                      new URLSearchParams(window.location.search).get("next"),
                      "/browse",
                    );
                    let state = "";
                    try {
                      const r = await fetch("/api/auth/oauth-sign-state", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ role: "customer", next }),
                      });
                      if (r.ok) state = (await r.json()).state || "";
                    } catch { /* fall through */ }
                    await supabase.auth.signInWithOAuth({
                      provider: "apple",
                      options: {
                        redirectTo: `${window.location.origin}/auth/callback`,
                        queryParams: { state },
                      },
                    });
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-sm text-sm font-medium text-foreground hover:bg-background transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                  Apple
                </button>
              </div>
            </>
          )}
        </div>

        {/* Sign-up links */}
        <div className="text-center mt-6 space-y-2">
          <p className="text-sm text-white/50">
            Don&rsquo;t have an account?{" "}
            <Link
              href={`/signup${signupNextSuffix}`}
              className="text-accent hover:underline underline-offset-4"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
