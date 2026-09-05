"use client";

/**
 * /artist-portal/walls/propose/[wallId]?venue=<slug>
 *
 * An artist lays their own works out on a venue's public wall, previews it
 * and sends the picture with a placement request. Reached from the wall
 * card on /venues/[slug].
 *
 * Loads the wall through the public wall read (which answers only for a
 * wall the venue has put on its profile) and the venue itself (for its name
 * and the arrangements it is open to), then mounts the visualiser in
 * `artist_venue_wall` mode. The artist-portal layout's guard has already
 * made sure the viewer is an artist.
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isFlagOn } from "@/lib/feature-flags";
import {
  proposalVenueFromProfile,
  venueWallForVisualizer,
  type ProposalVenue,
  type PublicVenueWallShape,
} from "@/lib/placements/wall-proposal-client";
import type { Wall } from "@/lib/visualizer/types";

// Client-only, pulls in Konva.
const WallVisualizer = dynamic(
  () => import("@/components/visualizer/WallVisualizer"),
  { ssr: false },
);

type LoadState =
  | { kind: "loading" }
  | {
      kind: "ready";
      wall: Wall;
      wallName: string;
      wallDims: string;
      bgImageUrl: string | null;
      venue: ProposalVenue;
    }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

export default function ProposeOnWallPage() {
  return (
    <>
      {/* useSearchParams must sit under Suspense so the shell can still prerender. */}
      <Suspense fallback={<Centred>Loading wall…</Centred>}>
        <ProposeOnWall />
      </Suspense>
    </>
  );
}

function ProposeOnWall() {
  // A client page reads its dynamic segment through the hook rather than the
  // params promise: no Suspense round trip, and the shell renders at once.
  const routeParams = useParams<{ wallId: string }>();
  const wallId = typeof routeParams?.wallId === "string" ? routeParams.wallId : "";
  const searchParams = useSearchParams();
  const venueSlug = searchParams.get("venue") ?? "";
  const { session, loading: authLoading } = useAuth();
  const token = session?.access_token ?? null;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const flagOn = isFlagOn("WALL_VISUALIZER_V1");

  useEffect(() => {
    if (!flagOn || authLoading || !venueSlug) return;
    let cancelled = false;

    async function load() {
      try {
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const base = `/api/venues/${encodeURIComponent(venueSlug)}`;
        const [wallRes, venueRes] = await Promise.all([
          fetch(`${base}/walls/${encodeURIComponent(wallId)}`, { headers, cache: "no-store" }),
          fetch(base, { headers, cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (wallRes.status === 404 || venueRes.status === 404) {
          setState({ kind: "unavailable" });
          return;
        }
        if (!wallRes.ok) throw new Error(`Wall fetch ${wallRes.status}`);
        if (!venueRes.ok) throw new Error(`Venue fetch ${venueRes.status}`);

        const { wall } = (await wallRes.json()) as { wall: PublicVenueWallShape };
        const { venue } = (await venueRes.json()) as { venue: Record<string, unknown> };
        if (cancelled) return;
        setState({
          kind: "ready",
          wall: venueWallForVisualizer(wall),
          wallName: wall.name,
          wallDims: `${wall.width_cm} × ${wall.height_cm} cm`,
          bgImageUrl: wall.source_image_url ?? null,
          venue: proposalVenueFromProfile(venueSlug, venue),
        });
      } catch (err) {
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [flagOn, authLoading, token, venueSlug, wallId]);

  const venueHref = venueSlug ? `/venues/${encodeURIComponent(venueSlug)}` : "/spaces";

  if (!flagOn) {
    return (
      <Centred>
        <h1 className="font-serif text-2xl mb-2">Walls coming soon</h1>
        <Link href="/artist-portal" className="text-sm text-accent hover:underline">
          Back to portal
        </Link>
      </Centred>
    );
  }

  if (!venueSlug || state.kind === "unavailable") {
    return (
      <Centred>
        <h1 className="font-serif text-2xl mb-2">This wall isn&rsquo;t available to propose on</h1>
        <p className="text-sm text-muted mb-4">
          The venue may have taken it off their profile, or the link is out of date.
        </p>
        <Link href={venueHref} className="text-sm text-accent hover:underline">
          Back to the venue
        </Link>
      </Centred>
    );
  }

  if (state.kind === "error") {
    return (
      <Centred>
        <h1 className="font-serif text-2xl mb-2">Something went wrong</h1>
        <p className="text-sm text-muted mb-4">{state.message}</p>
        <Link href={venueHref} className="text-sm text-accent hover:underline">
          Back to the venue
        </Link>
      </Centred>
    );
  }

  if (state.kind === "loading") {
    return <Centred>Loading wall…</Centred>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={venueHref} className="text-xs text-muted hover:text-foreground">
            ← Back to {state.venue.name}
          </Link>
          <h1 className="font-serif text-2xl text-foreground truncate">
            {state.wallName}
            <span className="ml-2 text-sm text-muted tabular-nums font-sans">{state.wallDims}</span>
          </h1>
        </div>
        <p className="text-xs text-muted max-w-md">
          Drag your works onto {state.venue.name}&rsquo;s wall, press Next, then send the
          picture with your placement request.
        </p>
      </div>

      <div className="h-[70vh] min-h-[480px] rounded-sm border border-border overflow-hidden bg-stone-50">
        <WallVisualizer
          mode="artist_venue_wall"
          wall={state.wall}
          venue={state.venue}
          bgImageUrl={state.bgImageUrl}
          authToken={token}
        />
      </div>
    </div>
  );
}

function Centred({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[50vh] grid place-items-center px-4 text-center text-sm text-muted">
      <div className="max-w-sm">{children}</div>
    </div>
  );
}
