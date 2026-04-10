"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { artists, type Artist } from "@/data/artists";
import { slugify } from "@/lib/slugify";
import { authFetch } from "@/lib/api-client";
import { dbProfileToArtist, type DbArtistProfile, type DbArtistWork } from "@/lib/db/artist-profiles";

/**
 * Returns the Artist record for the currently logged-in user.
 *
 * Strategy:
 * 1. Query Supabase artist_profiles table via API
 * 2. Fall back to static artists array (for demo/seed accounts)
 * 3. Returns null if no match (new user needs to complete onboarding)
 */
export function useCurrentArtist(): {
  artist: Artist | null;
  loading: boolean;
  profileId: string | null;
  refetch: () => void;
} {
  const { user, loading: authLoading } = useAuth();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setArtist(null);
      setProfileId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      setLoading(true);

      // Try Supabase via API
      try {
        const res = await authFetch("/api/artist-profile");
        if (res.ok) {
          const data = await res.json();
          if (data.profile && !cancelled) {
            const a = dbProfileToArtist(
              data.profile as DbArtistProfile,
              (data.works || []) as DbArtistWork[]
            );
            setArtist(a);
            setProfileId(data.profile.id);
            setLoading(false);
            return;
          }
        }
      } catch {
        // API unavailable — fall through to static
      }

      if (cancelled) return;

      // Fall back to static data (for seed/demo accounts)
      const displayName = user?.user_metadata?.display_name as string | undefined;
      const metaSlug = user?.user_metadata?.artist_slug as string | undefined;

      const found = artists.find((a) => {
        if (metaSlug && a.slug === metaSlug) return true;
        if (displayName && a.slug === slugify(displayName)) return true;
        const emailPrefix = user?.email?.split("@")[0] || "";
        return a.slug === emailPrefix || a.slug === slugify(emailPrefix);
      });

      setArtist(found || null);
      setProfileId(null);
      setLoading(false);
    }

    loadProfile();

    return () => { cancelled = true; };
  }, [user, authLoading, fetchKey]);

  const refetch = () => setFetchKey((k) => k + 1);

  return { artist, loading, profileId, refetch };
}
