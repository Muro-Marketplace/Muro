"use client";

import { useState, useEffect } from "react";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import AccountDangerZone from "@/components/AccountDangerZone";
import PayoutExplainerModal from "@/components/PayoutExplainerModal";
import { useCurrentVenue } from "@/hooks/useCurrentVenue";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";
import {
  useNotificationPrefs,
  type NotificationPrefField,
} from "@/lib/use-notification-prefs";

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded-sm">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-serif text-base text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  defaultValue,
  type = "text",
}: {
  label: string;
  defaultValue: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted mb-1">
        {label}
      </label>
      <input
        type={type}
        defaultValue={defaultValue}
        className="w-full px-3 py-2 border border-border rounded-sm text-sm text-foreground bg-background focus:outline-none focus:border-accent/50 transition-colors"
      />
    </div>
  );
}

const NOTIF_ROWS: { id: NotificationPrefField; label: string; desc: string }[] = [
  {
    id: "order_notifications_enabled",
    label: "Order updates",
    desc: "Shipping and delivery notifications for your orders",
  },
  {
    id: "message_notifications_enabled",
    label: "Message notifications",
    desc: "Email when you receive a new message",
  },
  {
    id: "email_digest_enabled",
    label: "Wallplace news & digest",
    desc: "Platform announcements and feature launches",
  },
];

interface ConnectStatus {
  hasAccount: boolean;
  onboardingComplete?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
}

export default function VenueSettingsPage() {
  const { venue, loading: venueLoading } = useCurrentVenue();
  const { user } = useAuth();
  const { prefs, togglePref, error: prefsError } = useNotificationPrefs(user);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(true);
  const [connectRedirecting, setConnectRedirecting] = useState(false);

  // Fetch Stripe Connect status
  useEffect(() => {
    authFetch("/api/stripe-connect/status")
      .then((res) => res.json())
      .then((data) => setConnectStatus(data))
      .catch(() => {})
      .finally(() => setConnectLoading(false));
  }, []);

  async function handleConnectOnboard() {
    setConnectRedirecting(true);
    try {
      const res = await authFetch("/api/stripe-connect/onboard", {
        method: "POST",
        body: JSON.stringify({ accountType: "venue" }),
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

  return (
    <VenuePortalLayout>
      <div className="mb-6">
        <h1 className="font-serif text-2xl lg:text-3xl text-foreground mb-1">
          Settings
        </h1>
        <p className="text-sm text-muted">
          Manage your account details and notification preferences.
        </p>
      </div>

      <div className="space-y-5 max-w-2xl">
        {/* Account details. We gate the form render on the venue
            fetch completing because `Field` is an uncontrolled input
            using `defaultValue`, so it captures whatever venue?.name
            resolved to on first render. Previously that was the
            "Your Venue" fallback (venue still loading) and the field
            never refreshed, even after the actual name arrived. Keys
            on the section also force a remount in the rare case a
            user re-fetches their profile while the page is open. */}
        <SectionCard title="Account Details">
          <div className="space-y-4" key={venue?.slug || "venue-loading"}>
            {venueLoading ? (
              <p className="text-sm text-muted">Loading account details…</p>
            ) : (
              <>
                <Field label="Venue Name" defaultValue={venue?.name || "Your Venue"} />
                <Field
                  label="Email Address"
                  defaultValue={user?.email || ""}
                  type="email"
                />
                <Field label="Phone Number" defaultValue="" type="tel" />
                <div className="pt-2">
                  <label className="block text-xs font-medium text-muted mb-1">
                    Password
                  </label>
                  <a
                    href="/forgot-password"
                    className="text-sm text-accent hover:underline cursor-pointer"
                  >
                    Change password
                  </a>
                </div>
              </>
            )}
          </div>
        </SectionCard>

        {/* Notification preferences */}
        <SectionCard title="Notification Preferences">
          <div className="space-y-4">
            {NOTIF_ROWS.map((notif) => (
              <label
                key={notif.id}
                className="flex items-start gap-3 cursor-pointer group"
              >
                <span
                  className={`mt-0.5 w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors duration-150 ${
                    prefs[notif.id]
                      ? "bg-accent border-accent"
                      : "border-border group-hover:border-muted"
                  }`}
                  onClick={() => togglePref(notif.id)}
                >
                  {prefs[notif.id] && (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="1.5 5 4 7.5 8.5 2.5" />
                    </svg>
                  )}
                </span>
                <div>
                  <p className="text-sm text-foreground">{notif.label}</p>
                  <p className="text-xs text-muted mt-0.5">{notif.desc}</p>
                </div>
              </label>
            ))}
          </div>
          {prefsError && (
            <p className="text-xs text-red-500 mt-4">{prefsError}</p>
          )}
          <p className="text-xs text-muted mt-4">Changes save automatically.</p>
        </SectionCard>

        {/* Payouts */}
        <SectionCard title="Payouts">
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
                Your payout account is connected. Revenue share from sales will be transferred automatically.
              </p>
              <button
                type="button"
                onClick={handleConnectDashboard}
                disabled={connectRedirecting}
                className="px-4 py-2 text-sm font-medium bg-foreground text-white rounded-sm hover:bg-foreground/90 transition-colors cursor-pointer disabled:opacity-50"
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
                className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50"
              >
                {connectRedirecting ? "Redirecting..." : "Continue Setup"}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted mb-4">
                Set up payouts to receive your revenue share directly to your bank account.
              </p>
              <button
                type="button"
                onClick={handleConnectOnboard}
                disabled={connectRedirecting}
                className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50"
              >
                {connectRedirecting ? "Redirecting..." : "Set Up Payouts"}
              </button>
            </>
          )}
        </SectionCard>

        <AccountDangerZone />
      </div>

      {/* One-shot payout-timing explainer. Same component the artist
          billing page mounts; the `audience` flag swaps in the venue
          copy (placement-orders, revenue share, etc.). Dismiss is
          persisted in localStorage so subsequent visits stay clean. */}
      <PayoutExplainerModal
        audience="venue"
        userId={user?.id}
        active={!!connectStatus?.onboardingComplete}
      />
    </VenuePortalLayout>
  );
}
