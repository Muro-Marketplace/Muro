"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { venues, type Venue } from "@/data/venues";
import { slugify } from "@/lib/slugify";
import { authFetch } from "@/lib/api-client";
import { dbVenueToVenue, type DbVenueProfile } from "@/lib/db/venue-profiles";

/**
 * Returns the Venue record for the currently logged-in venue user.
 * Queries Supabase first, falls back to static data.
 */
export function useCurrentVenue(): {
  venue: Venue | null;
  loading: boolean;
  profileId: string | null;
  refetch: () => void;
} {
  const { user, loading: authLoading } = useAuth();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setVenue(null);
      setProfileId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      setLoading(true);

      // Try Supabase via API
      try {
        const res = await authFetch("/api/venue-profile");
        if (res.ok) {
          const data = await res.json();
          if (data.profile && !cancelled) {
            setVenue(dbVenueToVenue(data.profile as DbVenueProfile));
            setProfileId(data.profile.id);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Fall through to static
      }

      if (cancelled) return;

      // Fall back to static data
      const displayName = user?.user_metadata?.display_name as string | undefined;
      const metaSlug = user?.user_metadata?.venue_slug as string | undefined;

      const found = venues.find((v) => {
        if (metaSlug && v.slug === metaSlug) return true;
        if (displayName && v.slug === slugify(displayName)) return true;
        return false;
      });

      setVenue(found || null);
      setProfileId(null);
      setLoading(false);
    }

    loadProfile();

    return () => { cancelled = true; };
  }, [user, authLoading, fetchKey]);

  const refetch = () => setFetchKey((k) => k + 1);

  return { venue, loading, profileId, refetch };
}
