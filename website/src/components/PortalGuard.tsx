"use client";

import { useEffect, useState } from "react";
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

        const status = profile.subscription_status || "none";
        const isFoundingArtist = profile.is_founding_artist || false;

        // Allow: active subscription, trialing, or founding artist without subscription yet
        if (status === "active" || status === "trialing" || (isFoundingArtist && status === "none")) {
          setSubscriptionOk(true);
        } else {
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
          <h2 className="text-xl font-serif mb-3">Subscription Required</h2>
          <p className="text-sm text-muted mb-6">
            Your subscription is inactive. Choose a plan to access your artist portal.
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
              View Pricing
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
