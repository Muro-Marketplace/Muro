"use client";

import { useState, useEffect } from "react";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import AccountDangerZone from "@/components/AccountDangerZone";
import PayoutExplainerModal from "@/components/PayoutExplainerModal";
import { useCurrentVenue } from "@/hooks/useCurrentVenue";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { authFetch, mutate, ApiError } from "@/lib/api-client";
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
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-border rounded-sm text-sm text-foreground bg-background focus:outline-none focus:border-accent/50 transition-colors"
      />
    </div>
  );
}

/** The contact-PII slice of the venue profile this page edits. All six
 *  columns are on VENUE_PROFILE_WRITABLE; the venue-profile PUT allowlist
 *  drops anything else. */
interface ContactDetails {
  contact_name: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postcode: string;
}

const EMPTY_CONTACT: ContactDetails = {
  contact_name: "",
  phone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  postcode: "",
};

// E14: no "Order updates" row here. venue_profiles has no
// order_notifications_enabled column, so the toggle could never persist —
// every click PATCHed a missing column, failed, and reverted with an error.
// Rather than show a control that cannot work, venues simply do not get it
// until the column exists.
const NOTIF_ROWS: { id: NotificationPrefField; label: string; desc: string }[] = [
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
  const { showToast } = useToast();
  const { prefs, togglePref, error: prefsError } = useNotificationPrefs(user);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(true);
  const [connectRedirecting, setConnectRedirecting] = useState(false);

  // E10/E12 (QA 2026-08-28): the Account Details card used to be three
  // uncontrolled inputs with no save path, so a venue could not correct
  // their contact name, phone or address anywhere in the portal. The
  // contact fields load from the raw venue profile (the useCurrentVenue
  // transform deliberately strips contact PII, so we read data.profile
  // directly) and save through the venue-profile PUT allowlist.
  const [contact, setContact] = useState<ContactDetails>(EMPTY_CONTACT);
  const [contactLoading, setContactLoading] = useState(true);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/venue-profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.profile) return;
        const p = data.profile as Partial<Record<keyof ContactDetails, string | null>>;
        setContact({
          contact_name: p.contact_name || "",
          phone: p.phone || "",
          address_line1: p.address_line1 || "",
          address_line2: p.address_line2 || "",
          city: p.city || "",
          postcode: p.postcode || "",
        });
      })
      .catch(() => {
        /* fields start empty; a failed save will surface the real error */
      })
      .finally(() => {
        if (!cancelled) setContactLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setContactField(field: keyof ContactDetails, value: string) {
    setContact((prev) => ({ ...prev, [field]: value }));
    setContactSaved(false);
  }

  async function handleContactSave() {
    setContactSaving(true);
    try {
      await mutate("/api/venue-profile", {
        method: "PUT",
        body: JSON.stringify({
          contact_name: contact.contact_name || null,
          phone: contact.phone || null,
          address_line1: contact.address_line1 || null,
          address_line2: contact.address_line2 || null,
          city: contact.city || null,
          postcode: contact.postcode || null,
        }),
      });
      setContactSaved(true);
    } catch (err) {
      showToast(
        err instanceof ApiError
          ? err.message || "Failed to save account details. Please try again."
          : "Failed to save. Please check your connection.",
        { variant: "error" },
      );
    } finally {
      setContactSaving(false);
    }
  }

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
      // Returns a Stripe account-onboarding link (payout ACCOUNT setup / KYC), not a
      // money movement. mutate throws on a non-2xx; a 2xx without a url is still a failure.
      const data = await mutate<{ url?: string }>("/api/stripe-connect/onboard", {
        method: "POST",
        body: JSON.stringify({ accountType: "venue" }),
      });
      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast("Failed to start payout setup", { variant: "error" });
        setConnectRedirecting(false);
      }
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.code || "Failed to start payout setup" : "Something went wrong. Please try again.",
        { variant: "error" },
      );
      setConnectRedirecting(false);
    }
  }

  async function handleConnectDashboard() {
    setConnectRedirecting(true);
    try {
      // Returns a Stripe Express dashboard login link (access, not a money movement).
      const data = await mutate<{ url?: string }>("/api/stripe-connect/dashboard", { method: "POST" });
      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast("Failed to open Stripe dashboard", { variant: "error" });
        setConnectRedirecting(false);
      }
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.code || "Failed to open Stripe dashboard" : "Something went wrong. Please try again.",
        { variant: "error" },
      );
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
        {/* Account details (E10/E12). Venue name is edited on the Venue
            Profile page and the account email is the sign-in identity, so
            both render read-only here; the contact fields below are the
            real, saveable form. */}
        <SectionCard title="Account Details">
          <div className="space-y-4">
            {venueLoading || contactLoading ? (
              <p className="text-sm text-muted">Loading account details…</p>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Venue Name
                  </label>
                  <p className="text-sm text-foreground">{venue?.name || "Your Venue"}</p>
                  <p className="text-[11px] text-muted mt-1">
                    Change your venue name on the{" "}
                    <a href="/venue-portal/profile" className="text-accent hover:underline">
                      Venue Profile
                    </a>{" "}
                    page.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Email Address
                  </label>
                  <p className="text-sm text-foreground">{user?.email || "Not set"}</p>
                  <p className="text-[11px] text-muted mt-1">
                    This is the address you sign in with.
                  </p>
                </div>
                <Field
                  label="Contact Name"
                  value={contact.contact_name}
                  onChange={(v) => setContactField("contact_name", v)}
                  placeholder="Who should artists ask for?"
                />
                <Field
                  label="Phone Number"
                  value={contact.phone}
                  onChange={(v) => setContactField("phone", v)}
                  type="tel"
                  placeholder="e.g. 020 7123 4567"
                />
                <Field
                  label="Address Line 1"
                  value={contact.address_line1}
                  onChange={(v) => setContactField("address_line1", v)}
                  placeholder="Street address"
                />
                <Field
                  label="Address Line 2"
                  value={contact.address_line2}
                  onChange={(v) => setContactField("address_line2", v)}
                  placeholder="Optional"
                />
                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label="City"
                    value={contact.city}
                    onChange={(v) => setContactField("city", v)}
                  />
                  <Field
                    label="Postcode"
                    value={contact.postcode}
                    onChange={(v) => setContactField("postcode", v)}
                  />
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleContactSave}
                    disabled={contactSaving}
                    className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {contactSaving ? "Saving..." : "Save Details"}
                  </button>
                  {contactSaved && <span className="text-sm text-green-600">Saved</span>}
                </div>
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
