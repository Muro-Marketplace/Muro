"use client";

/**
 * /signup/artist
 *
 * Step 1 of the artist join flow. Creates the Supabase account
 * (email + password OR Google/Apple SSO) so the artist exists as a
 * real user before the application form. Step 2, the actual
 * application, lives at /apply and gates on this auth state, so an
 * unauthenticated visitor lands here first.
 *
 * Why split into two steps:
 *   - Acceptance email (sent by the admin reviewer) deep-links to the
 *     login page. Before this split, applicants had no account, so
 *     the link was useless on first click. Now the account already
 *     exists by the time they hit accept and login works straight
 *     away.
 *   - Lets us prefill the application form's email + name from the
 *     verified auth context, one fewer place to mistype.
 *   - Means the application API can authenticate the request and
 *     reject impersonation, instead of trusting whatever email the
 *     form sent.
 *
 * On success:
 *   - signUp creates the user with `user_type: "artist"` metadata,
 *     which downstream auth-aware routes use to gate / land them on
 *     the artist portal.
 *   - the destination depends on whether Supabase returned a session,
 *     which it does only when email confirmation is off for the project.
 *     With confirmation ON the applicant must click the verification link
 *     first, so they go to /check-your-inbox; the login link in that email
 *     carries ?next= so they land on /apply (Step 2) after signing in. With
 *     confirmation OFF, which is the production setting today, the account
 *     is already signed in and they go straight to /apply. There is no
 *     immediate signInWithPassword either way. See lib/signup-destination.ts.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { signupDestination } from "@/lib/signup-destination";
import { isFlagOn } from "@/lib/feature-flags";
import { safeRedirect } from "@/lib/safe-redirect";
import { FOUNDING_OFFER_SHORT } from "@/lib/pricing";
import { TERMS_VERSION } from "@/lib/terms-version";
import TermsCheckbox from "@/components/TermsCheckbox";
import RedirectIfLoggedIn from "@/components/RedirectIfLoggedIn";
import Turnstile from "@/components/Turnstile";

export default function ArtistSignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreedToTos, setAgreedToTos] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Read ?next= so a deep-link funnel survives the email-verification hop.
  const inboundNext =
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("next") ?? "";
  const postSignupNext = safeRedirect(inboundNext, "/apply");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    if (!turnstileToken) {
      setError("Please complete the verification challenge.");
      setLoading(false);
      return;
    }

    try {
      const verifyRes = await fetch("/api/auth/verify-turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: turnstileToken }),
      });
      const verifyData = (await verifyRes.json().catch(() => ({}))) as { ok?: boolean };
      if (!verifyRes.ok || !verifyData.ok) {
        setError("Verification failed. Refresh and try again.");
        setLoading(false);
        return;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { user_type: "artist", display_name: name },
          emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(postSignupNext)}`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      fetch("/api/terms/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: email,
          userType: "artist",
          termsVersion: TERMS_VERSION,
          termsType: "platform_tos",
        }),
      }).catch(() => {});

      // A L447/A L458: was unconditional. Supabase returns a session only
      // when email confirmation is off, in which case the account is already
      // signed in and the inbox page is untrue. See lib/signup-destination.ts.
      router.push(signupDestination(signUpData, postSignupNext));
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <RedirectIfLoggedIn>
    <div className="min-h-screen flex items-center justify-center relative">
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

      <div className="w-full max-w-lg px-6 py-16">
        <div className="text-center mb-8">
          <h1 className="text-3xl lg:text-4xl font-serif mb-2 text-white">
            Apply to join as an artist
          </h1>
          <p className="text-white/50 text-sm sm:whitespace-nowrap">
            Create your account and the application form is your next stop
          </p>
          <p className="text-accent text-sm font-medium mt-3">{FOUNDING_OFFER_SHORT}</p>
        </div>

        <div className="bg-white/95 backdrop-blur-sm rounded-sm p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Your name"
                className="w-full px-4 py-3 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Email
              </label>
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
              <label className="block text-sm font-medium text-foreground mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="At least 8 characters"
                className="w-full px-4 py-3 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            {/* OAuth (Google / Apple), hidden until providers are enabled in
                Supabase. Flip NEXT_PUBLIC_FLAG_OAUTH_GOOGLE_APPLE=1 in
                Vercel once both providers are configured. */}
            {!isFlagOn("OAUTH_GOOGLE_APPLE") && (
              <p className="text-[11px] text-muted text-center mt-3">
                Email + password only for now. Google and Apple sign-in coming soon.
              </p>
            )}
            {isFlagOn("OAUTH_GOOGLE_APPLE") && (
              <>
                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted">or continue with</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      // Mint signed state so /auth/callback can prove which
                      // role the user chose. If the endpoint isn't available
                      // (e.g. dev without OAUTH_STATE_SECRET) we fall through
                      // with an empty state — finalize will refuse and the
                      // user is redirected to /browse by default.
                      let state = "";
                      try {
                        const r = await fetch("/api/auth/oauth-sign-state", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ role: "artist", next: postSignupNext }),
                        });
                        if (r.ok) state = (await r.json()).state || "";
                      } catch { /* fall through */ }
                      await supabase.auth.signInWithOAuth({
                        provider: "google",
                        options: {
                          redirectTo: `${window.location.origin}/auth/callback`,
                          queryParams: {
                            access_type: "offline",
                            prompt: "consent",
                            state,
                          },
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
                      let state = "";
                      try {
                        const r = await fetch("/api/auth/oauth-sign-state", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ role: "artist", next: postSignupNext }),
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

            <div className="py-1">
              <TermsCheckbox
                termsType="platform_tos"
                checked={agreedToTos}
                onChange={setAgreedToTos}
                required
              />
            </div>

            <Turnstile onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />

            <button
              type="submit"
              disabled={loading || !agreedToTos || !turnstileToken}
              className="w-full px-6 py-3 bg-accent text-white text-sm font-semibold uppercase tracking-wider rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
            <p className="text-[11px] text-muted text-center leading-relaxed">
              Your account is created straight away and you&rsquo;ll land
              on the application form. We email you once your
              application is in, and again when it is approved.
            </p>
          </form>
        </div>

        <p className="text-center mt-6 text-sm text-white/50">
          Already have an account?{" "}
          <Link
            href="/login?next=/apply"
            className="text-white hover:text-accent transition-colors"
          >
            Sign in
          </Link>
          {" · "}
          <Link
            href="/signup"
            className="text-white hover:text-accent transition-colors"
          >
            Other account types
          </Link>
        </p>
      </div>
    </div>
    </RedirectIfLoggedIn>
  );
}
