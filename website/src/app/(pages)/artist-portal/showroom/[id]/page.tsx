"use client";

/**
 * /artist-portal/showroom/[id] — full-bleed editor for a single scene.
 *
 * Mirror of /venue-portal/walls/[id], retargeted to artist mode:
 *   - Auth gate requires `artist` role.
 *   - WallVisualizer mounts in `mode="artist_showroom"`, which loads
 *     the artist's own works in the side panel.
 *   - Top bar back-link points to /artist-portal/showroom.
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import { isFlagOn } from "@/lib/feature-flags";
import type { Wall, WallLayout } from "@/lib/visualizer/types";

const WallVisualizer = dynamic(
  () => import("@/components/visualizer/WallVisualizer"),
  { ssr: false },
);

type LoadState =
  | { kind: "loading" }
  | {
      kind: "ready";
      wall: Wall;
      layout: WallLayout;
      sourceImageUrl: string | null;
    }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export default function ArtistShowroomEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: wallId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedLayoutId = searchParams.get("lid");

  const { session, userType, loading: authLoading } = useAuth();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const flagOn = isFlagOn("WALL_VISUALIZER_V1");

  // Auth redirect.
  useEffect(() => {
    if (authLoading) return;
    if (!session?.access_token) {
      router.replace("/login");
      return;
    }
    if (userType && userType !== "artist") {
      router.replace("/");
      return;
    }
  }, [authLoading, session?.access_token, userType, router]);

  // Load wall + layouts.
  useEffect(() => {
    if (!flagOn) return;
    if (!session?.access_token) return;
    let cancelled = false;

    async function load() {
      try {
        const headers = {
          Authorization: `Bearer ${session!.access_token}`,
        };
        const [wallRes, layoutsRes] = await Promise.all([
          fetch(`/api/walls/${wallId}`, { headers, cache: "no-store" }),
          fetch(`/api/walls/${wallId}/layouts`, { headers, cache: "no-store" }),
        ]);

        if (cancelled) return;

        if (wallRes.status === 404) {
          setState({ kind: "missing" });
          return;
        }
        if (!wallRes.ok) throw new Error(`Wall fetch ${wallRes.status}`);
        if (!layoutsRes.ok) throw new Error(`Layouts fetch ${layoutsRes.status}`);

        const wallJson = (await wallRes.json()) as {
          wall: Wall;
          sourceImageUrl: string | null;
        };
        const layoutsJson = (await layoutsRes.json()) as {
          layouts: WallLayout[];
        };

        let activeLayout: WallLayout | null = null;
        if (requestedLayoutId) {
          activeLayout =
            layoutsJson.layouts.find((l) => l.id === requestedLayoutId) ?? null;
        }
        if (!activeLayout && layoutsJson.layouts.length > 0) {
          activeLayout = layoutsJson.layouts[0];
        }

        if (!activeLayout) {
          const createRes = await fetch(
            `/api/walls/${wallId}/layouts`,
            {
              method: "POST",
              headers: {
                ...headers,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                wall_id: wallId,
                name: "Untitled scene",
                items: [],
              }),
            },
          );
          if (!createRes.ok) {
            throw new Error(`Could not create layout (${createRes.status})`);
          }
          const created = (await createRes.json()) as { layout: WallLayout };
          activeLayout = created.layout;
        }

        if (cancelled) return;
        setState({
          kind: "ready",
          wall: wallJson.wall,
          layout: activeLayout,
          sourceImageUrl: wallJson.sourceImageUrl ?? null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [wallId, requestedLayoutId, session?.access_token, flagOn]);

  async function handleDelete() {
    if (deleting || !session?.access_token) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/walls/${wallId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`Delete failed (${res.status})`);
      }
      router.push("/artist-portal/showroom");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete scene");
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (!flagOn) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="text-center">
          <h1 className="font-serif text-2xl mb-2">Showroom coming soon</h1>
          <Link
            href="/artist-portal"
            className="text-sm text-accent hover:underline"
          >
            Back to portal
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === "missing") {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="text-center max-w-sm">
          <h1 className="font-serif text-2xl mb-2">Scene not found</h1>
          <p className="text-sm text-muted mb-4">
            It may have been deleted, or you don&apos;t have access.
          </p>
          <Link
            href="/artist-portal/showroom"
            className="text-sm text-accent hover:underline"
          >
            ← Showroom
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="text-center max-w-sm">
          <h1 className="font-serif text-2xl mb-2">Something went wrong</h1>
          <p className="text-sm text-muted mb-4">{state.message}</p>
          <Link
            href="/artist-portal/showroom"
            className="text-sm text-accent hover:underline"
          >
            ← Showroom
          </Link>
        </div>
      </div>
    );
  }

  const ready = state.kind === "ready";

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-4rem)] bg-stone-50">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2 border-b border-border bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/artist-portal/showroom"
            className="text-xs text-muted hover:text-foreground shrink-0"
          >
            ← Showroom
          </Link>
          <span className="h-4 w-px bg-black/10 mx-1 shrink-0" />
          <p className="text-sm font-medium text-foreground truncate">
            {ready ? state.wall.name : "Loading…"}
          </p>
          {ready && (
            <span className="text-xs text-muted tabular-nums shrink-0">
              · {state.wall.width_cm}×{state.wall.height_cm} cm
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="text-xs text-stone-500 hover:text-red-600 px-2 py-1"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        {ready ? (
          <WallVisualizer
            mode="artist_showroom"
            wall={state.wall}
            initialLayout={state.layout}
            bgImageUrl={state.sourceImageUrl}
            authToken={session?.access_token ?? null}
            onClose={() => router.push("/artist-portal/showroom")}
          />
        ) : (
          <div className="h-full grid place-items-center text-xs text-stone-400">
            Loading scene…
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {deleteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => !deleting && setDeleteOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-black/5 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-lg text-foreground mb-2">
              Delete this scene?
            </h2>
            <p className="text-sm text-stone-600 mb-5">
              This removes the scene and every saved layout on it. Past
              renders stay accessible by their direct URLs (so anything
              promoted to an artwork mockup is unaffected).
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-full bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete scene"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
