"use client";

/**
 * /artist-portal/showroom, list of the artist's saved walls.
 *
 * The showroom is the artist-side mirror of /venue-portal/walls, but framed
 * as a sales tool: rather than visualising "what artwork goes on my wall",
 * artists use it to compose room scenes that show buyers how their work
 * hangs at scale. Saved scenes can be promoted to per-artwork mockups so
 * they appear as additional images on the listing.
 *
 * Tier behaviour:
 *   - Every artist tier can save at least one wall (saved_walls cap from
 *     tier-limits). If the cap is 0 we still render the page so they can
 *     see the upsell.
 *   - artist_pro additionally has `can_publish_showroom`, that flag is
 *     consumed elsewhere (publish-public-showroom is a future feature);
 *     this page is open to all artist tiers.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { isFlagOn } from "@/lib/feature-flags";
import { safeHexBackground } from "@/lib/hex-color";
import type { Wall } from "@/lib/visualizer/types";

export default function ArtistShowroomPage() {
  const { session, loading: authLoading } = useAuth();
  const [walls, setWalls] = useState<Wall[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const flagOn = isFlagOn("WALL_VISUALIZER_V1");

  useEffect(() => {
    if (authLoading || !flagOn) return;
    if (!session?.access_token) return;
    let cancelled = false;
    fetch("/api/walls", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { walls?: Wall[] }) => {
        if (cancelled) return;
        // Filter to artist-owned walls only, the API returns everything
        // owned by the user, but a person could in theory have walls
        // from when they were on the venue side.
        const onlyArtist = (data.walls ?? []).filter(
          (w) => w.owner_type === "artist",
        );
        setWalls(onlyArtist);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(String(e));
        setWalls([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, authLoading, flagOn]);

  if (!flagOn) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/showroom">
        <div className="py-16 text-center">
          <h1 className="font-serif text-2xl text-foreground mb-2">
            Showroom coming soon
          </h1>
          <p className="text-sm text-muted">
            The wall visualiser is in private beta.
          </p>
        </div>
      </ArtistPortalLayout>
    );
  }

  return (
    <ArtistPortalLayout activePath="/artist-portal/showroom">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl lg:text-3xl text-foreground mb-1">
            Showroom
          </h1>
          <p className="text-sm text-muted max-w-2xl">
            Compose room scenes that show buyers how your work hangs at
            scale, perfect for posting on Instagram or attaching as
            mockups to specific artworks.
          </p>
        </div>
        <Link
          href="/artist-portal/showroom/new"
          className="px-4 py-2 rounded-full bg-stone-900 text-white text-sm font-medium hover:bg-stone-800"
        >
          + New Scene
        </Link>
      </div>

      {loadError && (
        <div className="mb-4 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs">
          Couldn&apos;t load your showroom: {loadError}
        </div>
      )}

      {walls === null ? (
        <LoadingGrid />
      ) : walls.length === 0 ? (
        <EmptyState
          title="No showrooms yet"
          hint="A showroom lets venues see your work hanging on real walls. It takes about 5 minutes."
          cta={{ label: "Create your first showroom", href: "/artist-portal/showroom/new" }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {walls.map((w) => (
            <WallCard key={w.id} wall={w} />
          ))}
        </div>
      )}
    </ArtistPortalLayout>
  );
}

// ── Cards ─────────────────────────────────────────────────────────────

function WallCard({ wall }: { wall: Wall }) {
  const aspect = wall.width_cm / wall.height_cm;
  const cardHeight = aspect >= 1 ? 140 : 200;
  const cardWidth = cardHeight * aspect;
  // Uploaded walls: show the actual photo as the thumbnail (signed
  // URL minted server-side by GET /api/walls). Preset walls: show
  // the colour swatch, there's no image asset for a preset, the
  // wall is just a colour.
  const photoUrl = wall.kind === "uploaded" ? wall.source_image_url : null;

  return (
    <Link
      href={`/artist-portal/showroom/${wall.id}`}
      className="group block rounded-xl border border-border bg-white overflow-hidden hover:border-stone-300 hover:shadow-md transition"
    >
      <div className="bg-stone-100 grid place-items-center p-6" style={{ minHeight: 160 }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={wall.name}
            className="rounded shadow-inner object-cover"
            style={{
              width: cardWidth,
              height: cardHeight,
              maxWidth: "100%",
            }}
          />
        ) : (
          <div
            className="rounded shadow-inner"
            style={{
              backgroundColor: safeHexBackground(wall.wall_color_hex, "#E5E1DA"),
              width: cardWidth,
              height: cardHeight,
              maxWidth: "100%",
            }}
          />
        )}
      </div>
      <div className="px-4 py-3">
        <p className="font-medium text-sm text-foreground truncate group-hover:text-accent transition-colors">
          {wall.name}
        </p>
        <p className="text-xs text-muted mt-0.5 tabular-nums">
          {wall.width_cm} × {wall.height_cm} cm · {wall.kind}
        </p>
      </div>
    </Link>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-white overflow-hidden"
        >
          <div className="bg-stone-100 animate-pulse" style={{ height: 200 }} />
          <div className="px-4 py-3 space-y-2">
            <div className="h-3 w-3/4 bg-stone-200 rounded animate-pulse" />
            <div className="h-2 w-1/2 bg-stone-200 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
