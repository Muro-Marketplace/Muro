"use client";

// useNotificationPrefs — shared hook for notification preferences across all
// three portal settings pages (customer / artist / venue).
//
// The hook is the single client-side touchpoint for /api/account/preferences:
//   - GET  /api/account/preferences on mount → seeds local state.
//   - PATCH /api/account/preferences on toggle, with optimistic update +
//     revert-on-failure so rapid double-toggles don't desync.
//
// Capturing the previous prefs on optimistic updates uses a setState updater
// so back-to-back toggles snapshot the freshest state (not a stale render).
//
// The three settings pages used to persist these prefs in localStorage,
// which meant clearing browser data wiped the user's preferences. With this
// hook, the server is the source of truth.

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { authFetch } from "@/lib/api-client";

export const PREF_FIELDS = [
  "email_digest_enabled",
  "message_notifications_enabled",
  "order_notifications_enabled",
] as const;

export type NotificationPrefField = (typeof PREF_FIELDS)[number];

export type NotificationPrefs = Record<NotificationPrefField, boolean>;

export const DEFAULT_PREFS: NotificationPrefs = {
  email_digest_enabled: true,
  message_notifications_enabled: true,
  order_notifications_enabled: true,
};

export interface UseNotificationPrefs {
  prefs: NotificationPrefs;
  togglePref: (field: NotificationPrefField) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useNotificationPrefs(user: User | null): UseNotificationPrefs {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current prefs once we know who the user is. If the request fails
  // we silently keep the opt-in defaults — the user can still toggle, and
  // the next PATCH will surface a real error.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    authFetch("/api/account/preferences")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { preferences?: Partial<NotificationPrefs> }) => {
        if (cancelled) return;
        if (data.preferences) {
          setPrefs((prev) => ({ ...prev, ...data.preferences }));
        }
      })
      .catch(() => {
        // Silent — UI shows opt-in defaults until a write reveals the issue.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const togglePref = useCallback(
    async (field: NotificationPrefField) => {
      // Snapshot the current value so we can revert if the PATCH fails.
      // Using the updater form avoids a stale closure when the user
      // toggles rapidly.
      let previousValue: boolean = DEFAULT_PREFS[field];
      let nextValue: boolean = !previousValue;
      setPrefs((current) => {
        previousValue = current[field];
        nextValue = !previousValue;
        return { ...current, [field]: nextValue };
      });
      setError(null);
      try {
        const res = await authFetch("/api/account/preferences", {
          method: "PATCH",
          body: JSON.stringify({ [field]: nextValue }),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch {
        // Revert just this field — leave any other in-flight toggles alone.
        setPrefs((current) => ({ ...current, [field]: previousValue }));
        setError("Could not save preference. Please try again.");
      }
    },
    [],
  );

  return { prefs, togglePref, loading, error };
}
