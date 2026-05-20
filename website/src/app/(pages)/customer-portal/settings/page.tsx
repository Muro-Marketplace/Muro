"use client";

import { useState } from "react";
import CustomerPortalLayout from "@/components/CustomerPortalLayout";
import AccountDangerZone from "@/components/AccountDangerZone";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useNotificationPrefs } from "@/lib/use-notification-prefs";

const PREF_LABELS: { key: "order_notifications_enabled" | "message_notifications_enabled" | "email_digest_enabled"; label: string }[] = [
  { key: "order_notifications_enabled", label: "Order updates" },
  { key: "message_notifications_enabled", label: "Messages from artists & venues" },
  { key: "email_digest_enabled", label: "Newsletter & digest" },
];

export default function CustomerSettingsPage() {
  const { user, displayName } = useAuth();
  const { prefs, togglePref, error: prefsError } = useNotificationPrefs(user);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handlePasswordReset() {
    if (!user?.email) return;
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (!error) setResetSent(true);
  }

  return (
    <CustomerPortalLayout>
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl">Settings</h1>
        <p className="text-sm text-muted mt-1">Manage your account and preferences</p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Account Details */}
        <div className="bg-surface border border-border rounded-sm p-6">
          <h2 className="text-base font-medium mb-4">Account Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-muted uppercase tracking-wider mb-1">Name</label>
              <p className="text-sm text-foreground bg-background border border-border rounded-sm px-3 py-2">
                {displayName || "Not set"}
              </p>
            </div>
            <div>
              <label className="block text-xs text-muted uppercase tracking-wider mb-1">Email</label>
              <p className="text-sm text-foreground bg-background border border-border rounded-sm px-3 py-2">
                {user?.email || "Not set"}
              </p>
            </div>
            <div>
              <label className="block text-xs text-muted uppercase tracking-wider mb-1">Password</label>
              {resetSent ? (
                <p className="text-sm text-accent">Password reset email sent. Check your inbox.</p>
              ) : (
                <button
                  onClick={handlePasswordReset}
                  disabled={resetLoading}
                  className="text-sm text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
                >
                  {resetLoading ? "Sending..." : "Change Password"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="bg-surface border border-border rounded-sm p-6">
          <h2 className="text-base font-medium mb-4">Notification Preferences</h2>
          <div className="space-y-3">
            {PREF_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={() => togglePref(key)}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent/30"
                />
                <span className="text-sm text-foreground">{label}</span>
              </label>
            ))}
          </div>
          {prefsError && (
            <p className="text-xs text-red-500 mt-3">{prefsError}</p>
          )}
        </div>

        <AccountDangerZone />
      </div>
    </CustomerPortalLayout>
  );
}
