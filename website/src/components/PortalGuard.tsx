"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { authFetch } from "@/lib/api-client";
import { fetchArtistProfileShared } from "@/lib/artist-profile-source";
import { portalPathForRole, parseRole } from "@/lib/auth-roles";
import { loginPathWithNext } from "@/lib/login-redirect";
import { trialOffer } from "@/lib/pricing";

interface PortalGuardProps {
  allowedType: "artist" | "venue" | "admin" | "customer";
  children: React.ReactNode;
}

const PORTAL_LABELS: Record<string, string> = {
  artist: "artist",
  venue: "venue",
  customer: "customer",
  admin: "admin",
};

export default function PortalGuard({ allowedType, children }: PortalGuardProps) {
  const { user, loading, userType, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [subscriptionOk, setSubscriptionOk] = useState(true);
  const [reviewStatus, setReviewStatus] = useState<"approved" | "pending" | "rejected" | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  // Drives the offer wording in the approval banner (six months for the
  // founding cohort, otherwise the first month).
  const [isFounding, setIsFounding] = useState(false);
  // C1: resend state for the verify-email screen below. Same idiom as the
  // login page's resend block: "sent" regardless of outcome, because the
  // endpoint deliberately answers the same either way.
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [signingOut, setSigningOut] = useState(false);
  /**
   * Roles this very account can enter without switching accounts, from
   * /api/account/roles, which derives them from profile OWNERSHIP.
   *
   * Pass 2 item 3.9 (rows 2571, 2585): two production accounts own both an
   * artist and a venue profile on one auth user, and this guard keyed on
   * `user_metadata.user_type`, of which there is only one. So navigating to
   * /venue-portal bounced them straight back and venue_profiles.finlay is
   * unreachable. `user_metadata` is also the weaker authority: a user can
   * write their own; they cannot write the profile tables.
   *
   * `null` means not yet known. The redirect waits for it and fails CLOSED:
   * an unreachable roles endpoint resolves to an empty list, so it can never
   * become a way into a portal.
   */
  const [ownRoles, setOwnRoles] = useState<string[] | null>(null);

  async function handleResendVerification() {
    if (!user?.email) return;
    setResendState("sending");
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, next: pathname || "/browse" }),
      });
    } catch {
      /* The endpoint answers the same either way; a network blip is not
         worth an error state on a screen whose whole job is recovery. */
    }
    setResendState("sent");
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      router.replace("/login");
    }
  }

  // 3.9: resolve what this account actually owns before deciding to bounce it.
  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    authFetch("/api/account/roles")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setOwnRoles(Array.isArray(data?.ownRoles) ? data.ownRoles : []);
      })
      .catch(() => {
        // Fail closed. An empty list means "no extra portals", which is the
        // pre-existing behaviour, not an opening.
        if (!cancelled) setOwnRoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  useEffect(() => {
    if (!loading && !user) {
      // LA-C004: keep the deep link (an offer's "Pay now", a conversation, a
      // label print) so the login page can return them to it. The login page
      // validates ?next= with safeRedirect before following it.
      router.replace(loginPathWithNext(window.location.pathname, window.location.search));
      return;
    }
    if (loading || !user || !userType || userType === allowedType) return;
    // Wait for the ownership answer rather than bouncing on metadata alone.
    if (ownRoles === null) return;
    if (ownRoles.includes(allowedType)) return;

    const theirRole = PORTAL_LABELS[userType] ?? userType;
    showToast(
      `This is the ${allowedType} portal. Redirecting to your ${theirRole} portal.`,
      { variant: "info", durationMs: 4000 },
    );
    router.replace(portalPathForRole(parseRole(userType)));
  }, [user, loading, userType, allowedType, ownRoles, router, showToast]);

  /**
   * Billing and settings stay reachable whatever the subscription says, so a
   * lapsed subscriber can go and fix it. That is a property of the CURRENT
   * path, so it is evaluated here at render.
   *
   * It used to be an early return inside the effect below, which put
   * `pathname` in that effect's dependencies and re-ran the whole profile
   * fetch on EVERY navigation inside the portal. The check is unchanged; only
   * where it happens is.
   */
  const billingExempt =
    allowedType === "artist" &&
    (pathname === "/artist-portal/billing" || pathname === "/artist-portal/settings");

  // Check subscription for artists.
  //
  // Runs once per session now that the portal chrome lives in the route layout
  // (see app/(pages)/artist-portal/layout.tsx), and shares its request with the
  // chrome and the page's own useCurrentArtist. review_status is set by admin
  // review and subscription_status by Stripe, and every path that changes
  // either one returns through a full page load, so there is nothing for an
  // in-tab refresh to pick up.
  useEffect(() => {
    if (allowedType !== "artist" || !user || loading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSubscriptionChecked(true);
      return;
    }

    let cancelled = false;
    // review_status and subscription_status only; no need for the works.
    fetchArtistProfileShared(user.id, { withWorks: false })
      .then((data) => {
        if (cancelled) return;
        const profile = data.profile;
        if (!profile) {
          setSubscriptionOk(true); // New user, let them through to set up
          return;
        }

        // Track application review state so the portal can show an
        // "Under review" banner and gate outbound actions like accepting
        // placement requests until an admin approves the artist.
        const rs = (profile.review_status as string) || "approved";
        if (rs === "pending" || rs === "approved" || rs === "rejected") {
          setReviewStatus(rs);
        }

        const status = profile.subscription_status || "none";
        setSubscriptionStatus(status);
        setIsFounding(!!profile.is_founding_artist);

        // Pending artists haven't finished review yet, don't force them
        // to subscribe. Billing flow opens once they're approved.
        if (rs === "pending") {
          setSubscriptionOk(true);
          return;
        }

        // Approved artists keep portal access regardless of subscription
        // state so they can keep building out their profile, uploading
        // work, and tidying drafts before they pay. The features that
        // genuinely require a paid plan (going live on the marketplace,
        // sending placement requests, sales) gate themselves at the
        // action level or via review_status. The only hard gate left
        // here is for the bad states where an existing subscription has
        // lapsed; we want those users to fix billing before they keep
        // racking up actions.
        if (status === "past_due" || status === "canceled") {
          setSubscriptionOk(false);
        } else {
          setSubscriptionOk(true);
        }
      })
      .catch(() => {
        if (!cancelled) setSubscriptionOk(true); // On error, don't block
      })
      .finally(() => {
        if (!cancelled) setSubscriptionChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [allowedType, user, loading]);

  if (loading || !subscriptionChecked) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  if (user && !user.email_confirmed_at) {
    // C1 (QA 2026-08-28): this screen used to be a dead end with no resend
    // button and no sign-out control, even though the resend endpoint
    // existed. A user stuck here had to know to log out and fail a login to
    // reach the recovery on the login page.
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="max-w-md text-center px-6">
          <h2 className="text-xl font-serif mb-3">Verify your email</h2>
          <p className="text-sm text-muted mb-6">
            We sent a confirmation link to <span className="font-medium">{user.email}</span>.
            Click it to finish setting up your account, then come back and sign in.
          </p>
          {resendState === "sent" ? (
            <p className="text-xs text-muted mb-4">
              If that address needs confirming, we have sent a new link. Check your
              inbox and your spam folder.
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendState === "sending"}
              className="inline-block mb-4 px-4 py-2 text-sm font-medium bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              {resendState === "sending" ? "Sending..." : "Resend verification email"}
            </button>
          )}
          <p className="text-xs text-muted">
            Wrong account?{" "}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="text-accent hover:underline cursor-pointer disabled:opacity-50"
            >
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Billing and settings render plainly: no plan gate, no review banner. Same
  // outcome the in-effect early return used to produce by leaving
  // subscriptionOk true and reviewStatus null on those two paths.
  if (billingExempt) return <>{children}</>;

  // Subscription gate for artists
  if (allowedType === "artist" && !subscriptionOk) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="max-w-md text-center px-6">
          {/* D1: this gate only ever renders for past_due and canceled
              subscribers, and /api/subscribe gives returning subscribers
              zero trial days, so no free-trial promise belongs here. */}
          <h2 className="text-xl font-serif mb-3">Choose Your Plan</h2>
          <p className="text-sm text-muted mb-2">
            Your subscription isn&rsquo;t active. Pick a plan to carry on where you left off.
          </p>
          <p className="text-xs text-muted mb-6">
            Billing starts as soon as you subscribe.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push("/artist-portal/billing")}
              className="px-5 py-2.5 text-sm font-medium bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors cursor-pointer"
            >
              Choose a Plan
            </button>
            <button
              onClick={() => router.push("/pricing")}
              className="px-5 py-2.5 text-sm font-medium border border-border rounded-sm text-foreground hover:border-accent transition-colors cursor-pointer"
            >
              Compare Plans
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Under-review banner for artists whose application is still pending.
  // We don't block the portal, they can build out their profile, but
  // we make it clear their work isn't live yet. Pages that should be
  // gated (accepting placement requests, collecting payment) check the
  // same review_status on their own.
  if (allowedType === "artist" && reviewStatus === "pending") {
    return (
      <>
        {/* See approved-not-paid banner above for the lg:ml-56 reasoning,
            same fixed-sidebar collision. */}
        <div className="bg-amber-50 border-b border-amber-200 lg:ml-56">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-3 flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-700 shrink-0">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-xs sm:text-sm text-amber-900 flex-1 min-w-0">
              <span className="font-medium">Your application is under review.</span>{" "}
              A finished profile with your work uploaded strengthens your application, so keep building it while we review. It goes live as soon as we approve you.
            </p>
            <Link href="/artist-portal/profile" className="hidden sm:inline-flex shrink-0 text-xs font-medium text-amber-900 underline hover:no-underline">
              Build profile
            </Link>
          </div>
        </div>
        {children}
      </>
    );
  }

  if (allowedType === "artist" && reviewStatus === "rejected") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="max-w-md text-center px-6">
          <h2 className="text-xl font-serif mb-3">Application not approved</h2>
          <p className="text-sm text-muted mb-6">
            Your application wasn&rsquo;t approved this round. If you&rsquo;d like feedback, please email{" "}
            <a className="text-accent hover:underline" href="mailto:applications@wallplace.art">applications@wallplace.art</a>.
          </p>
        </div>
      </div>
    );
  }

  // Approved but not yet on a paid plan. They can use the portal (profile
  // edits, uploads, drafts), they just need to subscribe before going
  // live on the marketplace or sending placement requests. A banner
  // nudges them; outbound monetised actions block themselves server-side.
  if (
    allowedType === "artist" &&
    reviewStatus === "approved" &&
    (subscriptionStatus === "none" || subscriptionStatus === "incomplete")
  ) {
    return (
      <>
        {/* The artist portal sidebar is `fixed left-0 w-56` on desktop,
            so a full-width banner here would have its leading icon +
            copy sitting underneath the sidebar. Match the layout's
            `lg:ml-56` main-column offset so the banner sits inside the
            content column. Mobile keeps the full width. */}
        <div className="bg-accent/5 border-b border-accent/20 lg:ml-56">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-3 flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 2" />
            </svg>
            <p className="text-xs sm:text-sm text-foreground flex-1 min-w-0">
              <span className="font-medium">You&rsquo;re approved.</span>{" "}
              Set up billing to go live on the marketplace and start sending placement requests. {trialOffer(isFounding).short}
            </p>
            <Link href="/artist-portal/billing" className="hidden sm:inline-flex shrink-0 text-xs font-medium text-accent underline hover:no-underline">
              Set up billing
            </Link>
          </div>
        </div>
        {children}
      </>
    );
  }

  return <>{children}</>;
}
