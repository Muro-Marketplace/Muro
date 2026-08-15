"use client";

// Email preferences hub linked from every transactional email's footer.
// Lives at /account/email so the footer URLs in EmailShell.tsx resolve
// (previously 404'd). Authenticated; users need to sign in to see /
// change their own preferences. The category checkboxes mirror the
// email_preferences columns plus the master "pause non-critical" mode.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authFetch, mutate } from "@/lib/api-client";

interface PrefsRow {
  placements_enabled: boolean;
  messages_enabled: boolean;
  digests_enabled: boolean;
  recommendations_enabled: boolean;
  tips_enabled: boolean;
  newsletter_enabled: boolean;
  promotions_enabled: boolean;
  digest_frequency: "daily" | "weekly" | "off";
  vacation_until: string | null;
}

const FIELDS: { key: keyof PrefsRow; label: string; description: string }[] = [
  { key: "placements_enabled",      label: "Placement updates",     description: "New placement requests, accepted/declined responses, status changes." },
  { key: "messages_enabled",        label: "Messages",              description: "Someone sent you a message on Wallplace." },
  { key: "digests_enabled",         label: "Weekly digests",        description: "Performance summary and new matches for your space or portfolio." },
  { key: "recommendations_enabled", label: "Recommendations",       description: "New work from artists you follow and curated matches for your venue." },
  { key: "tips_enabled",            label: "Tips and updates",      description: "Product changes, occasional how-to content. Low frequency." },
  { key: "newsletter_enabled",      label: "Newsletter",            description: "Monthly editorial. Double opt-in." },
  { key: "promotions_enabled",      label: "Promotions",            description: "Special offers and sales. Opt-in only." },
];

export default function EmailPreferencesPage() {
  const { user, loading } = useAuth();
  const [prefs, setPrefs] = useState<PrefsRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    authFetch("/api/account/email-preferences")
      .then((r) => r.json())
      .then((data) => { if (!cancelled && data?.preferences) setPrefs(data.preferences); })
      .catch(() => { if (!cancelled) setError("Could not load your preferences. Please retry."); });
    return () => { cancelled = true; };
  }, [loading, user]);

  async function update(partial: Partial<PrefsRow>) {
    if (!prefs) return;
    const next = { ...prefs, ...partial };
    setPrefs(next);
    setError(null);
    try {
      // mutate throws on a non-2xx or a dropped request, so the manual
      // `if (!res.ok) throw` collapses into the existing catch.
      await mutate("/api/account/email-preferences", {
        method: "PATCH",
        body: JSON.stringify(partial),
      });
      setSavedAt(Date.now());
    } catch {
      setError("Could not save. Try again.");
    }
  }

  if (loading) {
    return (
      <div className="bg-background">
        <section className="py-20 lg:py-24">
          <div className="max-w-[640px] mx-auto px-6">
            <p className="text-muted text-sm">Loading…</p>
          </div>
        </section>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-background">
        <section className="py-20 lg:py-24">
          <div className="max-w-[640px] mx-auto px-6">
            <h1 className="text-3xl lg:text-4xl mb-4">Email preferences</h1>
            <p className="text-muted leading-relaxed mb-6">
              Sign in to manage which emails Wallplace sends you.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent("/account/email")}`}
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
            >
              Sign in
            </Link>
            <p className="text-xs text-muted mt-6">
              Looking to unsubscribe from a single email?{" "}
              <Link href="/account/email/unsubscribe" className="text-accent hover:underline">Use the link in your most recent email</Link>
              {" "}so we know which category to turn off.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[640px] mx-auto px-6">
          <h1 className="text-3xl lg:text-4xl mb-2">Email preferences</h1>
          <p className="text-muted leading-relaxed mb-10">
            Pick what you want to hear about. Order receipts, password resets, and legal notices always send, you can&rsquo;t turn those off.
          </p>

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          {!prefs ? (
            <p className="text-sm text-muted">Loading your preferences…</p>
          ) : (
            <>
              <ul className="divide-y divide-border border border-border rounded-sm">
                {FIELDS.map(({ key, label, description }) => {
                  const value = prefs[key] as boolean;
                  return (
                    <li key={key} className="flex items-start justify-between gap-4 px-5 py-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        <p className="text-xs text-muted leading-relaxed mt-1 max-w-md">{description}</p>
                      </div>
                      <label className="inline-flex items-center cursor-pointer mt-1">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={value}
                          onChange={(e) => update({ [key]: e.target.checked } as Partial<PrefsRow>)}
                        />
                        <span className="relative w-10 h-5 bg-foreground/15 rounded-full transition-colors peer-checked:bg-accent">
                          <span className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-10 border-t border-border pt-6">
                <p className="text-sm font-medium text-foreground mb-2">Pause non-critical email</p>
                <p className="text-xs text-muted leading-relaxed mb-3 max-w-md">
                  On holiday, or just need a break? Set a date and we&rsquo;ll hold everything except order, payout, security, and legal emails until then.
                </p>
                <input
                  type="date"
                  className="px-3 py-2 text-sm border border-border rounded-sm bg-background"
                  value={prefs.vacation_until ? prefs.vacation_until.split("T")[0] : ""}
                  onChange={(e) => update({ vacation_until: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
                {prefs.vacation_until && (
                  <button
                    type="button"
                    onClick={() => update({ vacation_until: null })}
                    className="ml-3 text-xs text-muted hover:text-foreground underline"
                  >
                    Clear
                  </button>
                )}
              </div>

              {savedAt && (
                <p className="text-xs text-muted mt-6">
                  Saved {new Date(savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
