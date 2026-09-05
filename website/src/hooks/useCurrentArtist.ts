"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { artists, type Artist } from "@/data/artists";
import { slugify } from "@/lib/slugify";
import { authFetch } from "@/lib/api-client";
import { dbProfileToArtist, type DbArtistProfile, type DbArtistWork } from "@/lib/db/artist-profiles-transform";
import {
  currentArtistCacheGeneration,
  readCurrentArtistCache,
  writeCurrentArtistCache,
} from "@/lib/current-artist-cache";

/**
 * Returns the Artist record for the currently logged-in user.
 *
 * Strategy:
 * 1. Query Supabase artist_profiles table via API
 * 2. Fall back to static artists array (for demo/seed accounts)
 * 3. Returns null if no match (new user needs to complete onboarding)
 *
 * A per-tab snapshot (lib/current-artist-cache.ts) is handed out first so a
 * navigation between portal pages does not wait on the API; it is refreshed
 * in the background and dropped by every confirmed write in this tab.
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setArtist(null);
      setProfileId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const userId = user.id;

    async function loadProfile() {
      setLoading(true);

      // Warm start from the snapshot. A hit means no write in this tab is
      // newer than what it holds, because mutate() drops it on every 2xx.
      const cached = readCurrentArtistCache(userId);
      if (cached && !cancelled) {
        setArtist(dbProfileToArtist(cached.profile, cached.works));
        setProfileId(cached.profile.id);
        setLoading(false);
        // Refresh in background. If a write lands while this GET is out the
        // generation moves, and the result (already behind that write) is
        // dropped rather than written back over the cleared snapshot.
        const generation = currentArtistCacheGeneration();
        authFetch("/api/artist-profile").then((r) => r.json()).then((data) => {
          if (!data.profile || cancelled) return;
          if (currentArtistCacheGeneration() !== generation) return;
          const works = (data.works || []) as DbArtistWork[];
          writeCurrentArtistCache(userId, { profile: data.profile, works });
          setArtist(dbProfileToArtist(data.profile as DbArtistProfile, works));
        }).catch(() => {});
        return;
      }

      // Fetch from API
      try {
        const generation = currentArtistCacheGeneration();
        const res = await authFetch("/api/artist-profile");
        if (res.ok) {
          const data = await res.json();
          if (data.profile && !cancelled) {
            const works = (data.works || []) as DbArtistWork[];
            if (currentArtistCacheGeneration() === generation) {
              writeCurrentArtistCache(userId, { profile: data.profile, works });
            }
            const a = dbProfileToArtist(data.profile as DbArtistProfile, works);
            setArtist(a);
            setProfileId(data.profile.id);
            setLoading(false);
            return;
          }
        }
      } catch {
        // API unavailable, fall through to static
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
