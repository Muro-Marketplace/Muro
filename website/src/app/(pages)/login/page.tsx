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
import { portalPathForRole, isSignupRole, SIGNUP_ROLES, type SignupRole } from "@/lib/auth-roles";

// Human labels for the three roles a visitor may ask for. Used by the ?hint=
// guidance (A3/H3) and the OAuth account-type choice (H1).
const ROLE_LABEL: Record<SignupRole, string> = {
  artist: "artist",
  venue: "venue",
  customer: "customer",
};

/**
 * Reads ?hint= from a query string, returning it only if it names a real
 * signup role. Anything else, including "admin" and anything a link might
 * carry in, is discarded rather than echoed back onto the page.
 */
function readRoleHint(search: string): SignupRole | null {
  const raw = new URLSearchParams(search).get("hint");
  return isSignupRole(raw) ? raw : null;
}

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, userType, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // 09 item 3.2: an unconfirmed account could not get past this form, and there
  // was no resend path anywhere, so the only recovery was to give up. Supabase
  // answers "Email not confirmed" for exactly this case.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const toastFired = useRef(false);
  // A3/H3: the header's "Switch to X portal" control signs the user out and
  // sends them here as /login?email=…&hint=X. Nothing read `hint`, so the one
  // thing the round trip was for (which of my accounts am I signing into?)
  // was dropped the moment the page loaded. Held in state because it is read
  // from window.location, which is not available during the server render.
  const [roleHint, setRoleHint] = useState<SignupRole | null>(null);
  // H1: which kind of account OAuth should create for someone who has never
  // signed in before. Defaults to customer, the least privileged of the three.
  const [oauthRole, setOauthRole] = useState<SignupRole>("customer");

  // Read ?email=… on mount so the portal-switcher flow (which signs the
  // user out and redirects here) can pre-fill the email of the account
  // they're trying to switch into. ?hint= comes off the same link.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const seed = params.get("email");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (seed) setEmail(seed);
    const hint = readRoleHint(window.location.search);
    if (hint) {
      setRoleHint(hint);
      // If they came here to reach their venue account, an OAuth sign-in
      // should be offering to make a venue account, not a customer one.
      setOauthRole(hint);
    }
  }, []);

  // Redirect if already logged in. Honours ?next= so a deep link that
  // bounced the user through /login lands them back where they started.
  // We read window.location directly (no useSearchParams) so the page
  // doesn't need a Suspense boundary at prerender time. safeRedirect +
  // portalPathForRole come from Plan A's auth-roles refactor.
  useEffect(() => {
    if (authLoading || !user) return;
    const search = typeof window === "undefined" ? "" : window.location.search;
    const params = new URLSearchParams(search);
    const hint = readRoleHint(search);
    // A3/H3: when the switcher asked for a specific account and the details
    // opened a different one, say so. Accounts are per role, so signing in
    // with the artist password lands in the artist portal however hard the
    // link asked for the venue one, and being dumped back where you started
    // with no explanation is what made this look broken.
    const landedElsewhere = !!hint && !!userType && userType !== hint;
    if (!toastFired.current) {
      toastFired.current = true;
      showToast(
        landedElsewhere
          ? `Those details signed you into your ${ROLE_LABEL[userType as SignupRole] ?? userType} account. To reach your ${ROLE_LABEL[hint!]} account, sign in with the details you set up for it.`
          : "You're already signed in. Redirecting…",
        { durationMs: landedElsewhere ? 7000 : 2500 },
      );
    }
    // Canonical param is ?next=. Back-compat: legacy ?redirect= links
    // (e.g. old artwork-page message button) also honoured here.
    const next = params.get("next") ?? params.get("redirect");
    // The hint never overrides the real role: portalPathForRole already sends
    // a matching account to the hinted portal, and forcing a mismatched one
    // there would only bounce off that portal's guard.
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
      const unconfirmed = /email not confirmed|not confirmed/i.test(authError.message || "");
      setNeedsVerification(unconfirmed);
      setError(authError.message === "Invalid login credentials"
        ? "Invalid email or password"
        : authError.message
      );
      setLoading(false);
      return;
    }

    // Redirect happens via the useEffect above when user state updates
  }

  async function handleResendVerification() {
    setResendState("sending");
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      /* The endpoint answers the same either way; a network blip is not worth
         a second error message on top of the one already showing. */
    }
    // "sent" regardless, matching the endpoint: it does not say whether the
    // address has an account, and neither does this.
    setResendState("sent");
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
      {/* Background image. The Unsplash original is 3917x5555, so asking for
          w=1920 threw away most of it before Next had even seen the file and
          left the backdrop visibly soft. 3840 is the widest Next will now
          request (see deviceSizes in next.config.ts) and the centre crop still
          comes out of the master at roughly 1:1, so nothing is upscaled
          anywhere in the chain. q=92 upstream costs ~90KB over Unsplash's
          default 85 and gives Next a clean source to re-encode from; Next
          caches it for 30 days, so the fetch happens about once a month.

          The width is the whole win, not `quality`. Measured against the
          21MP master with the bg-black/55 overlay applied, 1200px@q75 sat
          1.66/255 off it and 3840px@q75 sits 1.01 off: the resolution closes
          40% of the gap. Raising the re-encode from 75 to 90 closes a further
          2% and nearly doubles the file (590KB to 1150KB), because the
          overlay flattens the range the codec is being asked to preserve.
          Under this overlay even 80 is already past the visible difference;
          it is here as headroom in case bg-black/55 is ever lightened, which
          is what would make the codec's work start to show. If it is, revisit
          this number rather than assuming it still has nothing to do.

          `sizes` is not 100vw because the image is `object-cover` in a
          full-height box. On anything taller than 16:9 the height binds, so
          the rendered image is far wider than the viewport: a 390x844 phone
          covers a box ~872pt tall, which needs ~1550pt of image width, four
          times the viewport. Browsers pick a srcset entry off the width alone,
          so 100vw asked for a quarter of what it painted. The multipliers
          below reflect that overdraw. */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=3840&h=2160&fit=crop&crop=center&q=92&fm=jpg"
          alt="Abstract pour painting in yellow, ink and bone"
          fill
          className="object-cover"
          priority
          quality={80}
          sizes="(max-width: 640px) 400vw, (max-width: 1024px) 250vw, 100vw"
        />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <div className="w-full max-w-md -mt-[8vh] sm:mt-0">
        {/* Heading */}
        <div className="text-center mb-8">
          <h1 className="text-3xl lg:text-4xl mb-2 text-white">Welcome back</h1>
          {/* A3/H3: name the account when the portal switcher sent them here,
              so the sign-out they just went through has a visible reason. */}
          <p className="text-white/50 text-sm">
            {roleHint
              ? `Sign in to your ${ROLE_LABEL[roleHint]} account`
              : "Sign in to your Wallplace account"}
          </p>
        </div>

        {/* Login form */}
        <div className="bg-white/95 backdrop-blur-sm rounded-sm p-6 sm:p-8">
          {/* A3/H3: each Wallplace account type is a separate account, so the
              password that opens one will not open another. Saying this here
              saves the "I typed the right password and ended up back where I
              started" round trip. */}
          {roleHint && (
            <p className="mb-4 rounded-sm bg-background border border-border p-3 text-xs text-muted">
              You have more than one Wallplace account on this email address.
              Each one has its own sign-in details, so use the ones you set up
              for your {ROLE_LABEL[roleHint]} account.
            </p>
          )}
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
                // Row A L484. Both signup forms require 8; this asked for 6,
                // so the sign-in form implied a shorter password was valid
                // than any account can actually have.
                minLength={8}
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

            {needsVerification && (
              <div className="rounded-sm bg-background border border-border p-3 text-center">
                {resendState === "sent" ? (
                  <p className="text-xs text-muted">
                    If that address needs confirming, we have sent a new link. Check your
                    inbox and your spam folder.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted mb-2">
                      You need to confirm your email address before signing in.
                    </p>
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resendState === "sending" || !email}
                      className="text-xs font-medium text-accent hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resendState === "sending" ? "Sending..." : "Send me a new link"}
                    </button>
                  </>
                )}
              </div>
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

              {/* H1: this used to post role "customer" unconditionally. A
                  visitor with no Wallplace account who pressed Google here
                  became a customer without being asked and without being told
                  an account was being created at all, and the only way back
                  was to notice and go through /apply. The role is now theirs
                  to pick, and the copy says what pressing the button does.
                  oauth-finalize still never overwrites an existing user_type,
                  so a returning artist is unaffected by whatever is selected
                  here, and it records their terms acceptance server-side. */}
              <fieldset className="mb-3">
                <legend className="text-[11px] text-muted mb-2">
                  New to Wallplace? If this email has no account yet, we will
                  create one. Choose the type:
                </legend>
                <div className="flex gap-2">
                  {SIGNUP_ROLES.map((role) => (
                    <label
                      key={role}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 border rounded-sm text-xs cursor-pointer transition-colors ${
                        oauthRole === role
                          ? "border-accent bg-accent/5 text-foreground font-medium"
                          : "border-border text-muted hover:text-foreground"
                      }`}
                    >
                      <input
                        type="radio"
                        name="oauth-account-type"
                        value={role}
                        checked={oauthRole === role}
                        onChange={() => setOauthRole(role)}
                        className="sr-only"
                      />
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-muted mt-2">
                  Already have an account? Your existing account type is kept,
                  whichever is selected here. By continuing you agree to our{" "}
                  <Link href="/terms" className="text-accent hover:underline">Terms of Service</Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link>.
                </p>
              </fieldset>

              <div className="flex gap-3">
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
                        body: JSON.stringify({ role: oauthRole, next }),
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
                        body: JSON.stringify({ role: oauthRole, next }),
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
