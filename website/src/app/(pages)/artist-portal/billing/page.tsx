"use client";

import { useState, useEffect } from "react";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import Button from "@/components/Button";
import { authFetch } from "@/lib/api-client";

interface ProfileSubscription {
  subscription_status: string;
  subscription_plan: string;
  subscription_period_end: string | null;
  trial_end: string | null;
  is_founding_artist: boolean;
}

const PLAN_DETAILS: Record<string, { name: string; price: string; fee: string }> = {
  core: { name: "Core", price: "\u00a39.99/month", fee: "15%" },
  premium: { name: "Premium", price: "\u00a329.99/month", fee: "5%" },
  pro: { name: "Pro", price: "\u00a369.99/month", fee: "0%" },
  none: { name: "No plan", price: "\u2014", fee: "\u2014" },
};

function daysUntil(dateStr: string | null): number {
  if (!dateStr) return 0;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    trialing: "bg-accent/10 text-accent",
    past_due: "bg-red-100 text-red-700",
    canceled: "bg-gray-100 text-gray-600",
    none: "bg-gray-100 text-gray-600",
  };
  const labels: Record<string, string> = {
    active: "Active",
    trialing: "Trial",
    past_due: "Past Due",
    canceled: "Canceled",
    none: "No Plan",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[status] || colors.none}`}>
      {labels[status] || status}
    </span>
  );
}

export default function BillingPage() {
  const [sub, setSub] = useState<ProfileSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    authFetch("/api/artist-profile")
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) {
          setSub({
            subscription_status: data.profile.subscription_status || "none",
            subscription_plan: data.profile.subscription_plan || "none",
            subscription_period_end: data.profile.subscription_period_end || null,
            trial_end: data.profile.trial_end || null,
            is_founding_artist: data.profile.is_founding_artist || false,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe(plan: string) {
    setRedirecting(true);
    try {
      const res = await authFetch("/api/subscribe", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to start checkout");
        setRedirecting(false);
      }
    } catch {
      alert("Something went wrong. Please try again.");
      setRedirecting(false);
    }
  }

  async function handleManage() {
    setRedirecting(true);
    try {
      const res = await authFetch("/api/subscribe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to open billing portal");
        setRedirecting(false);
      }
    } catch {
      alert("Something went wrong. Please try again.");
      setRedirecting(false);
    }
  }

  if (loading) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/billing">
        <div className="py-12 text-center"><p className="text-muted text-sm">Loading billing...</p></div>
      </ArtistPortalLayout>
    );
  }

  const status = sub?.subscription_status || "none";
  const plan = sub?.subscription_plan || "none";
  const details = PLAN_DETAILS[plan] || PLAN_DETAILS.none;
  const hasSubscription = status === "active" || status === "trialing";
  const trialDaysLeft = status === "trialing" ? daysUntil(sub?.trial_end ?? null) : 0;

  return (
    <ArtistPortalLayout activePath="/artist-portal/billing">
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl">Billing</h1>
      </div>

      {/* Current plan */}
      {hasSubscription ? (
        <div className="bg-surface border border-border rounded-sm p-6 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-medium">{details.name}</h2>
                {statusBadge(status)}
              </div>
              <p className="text-sm text-muted">{details.price} &middot; {details.fee} platform fee on sales</p>
            </div>
            <button
              type="button"
              onClick={handleManage}
              disabled={redirecting}
              className="px-4 py-2 text-sm font-medium border border-border rounded-sm text-foreground hover:border-accent hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
            >
              {redirecting ? "Opening..." : "Manage Subscription"}
            </button>
          </div>

          {/* Trial banner */}
          {status === "trialing" && (
            <div className="bg-accent/8 border border-accent/20 rounded-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-accent flex-shrink-0">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.25" />
                  <path d="M7 4v3.5L9 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
                <p className="text-sm text-accent font-medium">
                  {sub?.is_founding_artist ? "Founding Artist free trial" : "Free trial active"}
                </p>
              </div>
              <p className="text-sm text-accent">
                {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining
                {sub?.trial_end && ` \u2014 trial ends ${new Date(sub.trial_end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
              </p>
            </div>
          )}

          {/* Period info */}
          {status === "active" && sub?.subscription_period_end && (
            <p className="text-xs text-muted mt-4">
              Next billing date: {new Date(sub.subscription_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
      ) : (
        /* No active subscription — show plan picker */
        <div className="mb-5">
          {status === "past_due" && (
            <div className="bg-red-50 border border-red-200 rounded-sm px-4 py-3 mb-5 text-sm text-red-700">
              Your last payment failed. Please update your payment method to continue accessing your portal.
              <button type="button" onClick={handleManage} className="ml-2 underline font-medium cursor-pointer">
                Update payment
              </button>
            </div>
          )}
          {status === "canceled" && (
            <div className="bg-surface border border-border rounded-sm px-4 py-3 mb-5 text-sm text-muted">
              Your subscription has been canceled. Choose a plan below to reactivate.
            </div>
          )}

          <h2 className="text-lg font-medium mb-4">Choose a plan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(["core", "premium", "pro"] as const).map((p) => {
              const d = PLAN_DETAILS[p];
              return (
                <div key={p} className="bg-surface border border-border rounded-sm p-5 flex flex-col">
                  <h3 className="text-base font-medium mb-1">{d.name}</h3>
                  <p className="text-lg font-semibold mb-1">{d.price}</p>
                  <p className="text-xs text-muted mb-4">{d.fee} platform fee</p>
                  <button
                    type="button"
                    onClick={() => handleSubscribe(p)}
                    disabled={redirecting}
                    className="mt-auto w-full py-2.5 text-sm font-medium bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {redirecting ? "Redirecting..." : `Start with ${d.name}`}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted mt-3 text-center">
            {sub?.is_founding_artist ? "Founding artists get 6 months free." : "All plans include a 30-day free trial."}
          </p>
        </div>
      )}

      {/* Manage link for active users */}
      {hasSubscription && (
        <div className="bg-surface border border-border rounded-sm p-6">
          <h2 className="text-base font-medium mb-3">Payment & Invoices</h2>
          <p className="text-sm text-muted mb-4">
            Manage your payment method, view invoices, and update your subscription through Stripe.
          </p>
          <button
            type="button"
            onClick={handleManage}
            disabled={redirecting}
            className="px-4 py-2 text-sm font-medium bg-foreground text-background rounded-sm hover:bg-foreground/90 transition-colors cursor-pointer disabled:opacity-50"
          >
            {redirecting ? "Opening..." : "Open Billing Portal"}
          </button>
        </div>
      )}
    </ArtistPortalLayout>
  );
}
