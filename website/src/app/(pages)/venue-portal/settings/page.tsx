"use client";

import { useState, useEffect } from "react";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { useCurrentVenue } from "@/hooks/useCurrentVenue";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

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

interface NotifPref {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
}

const defaultNotifs: NotifPref[] = [
  {
    id: "enquiry_responses",
    label: "Enquiry responses",
    desc: "When an artist responds to one of your enquiries",
    checked: true,
  },
  {
    id: "new_matches",
    label: "New artwork matches",
    desc: "When new works matching your preferences are added",
    checked: true,
  },
  {
    id: "order_updates",
    label: "Order updates",
    desc: "Shipping and delivery notifications for your orders",
    checked: true,
  },
  {
    id: "wallplace_news",
    label: "Wallplace news & updates",
    desc: "Platform announcements and feature launches",
    checked: false,
  },
  {
    id: "promotions",
    label: "Promotions & offers",
    desc: "Discounts and special deals from Wallplace",
    checked: false,
  },
];

interface ConnectStatus {
  hasAccount: boolean;
  onboardingComplete?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
}

export default function VenueSettingsPage() {
  const { venue } = useCurrentVenue();
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<NotifPref[]>(defaultNotifs);
  const [saved, setSaved] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [messageNotifsEnabled, setMessageNotifsEnabled] = useState(true);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(true);
  const [connectRedirecting, setConnectRedirecting] = useState(false);

  // Load message notification preference from DB
  useEffect(() => {
    authFetch("/api/venue-profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile?.message_notifications_enabled !== undefined) {
          setMessageNotifsEnabled(data.profile.message_notifications_enabled);
        }
      })
      .catch(() => {});
  }, []);

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

  const toggleNotif = (id: string) => {
    setNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, checked: !n.checked } : n))
    );
  };

  const handleSave = () => {
    localStorage.setItem("wallplace-venue-notif-prefs", JSON.stringify(notifs));
    // Persist message notification preference to DB
    authFetch("/api/venue-profile", {
      method: "PUT",
      body: JSON.stringify({ message_notifications_enabled: messageNotifsEnabled }),
    }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

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
        {/* Account details */}
        <SectionCard title="Account Details">
          <div className="space-y-4">
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
          </div>
        </SectionCard>

        {/* Notification preferences */}
        <SectionCard title="Notification Preferences">
          <div className="space-y-4">
            {/* Message notifications — persisted to DB */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <span
                className={`mt-0.5 w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors duration-150 ${
                  messageNotifsEnabled ? "bg-accent border-accent" : "border-border group-hover:border-muted"
                }`}
                onClick={() => setMessageNotifsEnabled(!messageNotifsEnabled)}
              >
                {messageNotifsEnabled && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                )}
              </span>
              <div>
                <p className="text-sm text-foreground">Message notifications</p>
                <p className="text-xs text-muted mt-0.5">Email when you receive a new message</p>
              </div>
            </label>
            <div className="border-t border-border" />
            {notifs.map((notif) => (
              <label
                key={notif.id}
                className="flex items-start gap-3 cursor-pointer group"
              >
                <span
                  className={`mt-0.5 w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors duration-150 ${
                    notif.checked
                      ? "bg-accent border-accent"
                      : "border-border group-hover:border-muted"
                  }`}
                  onClick={() => toggleNotif(notif.id)}
                >
                  {notif.checked && (
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
          <div className="pt-4 border-t border-border mt-4 flex items-center gap-3">
            <button type="button" onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors">Save Preferences</button>
            {saved && <span className="text-sm text-green-600">Saved!</span>}
          </div>
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

        {/* Save button */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 bg-foreground text-white text-sm font-medium rounded-sm hover:bg-foreground/90 transition-colors cursor-pointer"
          >
            Save Changes
          </button>
          {saved && (
            <span className="text-sm text-green-600 flex items-center gap-1.5">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Changes saved
            </span>
          )}
        </div>

        {/* Danger zone */}
        <div className="bg-white border border-red-100 rounded-sm">
          <div className="px-5 py-4 border-b border-red-100">
            <h2 className="font-serif text-base text-red-700">Danger Zone</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-muted mb-4">
              Permanently delete your account and all associated data. This
              action cannot be undone.
            </p>
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-5 py-2 border border-red-300 text-red-600 text-sm rounded-sm hover:bg-red-50 transition-colors cursor-pointer"
              >
                Delete Account
              </button>
            ) : (
              <div className="p-4 bg-red-50 border border-red-200 rounded-sm">
                <p className="text-sm font-medium text-red-700 mb-3">
                  Are you sure? This will permanently delete your account.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-sm hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    Yes, delete my account
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-4 py-2 border border-border text-muted text-sm rounded-sm hover:text-foreground transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </VenuePortalLayout>
  );
}
