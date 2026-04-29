"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

interface PortalGuardProps {
  allowedType: "artist" | "venue" | "admin";
  children: React.ReactNode;
}

export default function PortalGuard({ allowedType, children }: PortalGuardProps) {
  const { user, loading, userType } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [subscriptionOk, setSubscriptionOk] = useState(true);
  const [reviewStatus, setReviewStatus] = useState<"approved" | "pending" | "rejected" | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    } else if (!loading && user && userType && userType !== allowedType) {
      router.replace(
        userType === "admin" ? "/admin" :
        userType === "artist" ? "/artist-portal" :
        "/venue-portal"
      );
    }
  }, [user, loading, userType, allowedType, router]);

  // Check subscription for artists
  useEffect(() => {
    if (allowedType !== "artist" || !user || loading) {
      setSubscriptionChecked(true);
      return;
    }

    // Always allow access to billing and settings pages (so users can subscribe/manage)
    if (pathname === "/artist-portal/billing" || pathname === "/artist-portal/settings") {
      setSubscriptionChecked(true);
      setSubscriptionOk(true);
      return;
    }

    authFetch("/api/artist-profile")
      .then((res) => res.json())
      .then((data) => {
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

        // Pending artists haven't finished review yet, don't force them
        // to subscribe. Billing flow opens once they're approved.
        if (rs === "pending") {
          setSubscriptionOk(true);
          return;
        }

        if (status === "active" || status === "trialing") {
          // Paid or trialing, full access
          setSubscriptionOk(true);
        } else if (status === "none") {
          // No subscription yet, redirect to billing to pick a plan
          setSubscriptionOk(false);
        } else {
          // past_due, canceled, blocked
          setSubscriptionOk(false);
        }
      })
      .catch(() => {
        setSubscriptionOk(true); // On error, don't block
      })
      .finally(() => setSubscriptionChecked(true));
  }, [allowedType, user, loading, pathname]);

  if (loading || !subscriptionChecked) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  // Subscription gate for artists
  if (allowedType === "artist" && !subscriptionOk) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="max-w-md text-center px-6">
          <h2 className="text-xl font-serif mb-3">Choose Your Plan</h2>
          <p className="text-sm text-muted mb-2">
            Pick a plan to get started. All plans include a free trial, and you won&rsquo;t be charged until it ends.
          </p>
          <p className="text-xs text-muted mb-6">
            All plans include a 30-day free trial.
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
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-3 flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-700 shrink-0">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-xs sm:text-sm text-amber-900 flex-1">
              <span className="font-medium">Your application is under review.</span>{" "}
              Your profile goes live as soon as we&rsquo;ve approved it. In the meantime, you can keep building it out.
            </p>
            <Link href="/artist-portal/profile" className="hidden sm:inline-flex text-xs font-medium text-amber-900 underline hover:no-underline">
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

  return <>{children}</>;
}
