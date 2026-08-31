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

/**
 * Render fallback for wall names. Legacy rows can be saved with empty
 * strings or stray punctuation (".", ",", "..."), surfaced in QA as a
 * card displaying just a comma. Any name that lacks a letter or number
 * is replaced with "Untitled wall" so cards always read coherently.
 */
function displayWallName(name: string | null | undefined): string {
  if (typeof name !== "string") return "Untitled wall";
  const trimmed = name.trim();
  if (!trimmed) return "Untitled wall";
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return "Untitled wall";
  return trimmed;
}

export default function VenueWallsPage() {
  const { session, loading: authLoading } = useAuth();
  const [walls, setWalls] = useState<Wall[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Tier cap on saved walls. -1 = unlimited, 0 = not allowed on this
  // plan, positive number = the hard cap. null while loading.
  const [cap, setCap] = useState<number | null>(null);

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
      .then((data: { walls?: Wall[]; cap?: number }) => {
        if (cancelled) return;
        setWalls(data.walls ?? []);
        if (typeof data.cap === "number") setCap(data.cap);
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

  // Derive whether the cap is hit. Treat null cap (still loading) and
  // -1 (unlimited) as "not capped" so the New Wall button stays usable
  // by default; only flip to capped when we have both the wall list
  // and a positive cap, and the list size has reached it.
  const wallCount = walls?.length ?? 0;
  const atCap = cap !== null && cap > 0 && wallCount >= cap;
  const notAllowed = cap === 0;

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
        {atCap || notAllowed ? (
          <div className="flex flex-col items-end gap-1">
            {/* Row 1844. This was a <span aria-disabled="true">: styled to look
                disabled, but not a button, so nothing announced it as one and
                nothing could read its disabled state. Pass 2 recorded the
                control as "NOT disabled at the cap". A real disabled button is
                announced, cannot be focused, and reads as unavailable to
                anything inspecting the page. */}
            <button
              type="button"
              disabled
              className="px-4 py-2 rounded-full bg-stone-900/30 text-white/80 text-sm font-medium cursor-not-allowed select-none"
              title={
                notAllowed
                  ? "Saving walls isn't included on your plan."
                  : `You've reached your ${cap} wall limit.`
              }
            >
              + New Wall
            </button>
            <Link
              href="/pricing"
              className="text-xs text-accent hover:underline"
            >
              {notAllowed
                ? "Upgrade your plan to save walls"
                : `Upgrade to add more than ${cap} wall${cap === 1 ? "" : "s"}`}
            </Link>
          </div>
        ) : (
          <Link
            href="/venue-portal/walls/new"
            className="px-4 py-2 rounded-full bg-stone-900 text-white text-sm font-medium hover:bg-stone-800"
          >
            + New Wall
          </Link>
        )}
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
  // Only use the photo path when the wall is actually an uploaded
  // type AND the signed URL is non-empty. Some legacy uploaded rows
  // exist with `source_image_url = null` (failed upload finalise,
  // bucket cleared); without this guard those cards fell through to
  // ImageWithFallback's broken-image placeholder, which renders an
  // empty box. Falling back to the colour swatch keeps every card
  // visually filled.
  const photoUrl =
    wall.kind === "uploaded" && typeof wall.source_image_url === "string" && wall.source_image_url.length > 0
      ? wall.source_image_url
      : null;
  const nameForFallback = displayWallName(wall.name);

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
              alt={nameForFallback}
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
          {displayWallName(wall.name)}
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
