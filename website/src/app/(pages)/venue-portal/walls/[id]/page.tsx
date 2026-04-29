"use client";

/**
 * /venue-portal/walls/[id], full-bleed editor for a single saved wall.
 *
 * Responsibilities:
 *   - Auth gate (PortalGuard via VenuePortalLayout would also work but
 *     we want the editor full-bleed, so we replicate the userType check
 *     inline and skip the sidebar).
 *   - Load the wall.
 *   - Load the wall's layouts and pick the active one (?lid= param or
 *     first listed layout).
 *   - Mount WallVisualizer with `wall` + `initialLayout` so it can
 *     auto-save and render.
 *   - Provide a small top bar (back link, wall name, delete button).
 *
 * Errors:
 *   - 404 (wall not found / not owned) → friendly message + back link
 *   - No layouts on wall → create one inline (rare; create flow always
 *     makes one, but legacy walls or a failed create can land here)
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import { isFlagOn } from "@/lib/feature-flags";
import type { Wall, WallLayout } from "@/lib/visualizer/types";

// Visualizer is client-only and pulls in Konva, dynamic-load.
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
      /** Signed URL for the wall photo when wall.kind === "uploaded". */
      sourceImageUrl: string | null;
    }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export default function VenueWallEditorPage({
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
    if (userType && userType !== "venue") {
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
        if (!wallRes.ok) {
          throw new Error(`Wall fetch ${wallRes.status}`);
        }
        if (!layoutsRes.ok) {
          throw new Error(`Layouts fetch ${layoutsRes.status}`);
        }

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
            layoutsJson.layouts.find((l) => l.id === requestedLayoutId) ??
            null;
        }
        if (!activeLayout && layoutsJson.layouts.length > 0) {
          activeLayout = layoutsJson.layouts[0];
        }

        if (!activeLayout) {
          // No layout on this wall yet, create one inline.
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
                name: "Untitled layout",
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
    if (deleting) return;
    if (!session?.access_token) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/walls/${wallId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`Delete failed (${res.status})`);
      }
      router.push("/venue-portal/walls");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete wall");
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (!flagOn) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="text-center">
          <h1 className="font-serif text-2xl mb-2">Walls coming soon</h1>
          <Link href="/venue-portal" className="text-sm text-accent hover:underline">
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
          <h1 className="font-serif text-2xl mb-2">Wall not found</h1>
          <p className="text-sm text-muted mb-4">
            It may have been deleted, or you don&apos;t have access.
          </p>
          <Link
            href="/venue-portal/walls"
            className="text-sm text-accent hover:underline"
          >
            ← My Walls
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
            href="/venue-portal/walls"
            className="text-sm text-accent hover:underline"
          >
            ← My Walls
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
            href="/venue-portal/walls"
            className="text-xs text-muted hover:text-foreground shrink-0"
          >
            ← My Walls
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
        <div className="flex items-center gap-3 shrink-0">
          {/* Show on public profile, venue-side only. Optimistic
              toggle: flip locally, fire PATCH, revert on failure.
              Off by default per migration 037 so a venue's wall
              stays private until they explicitly publish it. */}
          {ready && (
            <label
              className="inline-flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer select-none"
              title="When ticked, this wall shows up on your public venue page so artists can see it before requesting placements."
            >
              <input
                type="checkbox"
                className="accent-accent w-3.5 h-3.5"
                checked={!!state.wall.is_public_on_profile}
                onChange={async (e) => {
                  const next = e.target.checked;
                  // Optimistic local flip.
                  setState((prev) =>
                    prev.kind === "ready"
                      ? {
                          ...prev,
                          wall: { ...prev.wall, is_public_on_profile: next },
                        }
                      : prev,
                  );
                  try {
                    const res = await fetch(
                      `/api/walls/${encodeURIComponent(state.wall.id)}`,
                      {
                        method: "PATCH",
                        headers: {
                          "content-type": "application/json",
                          ...(session?.access_token
                            ? { Authorization: `Bearer ${session.access_token}` }
                            : {}),
                        },
                        body: JSON.stringify({ is_public_on_profile: next }),
                      },
                    );
                    if (!res.ok) {
                      // Revert on failure.
                      setState((prev) =>
                        prev.kind === "ready"
                          ? {
                              ...prev,
                              wall: {
                                ...prev.wall,
                                is_public_on_profile: !next,
                              },
                            }
                          : prev,
                      );
                    }
                  } catch {
                    setState((prev) =>
                      prev.kind === "ready"
                        ? {
                            ...prev,
                            wall: {
                              ...prev.wall,
                              is_public_on_profile: !next,
                            },
                          }
                        : prev,
                    );
                  }
                }}
              />
              Show on public profile
            </label>
          )}
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
            mode="venue_my_walls"
            wall={state.wall}
            initialLayout={state.layout}
            bgImageUrl={state.sourceImageUrl}
            authToken={session?.access_token ?? null}
            onClose={() => router.push("/venue-portal/walls")}
          />
        ) : (
          <div className="h-full grid place-items-center text-xs text-stone-400">
            Loading wall…
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
              Delete this wall?
            </h2>
            <p className="text-sm text-stone-600 mb-5">
              This removes the wall and every saved layout on it. Past
              renders stay accessible by their direct URLs.
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
                {deleting ? "Deleting…" : "Delete wall"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
