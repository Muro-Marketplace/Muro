"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { authFetch } from "@/lib/api-client";
import type { SavedItem } from "@/lib/types";

interface SavedContextValue {
  savedItems: SavedItem[];
  toggleSaved: (type: "work" | "collection" | "artist", id: string) => void;
  isSaved: (type: "work" | "collection" | "artist", id: string) => boolean;
  savedCount: number;
  clearSaved: () => void;
}

const STORAGE_KEY = "wallplace-saved";

const SavedContext = createContext<SavedContextValue | null>(null);

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const hasMounted = useRef(false);
  const hasSynced = useRef(false);

  // On mount or when user changes: load items from the right source.
  //
  // Important, the previous version auto-merged localStorage entries
  // into the authenticated user's DB on login. That meant a logged-out
  // shopper saving a few works, then signing in as a *venue*, would
  // see those works appear "saved" on the venue account even though
  // the venue had never explicitly saved them. Anyone using a shared
  // browser hit this. Fix: localStorage is for guests only, and gets
  // wiped the moment a user signs in. The server is the only source
  // of truth for authenticated saved state. Items from a guest
  // session do NOT migrate into the user's account.
  useEffect(() => {
    if (user) {
      // Wipe any guest-session localStorage immediately so a later
      // sign-out doesn't briefly resurrect a different user's saves.
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore quota / Safari private mode */
      }
      hasSynced.current = true;

      authFetch("/api/saved")
        .then((r) => r.json())
        .then((data) => {
          if (data.items) {
            const dbItems: SavedItem[] = data.items.map(
              (row: { item_type: string; item_id: string; created_at: string }) => ({
                type: row.item_type as SavedItem["type"],
                id: row.item_id,
                savedAt: row.created_at,
              }),
            );
            setSavedItems(dbItems);
          } else {
            setSavedItems([]);
          }
        })
        .catch(() => {});
    } else {
      // Guest session, restore from localStorage (their own saves).
      hasSynced.current = false;
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          setSavedItems(JSON.parse(stored));
        } catch {
          /* ignore */
        }
      } else {
        setSavedItems([]);
      }
    }
    hasMounted.current = true;
  }, [user]);

  // Persist to localStorage only when NOT authenticated
  useEffect(() => {
    if (hasMounted.current && !user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedItems));
    }
  }, [savedItems, user]);

  const toggleSaved = useCallback(
    (type: "work" | "collection" | "artist", id: string) => {
      const exists = savedItems.find((s) => s.type === type && s.id === id);

      const label = type === "collection" ? "Collection" : type === "artist" ? "Artist" : "Work";
      // Capture a snapshot for rollback if the network request fails.
      // Plan F Task 7: previously the .catch was a silent swallow, so
      // the optimistic toggle would lie to the user about a save that
      // never persisted.
      const snapshot = savedItems;

      if (exists) {
        setSavedItems((prev) => prev.filter((s) => !(s.type === type && s.id === id)));
        if (user) {
          authFetch("/api/saved", {
            method: "DELETE",
            body: JSON.stringify({ itemType: type, itemId: id }),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              showToast(`${label} removed from favourites`);
            })
            .catch(() => {
              setSavedItems(snapshot);
              showToast("Couldn't update favourites. Try again.", {
                variant: "error",
                durationMs: 4000,
              });
            });
        } else {
          showToast(`${label} removed from favourites`);
        }
      } else {
        setSavedItems((prev) => [...prev, { type, id, savedAt: new Date().toISOString() }]);
        if (user) {
          authFetch("/api/saved", {
            method: "POST",
            body: JSON.stringify({ itemType: type, itemId: id }),
          })
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              showToast(`${label} added to favourites`);
            })
            .catch(() => {
              setSavedItems(snapshot);
              showToast("Couldn't update favourites. Try again.", {
                variant: "error",
                durationMs: 4000,
              });
            });
        } else {
          showToast(`${label} added to favourites`);
        }
      }
    },
    [savedItems, user, showToast]
  );

  const isSaved = useCallback(
    (type: "work" | "collection" | "artist", id: string) => {
      return savedItems.some((s) => s.type === type && s.id === id);
    },
    [savedItems]
  );

  const clearSaved = useCallback(() => {
    setSavedItems([]);
    if (!user) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  return (
    <SavedContext.Provider
      value={{ savedItems, toggleSaved, isSaved, savedCount: savedItems.length, clearSaved }}
    >
      {children}
    </SavedContext.Provider>
  );
}

export function useSaved() {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error("useSaved must be used within SavedProvider");
  return ctx;
}
