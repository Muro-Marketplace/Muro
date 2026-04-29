"use client";

/**
 * /venue-portal/walls/new, wall creation flow.
 *
 * Two top-level tabs:
 *   1. Preset, pick a stock wall colour + dimensions
 *   2. Upload photo, upload a real photograph of your wall, then set
 *      dimensions
 *
 * Either path:
 *   - POST /api/walls → wall row
 *   - POST /api/walls/{id}/layouts → first layout (always created so
 *     the editor has something to attach to immediately)
 *   - Redirect to /venue-portal/walls/{id}
 *
 * Errors:
 *   - 402 (cap reached) → friendly upgrade copy with link to /pricing
 *   - 400 (validation) → inline field message
 *   - 5xx → generic banner
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { useAuth } from "@/context/AuthContext";
import { isFlagOn } from "@/lib/feature-flags";
import { resizeImage } from "@/lib/image";
import { PRESET_WALLS, getPresetWall } from "@/lib/visualizer/preset-walls";
import type { Wall, WallLayout } from "@/lib/visualizer/types";

const DEFAULT_PRESET_ID = "minimal_white";

type Mode = "preset" | "upload";

export default function NewVenueWallPage() {
  const router = useRouter();
  const { session } = useAuth();
  const flagOn = isFlagOn("WALL_VISUALIZER_V1");

  const initialPreset =
    getPresetWall(DEFAULT_PRESET_ID) ?? PRESET_WALLS[0];

  const [mode, setMode] = useState<Mode>("preset");

  // Preset mode state
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [colorHex, setColorHex] = useState(initialPreset.defaultColorHex);

  // Upload mode state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Shared state
  const [name, setName] = useState("");
  const [widthCm, setWidthCm] = useState(initialPreset.defaultWidthCm);
  const [heightCm, setHeightCm] = useState(initialPreset.defaultHeightCm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capError, setCapError] = useState<string | null>(null);

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

  function pickPreset(id: string) {
    const preset = getPresetWall(id);
    if (!preset) return;
    setPresetId(preset.id);
    setColorHex(preset.defaultColorHex);
    setWidthCm(preset.defaultWidthCm);
    setHeightCm(preset.defaultHeightCm);
  }

  async function handleFilePicked(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      // Compress + resize before upload, iPhone photos at full size
      // typically run 4-12MB which trips Vercel's serverless body
      // limit (≈4.5MB) and surfaces as a 413. 2400px max / 0.88 keeps
      // the photo sharp enough to use as a wall reference while
      // landing well under the platform cap (usually under 1MB).
      let uploadBlob: Blob = file;
      try {
        uploadBlob = await resizeImage(file, 2400, 0.88);
      } catch {
        // Resize unsupported (e.g. browser can't decode HEIC), fall
        // back to the original. The route's MAX_BYTES will still
        // surface an error that's clearer than a Vercel 413.
      }
      const fd = new FormData();
      fd.append("file", uploadBlob, file.name);
      const res = await fetch("/api/walls/upload-photo", {
        method: "POST",
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ??
            `Upload failed (${res.status})`,
        );
      }
      const json = (await res.json()) as {
        path: string;
        signedUrl: string | null;
      };
      setPhotoPath(json.path);
      setPhotoPreviewUrl(
        json.signedUrl ?? URL.createObjectURL(file),
      );
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed.",
      );
      setPhotoPath(null);
      setPhotoPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setCapError(null);

    if (!session?.access_token) {
      setError("Sign in required.");
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please give the wall a name.");
      return;
    }
    if (mode === "upload" && !photoPath) {
      setError("Please upload a photo of your wall first.");
      return;
    }

    setSubmitting(true);
    try {
      // 1) Build the create-wall payload (discriminated union by `kind`).
      const payload =
        mode === "preset"
          ? {
              kind: "preset" as const,
              owner_type: "venue" as const,
              name: trimmedName,
              preset_id: presetId,
              width_cm: clamp(widthCm, 50, 1000),
              height_cm: clamp(heightCm, 50, 1000),
              wall_color_hex: colorHex.replace(/^#/, "").toUpperCase(),
            }
          : {
              kind: "uploaded" as const,
              owner_type: "venue" as const,
              name: trimmedName,
              source_image_path: photoPath!,
              width_cm: clamp(widthCm, 50, 1000),
              height_cm: clamp(heightCm, 50, 1000),
              wall_color_hex: "FFFFFF",
            };

      const wallRes = await fetch("/api/walls", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (wallRes.status === 402) {
        const body = (await wallRes.json().catch(() => ({}))) as {
          error?: string;
        };
        setCapError(body.error ?? "You've hit your saved-wall limit.");
        return;
      }
      if (!wallRes.ok) {
        const body = await wallRes.text().catch(() => "");
        throw new Error(body || `Wall create failed (${wallRes.status})`);
      }
      const wallJson = (await wallRes.json()) as { wall: Wall };

      // 2) Create the initial layout under the wall.
      const layoutRes = await fetch(
        `/api/walls/${wallJson.wall.id}/layouts`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            wall_id: wallJson.wall.id,
            name: "Untitled layout",
            items: [],
          }),
        },
      );
      if (!layoutRes.ok) {
        // Wall exists; layout failed. Send them to the list and surface
        // the issue rather than getting stuck on this page.
        router.replace("/venue-portal/walls");
        return;
      }
      const layoutJson = (await layoutRes.json()) as { layout: WallLayout };

      // 3) Open the editor.
      router.push(
        `/venue-portal/walls/${wallJson.wall.id}?lid=${layoutJson.layout.id}`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <VenuePortalLayout>
      <div className="max-w-2xl">
        <div className="mb-6">
          <Link
            href="/venue-portal/walls"
            className="text-xs text-muted hover:text-foreground"
          >
            ← My Walls
          </Link>
          <h1 className="font-serif text-2xl lg:text-3xl text-foreground mt-2 mb-1">
            New Wall
          </h1>
          <p className="text-sm text-muted">
            Pick a preset for a clean colour-block wall, or upload a
            photo of your actual wall to see artworks composited onto it.
          </p>
        </div>

        {capError && (
          <div className="mb-5 p-4 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm font-medium text-amber-900 mb-1">
              You&apos;ve hit your wall limit
            </p>
            <p className="text-xs text-amber-800 mb-3">{capError}</p>
            <Link
              href="/pricing"
              className="text-xs font-medium text-amber-900 underline"
            >
              See plans →
            </Link>
          </div>
        )}

        {error && (
          <div className="mb-5 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs">
            {error}
          </div>
        )}

        {/* Mode tabs */}
        <div
          role="tablist"
          aria-label="Wall source"
          className="inline-flex items-center gap-1 mb-6 p-1 rounded-full bg-stone-100"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "preset"}
            onClick={() => setMode("preset")}
            className={`px-4 py-1.5 text-xs rounded-full transition ${
              mode === "preset"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Preset
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            onClick={() => setMode("upload")}
            className={`px-4 py-1.5 text-xs rounded-full transition ${
              mode === "upload"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Upload photo
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* === PRESET PANEL === */}
          {mode === "preset" && (
            <>
              <div>
                <label className="block text-xs font-medium text-foreground mb-2">
                  Preset
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {PRESET_WALLS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPreset(p.id)}
                      className={`p-3 rounded-lg border text-left transition ${
                        presetId === p.id
                          ? "border-stone-900 ring-1 ring-stone-900"
                          : "border-border hover:border-stone-300"
                      }`}
                    >
                      <div
                        className="h-12 w-full rounded mb-2"
                        style={{ backgroundColor: `#${p.defaultColorHex}` }}
                      />
                      <p className="text-xs font-medium text-foreground truncate">
                        {p.name}
                      </p>
                      <p className="text-[10px] text-muted tabular-nums">
                        {p.defaultWidthCm}×{p.defaultHeightCm}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-foreground">
                  Wall colour
                </label>
                <input
                  type="color"
                  value={`#${colorHex}`}
                  onChange={(e) =>
                    setColorHex(
                      e.target.value.replace(/^#/, "").toUpperCase(),
                    )
                  }
                  className="h-8 w-12 rounded border border-border bg-transparent"
                />
                <span className="text-xs text-muted tabular-nums">
                  #{colorHex}
                </span>
              </div>
            </>
          )}

          {/* === UPLOAD PANEL === */}
          {mode === "upload" && (
            <div>
              <label className="block text-xs font-medium text-foreground mb-2">
                Wall photo
              </label>

              {photoPreviewUrl ? (
                <div className="relative rounded-lg overflow-hidden border border-border bg-stone-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreviewUrl}
                    alt="Your wall"
                    className="w-full max-h-72 object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoPath(null);
                      setPhotoPreviewUrl(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur text-white text-[11px] hover:bg-black/75"
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full py-12 rounded-lg border-2 border-dashed border-border bg-stone-50 hover:border-stone-300 hover:bg-stone-100 transition flex flex-col items-center gap-2 disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-stone-400 animate-pulse" />
                      <span className="text-sm text-stone-600">Uploading…</span>
                    </>
                  ) : (
                    <>
                      <svg
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="text-stone-400"
                      >
                        <path d="M12 4v12M6 10l6-6 6 6" strokeLinecap="round" />
                        <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" />
                      </svg>
                      <span className="text-sm font-medium text-foreground">
                        Click to choose a photo
                      </span>
                      <span className="text-[11px] text-muted">
                        JPG, PNG, or WebP · up to 15&nbsp;MB
                      </span>
                    </>
                  )}
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFilePicked(f);
                }}
                className="hidden"
              />

              {uploadError && (
                <p className="mt-2 text-xs text-red-600">{uploadError}</p>
              )}

              <p className="text-[11px] text-muted mt-2 leading-relaxed">
                Take or pick a straight-on photo of the wall, lit evenly.
                You&apos;ll see artworks composited on top, measurements
                are based on the dimensions you enter below, not the
                photo&apos;s pixels.
              </p>
            </div>
          )}

          {/* === SHARED FIELDS === */}
          <div>
            <label
              htmlFor="wall-name"
              className="block text-xs font-medium text-foreground mb-1.5"
            >
              Name
            </label>
            <input
              id="wall-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main café back wall"
              maxLength={120}
              required
              className="w-full px-3 py-2 rounded-md border border-border bg-white text-sm focus:outline-none focus:border-stone-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Real dimensions (cm)
            </label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted w-4">W</span>
                <input
                  type="number"
                  min={50}
                  max={1000}
                  step={5}
                  value={widthCm}
                  onChange={(e) => setWidthCm(Number(e.target.value))}
                  className="w-24 px-2 py-1.5 rounded-md border border-border bg-white text-sm tabular-nums focus:outline-none focus:border-stone-400"
                />
                <span className="text-xs text-muted">cm</span>
              </div>
              <span className="text-stone-300">×</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted w-4">H</span>
                <input
                  type="number"
                  min={50}
                  max={1000}
                  step={5}
                  value={heightCm}
                  onChange={(e) => setHeightCm(Number(e.target.value))}
                  className="w-24 px-2 py-1.5 rounded-md border border-border bg-white text-sm tabular-nums focus:outline-none focus:border-stone-400"
                />
                <span className="text-xs text-muted">cm</span>
              </div>
            </div>
            <p className="text-[11px] text-muted mt-1.5">
              Measure the actual usable wall area. Artworks will be drawn
              at true scale relative to this.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/venue-portal/walls"
              className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={
                submitting || (mode === "upload" && (!photoPath || uploading))
              }
              className="px-4 py-2 rounded-full bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create wall"}
            </button>
          </div>
        </form>
      </div>
    </VenuePortalLayout>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
