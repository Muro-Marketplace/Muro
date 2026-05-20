"use client";

import { useState } from "react";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import AccountDangerZone from "@/components/AccountDangerZone";
import Button from "@/components/Button";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  useNotificationPrefs,
  type NotificationPrefField,
} from "@/lib/use-notification-prefs";

const NOTIF_ROWS: { id: NotificationPrefField; label: string; description: string }[] = [
  {
    id: "order_notifications_enabled",
    label: "Order & sale notifications",
    description: "When a piece sells or an order ships",
  },
  {
    id: "message_notifications_enabled",
    label: "Message notifications",
    description: "Email when you receive a new message",
  },
  {
    id: "email_digest_enabled",
    label: "Email digest",
    description: "Newsletter, tips and Wallplace updates",
  },
];

export default function SettingsPage() {
  const { user, displayName } = useAuth();
  const { prefs, togglePref, error: prefsError } = useNotificationPrefs(user);

  const [name, setName] = useState(displayName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountError, setAccountError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  async function handleAccountSave(e: React.FormEvent) {
    e.preventDefault();
    setAccountError("");
    setAccountSaved(false);

    const { error } = await supabase.auth.updateUser({
      data: { display_name: name },
    });

    if (error) {
      setAccountError("Failed to update. Please try again.");
      return;
    }

    setAccountSaved(true);
    setTimeout(() => setAccountSaved(false), 3000);
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSaved(false);

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setPasswordError(error.message || "Failed to update password");
      return;
    }

    setPasswordSaved(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => setPasswordSaved(false), 3000);
  }

  return (
    <ArtistPortalLayout activePath="/artist-portal/settings">
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl">Settings</h1>
      </div>

      {/* Account Details */}
      <div className="bg-surface border border-border rounded-sm p-6 mb-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-medium">Account Details</h2>
        </div>
        <form onSubmit={handleAccountSave} className="space-y-4 max-w-md">
          <div>
            <label htmlFor="name" className="block text-sm text-muted mb-1.5">Full name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setAccountSaved(false); }}
              className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm text-muted mb-1.5">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              disabled
              className="w-full border border-border rounded-sm px-3 py-2 text-sm text-muted bg-background/50 cursor-not-allowed"
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted mt-1">Contact support to change your email.</p>
          </div>
          {accountError && <p className="text-sm text-red-500">{accountError}</p>}
          {accountSaved && <p className="text-sm text-green-600">Saved!</p>}
          <div className="pt-1">
            <Button type="submit" variant="primary" size="sm">Save Changes</Button>
          </div>
        </form>
      </div>

      {/* Notification Preferences */}
      <div className="bg-surface border border-border rounded-sm p-6 mb-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-medium">Notification Preferences</h2>
        </div>
        <div className="space-y-4">
          {NOTIF_ROWS.map((notif) => (
            <div key={notif.id} className="flex items-start justify-between gap-4 py-1">
              <div>
                <p className="text-sm font-medium text-foreground leading-snug">{notif.label}</p>
                <p className="text-xs text-muted mt-0.5">{notif.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[notif.id]}
                onClick={() => togglePref(notif.id)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none mt-0.5 ${
                  prefs[notif.id] ? "bg-accent" : "bg-border"
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5 ${
                  prefs[notif.id] ? "translate-x-4" : "translate-x-0.5"
                }`} />
              </button>
            </div>
          ))}
        </div>
        {prefsError && (
          <p className="text-xs text-red-500 mt-4">{prefsError}</p>
        )}
        <p className="text-xs text-muted mt-4">Changes save automatically.</p>
      </div>

      {/* Password Change */}
      <div className="bg-surface border border-border rounded-sm p-6 mb-5">
        <h2 className="text-base font-medium mb-5">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
          <div>
            <label htmlFor="current_password" className="block text-sm text-muted mb-1.5">Current password</label>
            <input id="current_password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••"
              className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:border-accent/50 transition-colors" />
          </div>
          <div>
            <label htmlFor="new_password" className="block text-sm text-muted mb-1.5">New password (min 8 characters)</label>
            <input id="new_password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" minLength={8}
              className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:border-accent/50 transition-colors" />
          </div>
          <div>
            <label htmlFor="confirm_password" className="block text-sm text-muted mb-1.5">Confirm new password</label>
            <input id="confirm_password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••"
              className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:border-accent/50 transition-colors" />
          </div>
          {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
          {passwordSaved && <p className="text-sm text-green-600">Password updated!</p>}
          <div className="pt-1">
            <Button type="submit" variant="primary" size="sm">Update Password</Button>
          </div>
        </form>
      </div>

      <AccountDangerZone />
    </ArtistPortalLayout>
  );
}
