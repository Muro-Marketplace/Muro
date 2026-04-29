"use client";

import { useState, useEffect, useCallback } from "react";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import Button from "@/components/Button";
import { authFetch } from "@/lib/api-client";

interface ProfileSubscription {
  subscription_status: string;
  subscription_plan: string;
  subscription_period_end: string | null;
  trial_end: string | null;
  is_founding_artist: boolean;
  referral_code?: string | null;
}

// Monthly prices; annual saves ~17% (10 months' equivalent).
const PLAN_DETAILS: Record<string, { name: string; priceMonthly: number; priceAnnual: number; fee: string }> = {
  core: { name: "Core", priceMonthly: 9.99, priceAnnual: 99.99, fee: "15%" },
  premium: { name: "Premium", priceMonthly: 24.99, priceAnnual: 249.99, fee: "8%" },
  pro: { name: "Pro", priceMonthly: 49.99, priceAnnual: 499.99, fee: "5%" },
  none: { name: "No plan", priceMonthly: 0, priceAnnual: 0, fee: "\u2014" },
};

function annualMonthlyEquivalent(priceAnnual: number): string {
  return `\u00a3${(priceAnnual / 12).toFixed(2)}/mo`;
}

function annualSavingsPercent(priceMonthly: number, priceAnnual: number): number {
  if (priceMonthly <= 0) return 0;
  return Math.round((1 - priceAnnual / (priceMonthly * 12)) * 100);
}

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

interface ConnectStatus {
  hasAccount: boolean;
  onboardingComplete?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
}

