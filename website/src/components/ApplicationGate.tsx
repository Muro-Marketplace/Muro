"use client";

/**
 * Auth gate for the artist application form.
 *
 * Why a separate component:
 *   The /apply page is a server component (it owns metadata + the
 *   static hero/sidebar). Auth state lives in the AuthContext and
 *   is only available client-side, so the gate has to be its own
 *   "use client" island wrapped around <ApplicationForm />. The
 *   page renders this in place of the form so server-rendered
 *   chrome stays static.
 *
 * Behaviour:
 *   - While auth is loading: render a small loading hint so we don't
 *     flash the form (and trigger redirects) for already-signed-in
 *     users on a slow auth round-trip.
 *   - Signed out: redirect to /signup/artist?next=/apply. We use
 *     replace, not push, so the back button doesn't bounce them
 *     between /apply and /signup/artist.
 *   - Signed in but the wrong user_type (a customer signed in to a
 *     customer account, then opened /apply): show a small notice
 *     with a sign-out + switch CTA. Don't auto-redirect, they may
 *     legitimately want to read the page first.
 *   - Signed in as artist (or no user_type metadata, which is the
 *     case for legacy accounts): render the form.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ApplicationForm from "@/components/ApplicationForm";
import { useAuth } from "@/context/AuthContext";

export default function ApplicationGate({ onSubmitted }: { onSubmitted?: () => void } = {}) {
  const router = useRouter();
  const { user, userType, loading, signOut } = useAuth();
  const [redirected, setRedirected] = useState(false);
  const [switching, setSwitching] = useState(false);

  // A49 (QA 2026-08-28): the wrong-role CTA used to be a plain link to
  // /signup/artist?next=/apply while the user was still signed in.
  // RedirectIfLoggedIn wraps that signup page and bounced them straight
  // back here, so the button was an infinite loop. Do what the copy says:
  // sign out first, then go to the artist signup.
  async function handleSwitchAccount() {
    setSwitching(true);
    try {
      await signOut();
    } catch {
      /* fall through: even a failed sign-out attempt should still land on
         the signup page, where RedirectIfLoggedIn re-checks the session */
    }
    router.push("/signup/artist?next=/apply");
  }

  useEffect(() => {
    if (loading) return;
    if (!user && !redirected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRedirected(true);
      // A17: carry the current query string (e.g. ?plan=pro from the
      // pricing page) through the signup hop so the plan preselect
      // survives account creation and email verification.
      const search = typeof window !== "undefined" ? window.location.search : "";
      router.replace(`/signup/artist?next=${encodeURIComponent(`/apply${search}`)}`);
    }
  }, [loading, user, redirected, router]);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-muted">
        Checking your account…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="py-12 text-center text-sm text-muted">
        Redirecting to sign-up…
      </div>
    );
  }

  // Known wrong user type, the artist application doesn't make
  // sense for a venue or customer account. Don't auto-redirect; let
  // them choose to sign out + come back, since some users juggle
  // multiple accounts.
  if (userType && userType !== "artist") {
    return (
      <div className="bg-surface border border-border rounded-sm p-6 text-sm">
        <p className="font-medium text-foreground mb-2">
          You&rsquo;re signed in as a {userType}.
        </p>
        <p className="text-muted leading-relaxed mb-4">
          The artist application is for individual artists. Sign out
          and create an artist account to continue.
        </p>
        <button
          type="button"
          onClick={handleSwitchAccount}
          disabled={switching}
          className="inline-block px-4 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-60"
        >
          {switching ? "Signing out..." : "Sign out and create artist account"}
        </button>
      </div>
    );
  }

  return <ApplicationForm onSubmitted={onSubmitted} />;
}
