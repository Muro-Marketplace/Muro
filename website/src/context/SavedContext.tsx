"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import type { SavedItem } from "@/lib/types";

interface SavedContextValue {
  savedItems: SavedItem[];
  toggleSaved: (type: "work" | "collection" | "artist", id: string) => void;
  isSaved: (type: "work" | "collection" | "artist", id: string) => boolean;
  savedCount: number;
  clearSaved: () => void;
}

const SavedContext = createContext<SavedContextValue | null>(null);

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const hasMounted = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem("wallspace-saved");
    if (stored) {
      try { setSavedItems(JSON.parse(stored)); } catch { /* ignore */ }
    }
    hasMounted.current = true;
  }, []);

  useEffect(() => {
    if (hasMounted.current) {
      localStorage.setItem("wallspace-saved", JSON.stringify(savedItems));
    }
  }, [savedItems]);

  const toggleSaved = useCallback((type: "work" | "collection" | "artist", id: string) => {
    setSavedItems((prev) => {
      const exists = prev.find((s) => s.type === type && s.id === id);
      if (exists) return prev.filter((s) => !(s.type === type && s.id === id));
      return [...prev, { type, id, savedAt: new Date().toISOString() }];
    });
  }, []);

  const isSaved = useCallback(
    (type: "work" | "collection" | "artist", id: string) => {
      return savedItems.some((s) => s.type === type && s.id === id);
    },
    [savedItems]
  );

  const clearSaved = useCallback(() => setSavedItems([]), []);

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