export default function BillingPage() {
  const [sub, setSub] = useState<ProfileSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [planChanged, setPlanChanged] = useState(false);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(true);
  const [connectRedirecting, setConnectRedirecting] = useState(false);

  // Tracks "just came back from Stripe Checkout", used to poll the
  // profile until the webhook lands and the subscription_status flips
  // from canceled/none → active. Without this poll, the page renders
  // the stale pre-upgrade state and the user sees "Your subscription
  // has been canceled" right after a successful upgrade.
  const [confirmingUpgrade, setConfirmingUpgrade] = useState(false);

  // Detect post-Stripe redirect URLs and clean them out of the bar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("changed") === "true") {
      setPlanChanged(true);
      window.history.replaceState({}, "", "/artist-portal/billing");
    }
    if (params.get("subscribed") === "true") {
      setConfirmingUpgrade(true);
      window.history.replaceState({}, "", "/artist-portal/billing");
    }
  }, []);

  // Single source of truth for fetching subscription state. Wrapped
  // so we can call it from both initial load and the post-upgrade
  // poll without duplicating logic.
  const fetchSub = useCallback(async () => {
    try {
      const res = await authFetch("/api/artist-profile");
      const data = await res.json();
      if (!data.profile) return null;
      const next = {
        subscription_status: data.profile.subscription_status || "none",
        subscription_plan: data.profile.subscription_plan || "none",
        subscription_period_end: data.profile.subscription_period_end || null,
        trial_end: data.profile.trial_end || null,
        is_founding_artist: data.profile.is_founding_artist || false,
      };
      setSub(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void fetchSub().finally(() => setLoading(false));
  }, [fetchSub]);

  // Poll after a successful Stripe checkout, the webhook usually
  // lands within 1–3 seconds but can take longer. Poll every 2s for
  // up to 30s, stopping early once the status reads active/trialing.
  useEffect(() => {
    if (!confirmingUpgrade) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 15; // 15 × 2s = 30s window
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      const next = await fetchSub();
      if (cancelled) return;
      const isActive =
        next?.subscription_status === "active" ||
        next?.subscription_status === "trialing";
      if (isActive) {
        setConfirmingUpgrade(false);
        setPlanChanged(true);
        return;
      }
      if (attempts >= maxAttempts) {
        // Give up gracefully, show the page with the latest state
        // we have. The webhook may still arrive after this.
        setConfirmingUpgrade(false);
        return;
      }
      window.setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [confirmingUpgrade, fetchSub]);

  // Fetch Stripe Connect status
  useEffect(() => {
    authFetch("/api/stripe-connect/status")
      .then((res) => res.json())
      .then((data) => setConnectStatus(data))
      .catch(() => {})
      .finally(() => setConnectLoading(false));
  }, []);

  async function handleSubscribe(plan: string, billing: "monthly" | "annual" = billingCycle) {
    setRedirecting(true);
    try {
      const res = await authFetch("/api/subscribe", {
        method: "POST",
        body: JSON.stringify({ plan, billing }),
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

  async function handleConnectOnboard() {
    setConnectRedirecting(true);
    try {
      const res = await authFetch("/api/stripe-connect/onboard", {
        method: "POST",
        body: JSON.stringify({ accountType: "artist" }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to start payout setup");
        setConnectRedirecting(false);
      }
    } catch {
      alert("Something went wrong. Please try again.");
      setConnectRedirecting(false);
    }
  }

  async function handleConnectDashboard() {
    setConnectRedirecting(true);
    try {
      const res = await authFetch("/api/stripe-connect/dashboard", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to open Stripe dashboard");
        setConnectRedirecting(false);
      }
    } catch {
      alert("Something went wrong. Please try again.");
      setConnectRedirecting(false);
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

      {/* Just-back-from-Stripe confirming banner. Stripe webhooks
          usually settle within 1–3s but can lag, without this
          banner the page renders the stale pre-upgrade state and
          looks like the upgrade failed. */}
      {confirmingUpgrade && (
        <div className="bg-blue-50 border border-blue-200 rounded-sm px-4 py-3 mb-5 flex items-center gap-3">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <p className="text-sm text-blue-700 font-medium">
            Confirming your subscription with Stripe, this usually takes a few seconds.
          </p>
        </div>
      )}
      {planChanged && (
        <div className="bg-green-50 border border-green-200 rounded-sm px-4 py-3 mb-5 flex items-center justify-between">
          <p className="text-sm text-green-700 font-medium">Your plan has been updated successfully.</p>
          <button type="button" onClick={() => setPlanChanged(false)} className="text-green-500 hover:text-green-700 cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* Current plan */}
      {hasSubscription ? (
        <div className="bg-surface border border-border rounded-sm p-6 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-medium">{details.name}</h2>
                {statusBadge(status)}
              </div>
              <p className="text-sm text-muted">
                {details.priceMonthly > 0 ? `\u00a3${details.priceMonthly}/mo or \u00a3${details.priceAnnual}/yr` : "\u2014"} &middot; {details.fee} platform fee on sales
              </p>
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
        /* No active subscription, show plan picker */
        <div className="mb-5">
          {status === "past_due" && (
            <div className="bg-red-50 border border-red-200 rounded-sm px-4 py-3 mb-5 text-sm text-red-700">
              Your last payment failed. Please update your payment method to continue accessing your portal.
              <button type="button" onClick={handleManage} className="ml-2 underline font-medium cursor-pointer">
                Update payment
              </button>
            </div>
          )}
          {status === "canceled" && !confirmingUpgrade && (
            <div className="bg-surface border border-border rounded-sm px-4 py-3 mb-5 text-sm text-muted">
              Your subscription has been canceled. Choose a plan below to reactivate.
            </div>
          )}

          {/* Referral code, item 25 */}
          {sub?.referral_code && (
            <div className="bg-accent/5 border border-accent/20 rounded-sm px-4 py-4 mb-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-accent mb-1">Your referral code</p>
                  <p className="text-sm text-foreground">
                    Refer another artist and get <strong>30 days free</strong> when they upgrade to a paid plan.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="px-3 py-1.5 bg-white border border-border rounded-sm text-sm font-mono tracking-wider text-foreground select-all">
                    {sub.referral_code}
                  </code>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(sub.referral_code || ""); }}
                    className="px-3 py-1.5 text-xs font-medium text-accent border border-accent/30 hover:bg-accent/5 rounded-sm transition-colors cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-lg font-medium">Choose a plan</h2>
            <BillingCycleToggle value={billingCycle} onChange={setBillingCycle} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(["core", "premium", "pro"] as const).map((p) => {
              const d = PLAN_DETAILS[p];
              const isAnnual = billingCycle === "annual";
              const saves = annualSavingsPercent(d.priceMonthly, d.priceAnnual);
              return (
                <div key={p} className="bg-surface border border-border rounded-sm p-5 flex flex-col">
                  <h3 className="text-base font-medium mb-1">{d.name}</h3>
                  <p className="text-lg font-semibold mb-0.5">
                    {isAnnual ? `\u00a3${d.priceAnnual}/yr` : `\u00a3${d.priceMonthly}/mo`}
                  </p>
                  {isAnnual ? (
                    <p className="text-[11px] text-accent mb-3">{annualMonthlyEquivalent(d.priceAnnual)} &middot; save {saves}%</p>
                  ) : (
                    <p className="text-[11px] text-muted mb-3">billed monthly</p>
                  )}
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
            All plans include a 30-day free trial. Annual plans save ~17%.
          </p>
        </div>
      )}

      {/* Change Plan, for active subscribers */}
      {hasSubscription && (
        <div className="bg-surface border border-border rounded-sm p-6 mb-5">
          <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
            <h2 className="text-base font-medium">Change Plan</h2>
            <BillingCycleToggle value={billingCycle} onChange={setBillingCycle} />
          </div>
          <p className="text-sm text-muted mb-5">Upgrade or downgrade anytime. Changes are prorated automatically.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(["core", "premium", "pro"] as const).map((p) => {
              const d = PLAN_DETAILS[p];
              const isCurrent = p === plan;
              const isUpgrade = (["core", "premium", "pro"] as const).indexOf(p) > (["core", "premium", "pro"] as const).indexOf(plan as "core" | "premium" | "pro");
              const isAnnual = billingCycle === "annual";
              const saves = annualSavingsPercent(d.priceMonthly, d.priceAnnual);
              return (
                <div key={p} className={`border rounded-sm p-5 flex flex-col ${isCurrent ? "border-accent bg-accent/5" : "border-border"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-medium">{d.name}</h3>
                    {isCurrent && <span className="text-[10px] font-medium text-accent uppercase tracking-wider">Current</span>}
                  </div>
                  <p className="text-lg font-semibold mb-0.5">
                    {isAnnual ? `\u00a3${d.priceAnnual}/yr` : `\u00a3${d.priceMonthly}/mo`}
                  </p>
                  {isAnnual ? (
                    <p className="text-[11px] text-accent mb-2">{annualMonthlyEquivalent(d.priceAnnual)} &middot; save {saves}%</p>
                  ) : (
                    <p className="text-[11px] text-muted mb-2">billed monthly</p>
                  )}
                  <p className="text-xs text-muted mb-2">{d.fee} platform fee</p>
                  <ul className="text-xs text-muted space-y-1 mb-4 flex-1">
                    {p === "core" && <><li>Up to 8 works</li><li>Standard profile</li><li>Basic analytics</li></>}
                    {p === "premium" && <><li>Up to 20 works</li><li>Featured profile + badge</li><li>Message venues directly</li><li>Full analytics</li></>}
                    {p === "pro" && <><li>Unlimited works</li><li>Premium profile</li><li>Message venues directly</li><li>Dedicated support</li></>}
                  </ul>
                  {isCurrent ? (
                    <div className="w-full py-2.5 text-sm font-medium text-center text-accent border border-accent/30 rounded-sm">
                      Current Plan
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSubscribe(p)}
                      disabled={redirecting}
                      className={`w-full py-2.5 text-sm font-medium rounded-sm transition-colors cursor-pointer disabled:opacity-50 ${
                        isUpgrade
                          ? "bg-accent text-white hover:bg-accent-hover"
                          : "bg-foreground/10 text-foreground hover:bg-foreground/20"
                      }`}
                    >
                      {redirecting ? "Redirecting..." : isUpgrade ? `Upgrade to ${d.name}` : `Switch to ${d.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment & Invoices */}
      {hasSubscription && (
        <div className="bg-surface border border-border rounded-sm p-6">
          <h2 className="text-base font-medium mb-3">Payment & Invoices</h2>
          <p className="text-sm text-muted mb-4">
            Manage your payment method, view invoices, and update billing details through Stripe.
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

      {/* Payouts */}
      <div className="bg-surface border border-border rounded-sm p-6">
        <h2 className="text-base font-medium mb-3">Payouts</h2>
        {connectLoading ? (
          <p className="text-sm text-muted">Loading payout status...</p>
        ) : connectStatus?.onboardingComplete ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                Payouts Active
              </span>
            </div>
            <p className="text-sm text-muted mb-4">
              Your payout account is connected. Earnings from sales will be transferred automatically.
            </p>
            <button
              type="button"
              onClick={handleConnectDashboard}
              disabled={connectRedirecting}
              className="px-4 py-2 text-sm font-medium bg-foreground text-background rounded-sm hover:bg-foreground/90 transition-colors cursor-pointer disabled:opacity-50"
            >
              {connectRedirecting ? "Opening..." : "Open Stripe Dashboard"}
            </button>
          </>
        ) : connectStatus?.hasAccount ? (
          <>
            <p className="text-sm text-muted mb-4">
              Complete your payout setup to start receiving transfers.
            </p>
            <button
              type="button"
              onClick={handleConnectOnboard}
              disabled={connectRedirecting}
              className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              {connectRedirecting ? "Redirecting..." : "Continue Setup"}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted mb-4">
              Set up payouts to receive earnings directly to your bank account.
            </p>
            <button
              type="button"
              onClick={handleConnectOnboard}
              disabled={connectRedirecting}
              className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              {connectRedirecting ? "Redirecting..." : "Set Up Payouts"}
            </button>
          </>
        )}
      </div>
    </ArtistPortalLayout>
  );
}

function BillingCycleToggle({
  value,
  onChange,
}: {
  value: "monthly" | "annual";
  onChange: (v: "monthly" | "annual") => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 bg-background border border-border rounded-sm text-xs">
      <button
        type="button"
        onClick={() => onChange("monthly")}
        className={`px-3 py-1.5 rounded-sm transition-colors ${
          value === "monthly" ? "bg-foreground text-white" : "text-muted hover:text-foreground"
        }`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange("annual")}
        className={`px-3 py-1.5 rounded-sm transition-colors inline-flex items-center gap-1.5 ${
          value === "annual" ? "bg-foreground text-white" : "text-muted hover:text-foreground"
        }`}
      >
        Annual
        <span className={`px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider ${
          value === "annual" ? "bg-white/15 text-white" : "bg-accent/10 text-accent"
        }`}>
          Save 17%
        </span>
      </button>
    </div>
  );
}
