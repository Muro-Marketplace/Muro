"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { artists, type Artist } from "@/data/artists";
import { slugify } from "@/lib/slugify";
import { dbProfileToArtist, type DbArtistProfile } from "@/lib/db/artist-profiles-transform";
import { fetchArtistProfileShared, peekArtistProfile } from "@/lib/artist-profile-source";

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
 *
 * The network call goes through lib/artist-profile-source.ts, which shares one
 * in-flight request across every consumer, so this hook mounting alongside
 * PortalGuard and the portal chrome costs one request rather than three.
 *
 * `profile` is the raw artist_profiles row. `artist` is the same data mapped to
 * the public Artist shape, which drops columns the marketplace has no use for
 * (default_shipping_price among them). The portfolio page needed one of those
 * and was issuing a FOURTH identical request to get it.
 */
export function useCurrentArtist(): {
  artist: Artist | null;
  profile: DbArtistProfile | null;
  loading: boolean;
  profileId: string | null;
  refetch: () => void;
} {
  const { user, loading: authLoading } = useAuth();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [profile, setProfile] = useState<DbArtistProfile | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setArtist(null);
      setProfile(null);
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
      const cached = peekArtistProfile(userId);
      if (cached?.profile && !cancelled) {
        setArtist(dbProfileToArtist(cached.profile, cached.works));
        setProfile(cached.profile);
        setProfileId(cached.profile.id);
        setLoading(false);
        // Refresh in background. The shared source drops a result that a write
        // superseded while it was in flight rather than writing it back over
        // the cleared snapshot.
        fetchArtistProfileShared(userId)
          .then((fresh) => {
            if (cancelled || !fresh.profile) return;
            setArtist(dbProfileToArtist(fresh.profile, fresh.works));
            setProfile(fresh.profile);
          })
          .catch(() => {});
        return;
      }

      // Cold start.
      try {
        const fresh = await fetchArtistProfileShared(userId);
        if (fresh.profile && !cancelled) {
          setArtist(dbProfileToArtist(fresh.profile, fresh.works));
          setProfile(fresh.profile);
          setProfileId(fresh.profile.id);
          setLoading(false);
          return;
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
      setProfile(null);
      setProfileId(null);
      setLoading(false);
    }

    loadProfile();

    return () => { cancelled = true; };
  }, [user, authLoading, fetchKey]);

  const refetch = () => setFetchKey((k) => k + 1);

  return { artist, profile, loading, profileId, refetch };
}
