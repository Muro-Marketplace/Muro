"use client";

/**
 * /venue-portal/walls, list of the venue's saved walls.
 *
 * Each wall card shows a swatch (wall_color_hex) sized to the wall's
 * aspect ratio, plus name + dimensions. Clicking a card opens the editor
 * at /venue-portal/walls/[id].
 *
 * Empty state: a single "Create your first wall" CTA.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import EmptyState from "@/components/EmptyState";
import ImageWithFallback from "@/components/ImageWithFallback";
import { safeHexBackground } from "@/lib/hex-color";
import { useAuth } from "@/context/AuthContext";
import { isFlagOn } from "@/lib/feature-flags";
import type { Wall } from "@/lib/visualizer/types";

export default function VenueWallsPage() {
  const { session, loading: authLoading } = useAuth();
  const [walls, setWalls] = useState<Wall[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Feature-flag gate (front-end mirror of API gate)
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
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data: { walls?: Wall[] }) => {
        if (cancelled) return;
        setWalls(data.walls ?? []);
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
      <VenuePortalLayout>
        <div className="py-16 text-center">
          <h1 className="font-serif text-2xl text-foreground mb-2">
            Walls coming soon
          </h1>
          <p className="text-sm text-muted">
            The wall visualiser is in private beta.
          </p>
        </div>
      </VenuePortalLayout>
    );
  }

  return (
    <VenuePortalLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl lg:text-3xl text-foreground mb-1">
            My Walls
          </h1>
          <p className="text-sm text-muted">
            Visualise artworks on your venue&apos;s actual walls before
            committing to a placement.
          </p>
        </div>
        <Link
          href="/venue-portal/walls/new"
          className="px-4 py-2 rounded-full bg-stone-900 text-white text-sm font-medium hover:bg-stone-800"
        >
          + New Wall
        </Link>
      </div>

      {loadError && (
        <div className="mb-4 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs">
          Couldn&apos;t load your walls: {loadError}
        </div>
      )}

      {walls === null ? (
        <LoadingGrid />
      ) : walls.length === 0 ? (
        <EmptyState
          title="Build your first wall"
          hint="Pick a preset, dial in your wall's real-world dimensions, then drag in artworks to see how they'd look."
          cta={{ label: "Add your first wall", href: "/venue-portal/walls/new" }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {walls.map((w) => (
            <WallCard key={w.id} wall={w} />
          ))}
        </div>
      )}
    </VenuePortalLayout>
  );
}

// ── Cards ─────────────────────────────────────────────────────────────

function WallCard({ wall }: { wall: Wall }) {
  // Compute aspect ratio for the swatch, keep it within a card-friendly box.
  const aspect = wall.width_cm / wall.height_cm;
  const cardHeight = aspect >= 1 ? 140 : 200;
  const cardWidth = cardHeight * aspect;
  const photoUrl = wall.kind === "uploaded" ? wall.source_image_url : null;

  return (
    <Link
      href={`/venue-portal/walls/${wall.id}`}
      className="group block rounded-xl border border-border bg-white overflow-hidden hover:border-stone-300 hover:shadow-md transition"
    >
      <div className="bg-stone-100 grid place-items-center p-6" style={{ minHeight: 160 }}>
        {photoUrl ? (
          <div
            style={{
              width: cardWidth,
              height: cardHeight,
              maxWidth: "100%",
            }}
          >
            <ImageWithFallback
              src={photoUrl}
              alt={wall.name}
              className="rounded shadow-inner object-cover w-full h-full"
              placeholderClassName="rounded shadow-inner bg-accent/10 text-accent flex items-center justify-center text-xl font-medium w-full h-full"
            />
          </div>
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
