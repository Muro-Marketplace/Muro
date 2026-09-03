"use client";

/**
 * WallVisualizer, top-level editor.
 *
 * Owns:
 *   - layout state (background, dimensions, items, selection)
 *   - works data (fetched once, kept as both list + lookup map)
 *   - high-level interactions: add/move/resize/delete/duplicate/z-order
 *   - preview flow (capture the editor stage → preview modal → optional
 *     Save to wall, which uploads the capture against the saved layout)
 *   - auto-save (debounced PATCH /layouts/[lid] when wallId+layoutId set)
 *
 * Composes:
 *   - WorksPanel       (presentational)
 *   - WallCanvas       (Konva, dynamic-imported with ssr:false)
 *   - Wall3DCanvas     (three.js, dynamic-imported with ssr:false)
 *   - ItemToolbar      (visible when an item is selected)
 *   - WallConfigBar    (preset/colour/dimensions)
 *   - RenderPreview    (shown after a capture)
 *
 * Preview:
 *   Preview used to POST the layout to a server compositor, which rebuilt
 *   the scene with its own scale and a cover-cropped wall photo, so the
 *   art never landed where the editor showed it. It is now a pixel
 *   capture of the editor's own stage (see lib/visualizer/capture.ts):
 *   what the user sees is what they get, nothing is fetched, nothing is
 *   metered. Saving the preview stores that capture against the layout
 *   so the wall list and the public venue profile show the wall as built.
 *
 * Feature flag:
 *   Returns null when WALL_VISUALIZER_V1 is off, so embedding routes
 *   compile + render fine.
 *
 * Persistence model:
 *   - Pass `wall` + `initialLayout` to enable auto-save + Save to wall.
 *     Without them, the editor runs in "preview only" mode (no
 *     persistence, fine for the customer artwork-page sheet, etc.)
 *   - Auto-save PATCHes the layout 800ms after the last edit. The hook
 *     handles stale-while-saving so a fast typist can't outrun it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import dynamic from "next/dynamic";
import { apiErrorMessage, mutate } from "@/lib/api-client";
import { isFlagOn } from "@/lib/feature-flags";
import {
  buildProposalPlacement,
  type ProposalTerms,
  type ProposalVenue,
} from "@/lib/placements/wall-proposal-client";
import { hideFeedbackBubble } from "@/lib/ui/feedback-bubble-visibility";
import { useMediaQuery } from "@/lib/use-media-query";
import { CaptureError, captureErrorMessage } from "@/lib/visualizer/capture";
import {
  buildSizeVariants,
  parseDimensions,
  pickDefaultSize,
} from "@/lib/visualizer/dimensions";
import { wallPatchBody } from "@/lib/visualizer/wall-save";
import { defaultFrameConfig } from "@/lib/visualizer/frames";
import { PRESET_WALLS, getPresetWall } from "@/lib/visualizer/preset-walls";
import {
  previewFileName,
  previewFormatFromType,
} from "@/lib/visualizer/preview-image";
import { useAutoSave } from "@/lib/visualizer/use-auto-save";
import type {
  LayoutBackground,
  VisualizerEditorProps,
  Wall,
  WallItem,
  WallLayout,
} from "@/lib/visualizer/types";
import ItemToolbar from "./ItemToolbar";
import type { ProposalSendStatus } from "./ProposalSendPanel";
import RenderPreview, { type SaveToWallStatus } from "./RenderPreview";
import type { Wall3DCanvasHandle } from "./Wall3DCanvas";
import type { WallCanvasHandle } from "./WallCanvas";
import WorksPanel, { type PanelWork } from "./WorksPanel";

const WallCanvas = dynamic(() => import("./WallCanvas"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-stone-100 grid place-items-center text-xs text-stone-400">
      Loading canvas…
    </div>
  ),
});

const Wall3DCanvas = dynamic(() => import("./Wall3DCanvas"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-stone-100 grid place-items-center text-xs text-stone-400">
      Loading 3D scene…
    </div>
  ),
});

type ViewMode = "2d" | "3d";

// ── Constants ───────────────────────────────────────────────────────────

const DEFAULT_PRESET_ID = "minimal_white";
const DEFAULT_ITEM_WIDTH_CM = 60;
const DEFAULT_ITEM_HEIGHT_CM = 80;

// ── Public props ────────────────────────────────────────────────────────

interface ExtendedProps extends VisualizerEditorProps {
  /** Bearer token for authenticated API calls (works fetch, save, preview upload). */
  authToken?: string | null;
  /** Pre-supplied work to lock onto (artwork-page entry). */
  lockedWork?: PanelWork | null;
  /** Loaded wall, required for auto-save + Save to wall. */
  wall?: Wall | null;
  /** Loaded initial layout, required for auto-save + Save to wall. */
  initialLayout?: WallLayout | null;
  /**
   * Display URL for the wall photo (uploaded walls only). Resolved by
   * the parent page from the GET /api/walls/[id] response, the
   * Storage bucket is private so we can't use the path directly.
   */
  bgImageUrl?: string | null;
  /**
   * The venue whose wall this is, `artist_venue_wall` mode only. Drives the
   * arrangement choices in the Send step and where the request goes.
   */
  venue?: ProposalVenue | null;
}

interface CapturedPreview {
  /** The encoded capture, kept so Save to wall can upload it. */
  blob: Blob;
  /** Object URL for the modal's <img>; revoked when replaced or on unmount. */
  url: string;
  /** Which editor produced it, for the error copy. */
  view: ViewMode;
  /** wall_renders.id once this capture has been stored for the wall, so
   *  the mockup path can attach it without uploading twice. */
  renderId: string | null;
}

export default function WallVisualizer(props: ExtendedProps) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) return null;
  return <WallVisualizerInner {...props} />;
}

// ── Inner ───────────────────────────────────────────────────────────────

function WallVisualizerInner(props: ExtendedProps) {
  const fallbackPreset = getPresetWall(DEFAULT_PRESET_ID) ?? PRESET_WALLS[0];

  // ── Layout state, hydrated from `wall` + `initialLayout` if present
  const [background, setBackground] = useState<LayoutBackground>(() =>
    seedBackground(props.wall, fallbackPreset),
  );
  const [widthCm, setWidthCm] = useState(
    () => props.wall?.width_cm ?? fallbackPreset.defaultWidthCm,
  );
  const [heightCm, setHeightCm] = useState(
    () => props.wall?.height_cm ?? fallbackPreset.defaultHeightCm,
  );
  const [items, setItems] = useState<WallItem[]>(
    () => props.initialLayout?.items ?? [],
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("2d");

  // ── Preview flow state ────────────────────────────────────────────
  // The canvases hand their capture handle back through `handleRef`, an
  // ordinary prop: next/dynamic's loadable wrapper swallows a real `ref`
  // in the pages-runtime build, and a prop survives any wrapper.
  const canvasRef = useRef<WallCanvasHandle>(null);
  const canvas3dRef = useRef<Wall3DCanvasHandle>(null);
  const [previewInFlight, setPreviewInFlight] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CapturedPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Save-to-wall state for the current capture. Reset on every new
  // preview, since a fresh capture is a fresh thing to save.
  const [wallSaveStatus, setWallSaveStatus] = useState<SaveToWallStatus>("idle");
  const [wallSaveError, setWallSaveError] = useState<string | null>(null);

  // Object URLs are per-document allocations; release the previous one
  // when a new capture replaces it, and the last one on unmount.
  useEffect(() => {
    const url = preview?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview?.url]);

  // The feedback bubble shares the bottom-right corner with the Preview
  // pill. Hold it hidden for as long as this editor is mounted.
  useEffect(() => {
    const release = hideFeedbackBubble();
    return release;
  }, []);

  // ── Mobile UX ─────────────────────────────────────────────────────
  // On phones (and small tablets in portrait) the side rail of works
  // and the floating wall-config bar make the canvas unusable. Below
  // 768px we collapse the rail and the config bar into bottom-sheet
  // overlays toggled from a fixed bottom toolbar. The breakpoint
  // matches Tailwind's `md` so the change lines up with how the rest
  // of the site flips between mobile and tablet layouts.
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [mobileSheet, setMobileSheet] = useState<"works" | "wall" | null>(null);
  // If the viewport widens out of mobile range while a sheet is open
  // (e.g. landscape rotation on a small tablet) drop the overlay so
  // the desktop layout takes over cleanly.
  useEffect(() => {
    if (!isMobile) setMobileSheet(null);
  }, [isMobile]);

  // Mockup-save state, only relevant in artist modes. Tracked here
  // (rather than inside RenderPreview) so it survives previews opening
  // and closing, and so we can reset it on a fresh capture.
  const [mockupSaving, setMockupSaving] = useState(false);
  const [mockupSavedWorkId, setMockupSavedWorkId] = useState<string | null>(
    null,
  );
  const [mockupError, setMockupError] = useState<string | null>(null);

  // Wall proposal (artist_venue_wall): the Send step's progress. Reset on
  // every new capture, a fresh preview is a fresh thing to send.
  const [proposalStatus, setProposalStatus] = useState<ProposalSendStatus>("idle");
  const [proposalError, setProposalError] = useState<string | null>(null);

  const canPersist = Boolean(props.wall && props.initialLayout);
  // The venue's wall is not the artist's to change: no size, colour or
  // photo controls, and nothing is saved until Send.
  const wallLocked = props.mode === "artist_venue_wall";
  // Saved walls render flat (no 3D-feeling lighting or shadows) and stay in
  // 2D; the artwork-page sheet keeps its effects and the 3D view.
  const flatSaved = props.mode !== "customer_artwork_page";

  // ── Auto-save ─────────────────────────────────────────────────────
  // The value we save is the items array, the dimensions and, for preset
  // walls, the wall colour.
  //
  // E35: the colour used to be excluded on the premise that "background isn't
  // editable when persisting". It is: the config bar leaves the colour
  // controls enabled on a saved wall, so a recolour updated the canvas, was
  // never sent, and vanished on the next reload. Uploaded walls carry a photo
  // rather than a colour, so they contribute nothing here.
  const layoutSnapshot = useMemo(
    () => ({
      items,
      width_cm: widthCm,
      height_cm: heightCm,
      wall_color_hex: background.kind === "preset" ? background.color_hex : null,
    }),
    [items, widthCm, heightCm, background],
  );

  // Track the last successfully-saved wall dimensions so the
  // wall-PATCH gate stays accurate across multiple autosave cycles.
  // `props.wall` comes from the parent and only refreshes if the
  // parent re-fetches after save, without this ref we'd compare
  // against the stale prop and fire a wall PATCH on every save once
  // dimensions have changed even once. Initialised lazily from the
  // first wall snapshot so a freshly-mounted editor starts in sync.
  const lastSavedDimsRef = useRef<{
    width_cm: number;
    height_cm: number;
    wall_color_hex: string | null;
  } | null>(null);
  if (lastSavedDimsRef.current === null && props.wall) {
    lastSavedDimsRef.current = {
      width_cm: props.wall.width_cm,
      height_cm: props.wall.height_cm,
      wall_color_hex: props.wall.wall_color_hex ?? null,
    };
  }

  const saveLayout = useCallback(
    async (snap: {
      items: WallItem[];
      width_cm: number;
      height_cm: number;
      wall_color_hex: string | null;
    }) => {
      if (!props.wall || !props.initialLayout) return;
      const headers = {
        "content-type": "application/json",
        ...(props.authToken
          ? { Authorization: `Bearer ${props.authToken}` }
          : {}),
      };

      // Wall dimensions live on the WALL row (width_cm / height_cm),
      // not the layout, the layout owns items + per-item geometry,
      // the wall owns the physical canvas size. Previously this
      // callback only PATCHed the layout, so resizing the wall was
      // silently a no-op: items snapshot updated in autosave state,
      // dimensions changed locally, but the DB wall row stayed at
      // the original 300×240. Refreshing reverted the resize because
      // hydration reads from the wall row.
      //
      // Two PATCHes (wall first, then layout). The wall PATCH only
      // fires when dims actually changed since the last successful
      // save (tracked by lastSavedDimsRef so a stale `props.wall`
      // doesn't make every save re-fire the wall PATCH).
      const lastSaved =
        lastSavedDimsRef.current ?? {
          width_cm: props.wall.width_cm,
          height_cm: props.wall.height_cm,
          wall_color_hex: props.wall.wall_color_hex ?? null,
        };
      // E35: the colour rides the same gate as the dimensions. The decision
      // itself lives in wallPatchBody so it can be tested without mounting
      // the editor.
      const patchBody = wallPatchBody(snap, lastSaved);
      if (patchBody) {
        const wallRes = await fetch(`/api/walls/${props.wall.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(patchBody),
        });
        if (!wallRes.ok) {
          const txt = await wallRes.text().catch(() => "");
          throw new Error(
            `Save failed (${wallRes.status}): ${txt || wallRes.statusText}`,
          );
        }
        lastSavedDimsRef.current = {
          width_cm: snap.width_cm,
          height_cm: snap.height_cm,
          wall_color_hex: snap.wall_color_hex ?? lastSaved.wall_color_hex,
        };
      }

      const url = `/api/walls/${props.wall.id}/layouts/${props.initialLayout.id}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ items: snap.items }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Save failed (${res.status}): ${txt || res.statusText}`);
      }
    },
    [props.wall, props.initialLayout, props.authToken],
  );

  const {
    status: saveStatus,
    errorMessage: saveError,
    saveNow,
  } = useAutoSave(layoutSnapshot, saveLayout, { enabled: canPersist });

  // ── Works data (lifted from WorksPanel) ───────────────────────────
  // Single flat list (artist + customer modes).
  const [works, setWorks] = useState<PanelWork[]>([]);
  // Three sections (venue mode).
  const [myWorks, setMyWorks] = useState<PanelWork[]>([]);
  const [savedWorks, setSavedWorks] = useState<PanelWork[]>([]);
  const [allWorks, setAllWorks] = useState<PanelWork[]>([]);

  const [worksLoading, setWorksLoading] = useState(false);
  const [worksError, setWorksError] = useState<string | null>(null);

  useEffect(() => {
    if (props.lockedWork) {
      setWorks([props.lockedWork]);
      return;
    }

    if (props.mode === "venue_my_walls") {
      // Three parallel fetches, fail soft if any individual one breaks.
      let cancelled = false;
      setWorksLoading(true);
      setWorksError(null);

      const headers = props.authToken
        ? { Authorization: `Bearer ${props.authToken}` }
        : undefined;

      Promise.allSettled([
        fetch("/api/walls/my-works", { headers, cache: "no-store" }).then(
          (r) => (r.ok ? r.json() : { works: [] }),
        ),
        fetch("/api/walls/saved-works", { headers, cache: "no-store" }).then(
          (r) => (r.ok ? r.json() : { works: [] }),
        ),
        fetch("/api/browse-artists?limit=48", { headers, cache: "no-store" }).then(
          (r) => (r.ok ? r.json() : { artists: [] }),
        ),
      ])
        .then((results) => {
          if (cancelled) return;
          const [myRes, savedRes, browseRes] = results;

          const myList: PanelWork[] =
            myRes.status === "fulfilled"
              ? ((myRes.value.works ?? []) as Array<Record<string, unknown>>)
                  .map(normaliseWork)
                  .filter((w): w is PanelWork => w !== null)
              : [];
          setMyWorks(myList);

          const savedList: PanelWork[] =
            savedRes.status === "fulfilled"
              ? ((savedRes.value.works ?? []) as Array<Record<string, unknown>>)
                  .map(normaliseWork)
                  .filter((w): w is PanelWork => w !== null)
              : [];
          setSavedWorks(savedList);

          const allList: PanelWork[] =
            browseRes.status === "fulfilled"
              ? (
                  (browseRes.value.artists ?? []) as Array<{
                    works?: Array<Record<string, unknown>>;
                    name?: string;
                  }>
                )
                  .flatMap((a) =>
                    (a.works ?? []).map((w) => ({
                      ...w,
                      _artistName: a.name,
                    })),
                  )
                  .map(normaliseWork)
                  .filter((w): w is PanelWork => w !== null)
              : [];
          setAllWorks(allList);
        })
        .catch((e) => !cancelled && setWorksError(String(e)))
        .finally(() => !cancelled && setWorksLoading(false));

      return () => {
        cancelled = true;
      };
    }

    if (
      props.mode === "artist_mockup" ||
      props.mode === "artist_showroom" ||
      props.mode === "artist_venue_wall"
    ) {
      let cancelled = false;
      setWorksLoading(true);
      setWorksError(null);
      fetch("/api/artist-works", {
        headers: props.authToken
          ? { Authorization: `Bearer ${props.authToken}` }
          : {},
        cache: "no-store",
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((data: { works?: Array<Record<string, unknown>> }) => {
          if (cancelled) return;
          const mapped = (data.works ?? [])
            .map(normaliseWork)
            .filter((w): w is PanelWork => w !== null);
          setWorks(mapped);
        })
        .catch((e) => !cancelled && setWorksError(String(e)))
        .finally(() => !cancelled && setWorksLoading(false));
      return () => {
        cancelled = true;
      };
    }
  }, [props.mode, props.authToken, props.lockedWork]);

  /** id → work lookup; canvas uses this to load images per item, and
   *  the toolbar uses this to find size variants for the selected item. */
  const workById = useMemo<Record<string, PanelWork>>(() => {
    const all = [
      ...(props.lockedWork ? [props.lockedWork] : []),
      ...works,
      ...myWorks,
      ...savedWorks,
      ...allWorks,
    ];
    const out: Record<string, PanelWork> = {};
    for (const w of all) {
      if (!out[w.id]) out[w.id] = w; // first wins (most authoritative source first)
    }
    return out;
  }, [props.lockedWork, works, myWorks, savedWorks, allWorks]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  // ── Customer flow: auto-place the locked work on first paint ─────
  // Runs once when in `customer_artwork_page` mode with a lockedWork
  // that hasn't been placed yet. The work is dropped at the wall's
  // centre at its natural listed dimensions (or a sensible default).
  // Without this, customers see an empty wall, they shouldn't have to
  // drag the artwork they already chose.
  const autoSpawnedRef = useRef(false);
  useEffect(() => {
    if (autoSpawnedRef.current) return;
    if (props.mode !== "customer_artwork_page") return;
    if (!props.lockedWork) return;
    if (items.length > 0) return;

    autoSpawnedRef.current = true;

    const work = props.lockedWork;
    const picked = pickDefaultSize({
      dimensions: work.dimensions ?? null,
      variants: work.sizes ?? [],
      orientation: work.orientation,
    });

    let itemW = picked?.widthCm ?? Math.min(DEFAULT_ITEM_WIDTH_CM, widthCm * 0.4);
    let itemH = picked?.heightCm ?? Math.min(DEFAULT_ITEM_HEIGHT_CM, heightCm * 0.5);
    // Defensive cap so the natural size doesn't overflow the preset wall.
    itemW = Math.min(itemW, widthCm * 0.8);
    itemH = Math.min(itemH, heightCm * 0.8);

    const newItem: WallItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      work_id: work.id,
      x_cm: (widthCm - itemW) / 2,
      y_cm: (heightCm - itemH) / 2,
      width_cm: itemW,
      height_cm: itemH,
      rotation_deg: 0,
      z_index: 0,
      frame: defaultFrameConfig("none"),
      size_label: picked?.sizeLabel,
    };
    setItems([newItem]);
    setSelectedItemId(newItem.id);
  }, [props.mode, props.lockedWork, items.length, widthCm, heightCm]);

  // ── Wall config handlers ──────────────────────────────────────────
  // (Previously a `handlePickPreset` lived here that switched colour
  // AND dimensions atomically; it was wired to the swatches in
  // WallConfigBar but users read the swatches as a colour-only quick
  // pick. The dimensions were the surprise. Removed alongside the
  // swatch behaviour change. Future work: bring back a "Use preset…"
  // menu that explicitly mentions the dimension reset.)
  const handleColorChange = useCallback((hex: string) => {
    const clean = hex.replace(/^#/, "").toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(clean)) return;
    setBackground((prev) =>
      prev.kind === "preset" ? { ...prev, color_hex: clean } : prev,
    );
  }, []);

  // Customer-side wall photo upload. We don't persist to Storage here:
  // customers using "View on a wall" aren't saving a Wall row, they
  // just want to preview the artwork on their own space. A blob URL
  // keeps the photo client-side only.
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  useEffect(() => {
    return () => {
      if (customBgUrl) URL.revokeObjectURL(customBgUrl);
    };
  }, [customBgUrl]);
  const handleUploadPhoto = useCallback((file: File) => {
    if (customBgUrl) URL.revokeObjectURL(customBgUrl);
    const url = URL.createObjectURL(file);
    setCustomBgUrl(url);
    setBackground({ kind: "uploaded", image_path: url });
  }, [customBgUrl]);
  const effectiveBgImageUrl = customBgUrl ?? props.bgImageUrl ?? null;

  // ── Item mutations ────────────────────────────────────────────────
  /**
   * Add an item at (xCm, yCm). Resolves the size in this order:
   *   1. Explicit w/h passed in (drop handler with manual sizing)
   *   2. The work's natural `widthCm/heightCm` (parsed from dimensions string)
   *   3. The smallest size variant from pricing[]
   *   4. Default 60×80 cm clamp to the wall
   */
  const addItemAt = useCallback(
    (workId: string, xCm: number, yCm: number, w?: number, h?: number) => {
      const work = workById[workId];

      let itemW: number;
      let itemH: number;
      let sizeLabel: string | undefined;

      if (w && h) {
        itemW = w;
        itemH = h;
      } else if (work) {
        const picked = pickDefaultSize({
          dimensions: work.dimensions ?? null,
          variants: work.sizes ?? [],
          orientation: work.orientation,
        });
        if (picked) {
          itemW = picked.widthCm;
          itemH = picked.heightCm;
          sizeLabel = picked.sizeLabel;
        } else {
          itemW = Math.min(DEFAULT_ITEM_WIDTH_CM, widthCm * 0.4);
          itemH = Math.min(DEFAULT_ITEM_HEIGHT_CM, heightCm * 0.5);
        }
      } else {
        itemW = Math.min(DEFAULT_ITEM_WIDTH_CM, widthCm * 0.4);
        itemH = Math.min(DEFAULT_ITEM_HEIGHT_CM, heightCm * 0.5);
      }

      // Defensive clamp so a giant artwork can't be placed at a size
      // that bursts the wall and confuses the canvas. Cap to wall bounds.
      const cappedW = Math.min(itemW, widthCm * 0.95);
      const cappedH = Math.min(itemH, heightCm * 0.95);

      const newItem: WallItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        work_id: workId,
        x_cm: xCm - cappedW / 2,
        y_cm: yCm - cappedH / 2,
        width_cm: cappedW,
        height_cm: cappedH,
        rotation_deg: 0,
        z_index: items.length,
        frame: defaultFrameConfig("none"),
        size_label: sizeLabel,
      };
      setItems((prev) => [...prev, newItem]);
      setSelectedItemId(newItem.id);
    },
    [widthCm, heightCm, items.length, workById],
  );

  const handleSelectFromPanel = useCallback(
    (work: PanelWork) => {
      // Place at wall centre when clicked (vs dropped).
      addItemAt(work.id, widthCm / 2, heightCm / 2);
    },
    [addItemAt, widthCm, heightCm],
  );

  const handleItemChange = useCallback(
    (id: string, partial: Partial<WallItem>) => {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...partial } : i)),
      );
    },
    [],
  );

  // Arrow keys nudge the selected artwork: 1 cm, Shift for 5 cm, Alt for
  // 0.1 cm, so a print can be lined up to a rail without a drag jumping it.
  useEffect(() => {
    if (!selectedItemId) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const d = delta[e.key];
      if (!d) return;
      const item = items.find((it) => it.id === selectedItemId);
      if (!item) return;
      e.preventDefault();
      const step = e.shiftKey ? 5 : e.altKey ? 0.1 : 1;
      handleItemChange(selectedItemId, {
        x_cm: Math.round((item.x_cm + d[0] * step) * 10) / 10,
        y_cm: Math.round((item.y_cm + d[1] * step) * 10) / 10,
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedItemId, items, handleItemChange]);

  const handleBringForward = useCallback(() => {
    if (!selectedItemId) return;
    setItems((prev) => {
      const maxZ = prev.reduce((m, i) => Math.max(m, i.z_index), 0);
      return prev.map((i) =>
        i.id === selectedItemId ? { ...i, z_index: maxZ + 1 } : i,
      );
    });
  }, [selectedItemId]);

  const handleSendBack = useCallback(() => {
    if (!selectedItemId) return;
    setItems((prev) => {
      const minZ = prev.reduce((m, i) => Math.min(m, i.z_index), 0);
      return prev.map((i) =>
        i.id === selectedItemId ? { ...i, z_index: minZ - 1 } : i,
      );
    });
  }, [selectedItemId]);

  const handleDuplicate = useCallback(() => {
    if (!selectedItem) return;
    const copy: WallItem = {
      ...selectedItem,
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      // Offset slightly so users can see they got two.
      x_cm: selectedItem.x_cm + 5,
      y_cm: selectedItem.y_cm + 5,
      z_index: items.length,
    };
    setItems((prev) => [...prev, copy]);
    setSelectedItemId(copy.id);
  }, [selectedItem, items.length]);

  const handleDelete = useCallback(() => {
    if (!selectedItemId) return;
    setItems((prev) => prev.filter((i) => i.id !== selectedItemId));
    setSelectedItemId(null);
  }, [selectedItemId]);

  // ── Preview flow ──────────────────────────────────────────────────
  // Preview is a capture of the editor stage itself (see capture.ts), so
  // it matches what is on screen to the pixel. Nothing is fetched and
  // nothing is metered, so it works the same for a saved wall and for
  // the customer artwork-page sheet.
  //
  // The selection is dropped first, synchronously: a selected item draws
  // without its shadow (the Transformer's bounding box needs that), and
  // the preview should show the wall as it looks at rest. flushSync
  // commits the deselect, and react-konva commits the Konva tree inside
  // that same layout pass, so the capture that follows sees it.
  const handlePreview = useCallback(async () => {
    if (previewInFlight) return;
    if (items.length === 0) {
      setPreviewError("Drag at least one artwork onto the wall.");
      return;
    }

    setPreviewInFlight(true);
    setPreviewError(null);
    try {
      flushSync(() => setSelectedItemId(null));
      const handle = viewMode === "3d" ? canvas3dRef.current : canvasRef.current;
      if (!handle) {
        throw new CaptureError("unsupported", "The wall hasn't finished loading yet.");
      }
      const blob = await handle.captureImage();
      setPreview({
        blob,
        url: URL.createObjectURL(blob),
        view: viewMode,
        renderId: null,
      });
      // Fresh capture → fresh save state, on both the wall and the
      // mockup paths. The artist might want to attach this new preview
      // to a different work than last time.
      setWallSaveStatus("idle");
      setWallSaveError(null);
      setMockupSavedWorkId(null);
      setMockupError(null);
      setProposalStatus("idle");
      setProposalError(null);
      setPreviewOpen(true);
    } catch (err) {
      setPreviewError(captureErrorMessage(err, viewMode));
    } finally {
      setPreviewInFlight(false);
    }
  }, [items.length, previewInFlight, viewMode]);

  // Auto-clear preview errors after a few seconds.
  useEffect(() => {
    if (!previewError) return;
    const t = setTimeout(() => setPreviewError(null), 5000);
    return () => clearTimeout(t);
  }, [previewError]);

  /**
   * Store the current capture against the saved wall's layout and return
   * its wall_renders id. Flushes the layout auto-save first so the items
   * on record are the ones in the picture, then uploads the image. Runs
   * once per capture: a second call returns the id already obtained.
   *
   * Same shape as the wall-photo upload: a plain fetch carrying the
   * bearer token, a multipart body, `res.ok` checked and thrown on, so a
   * rejected write can never read as a success.
   */
  const storePreview = useCallback(async (): Promise<string> => {
    if (!preview) throw new Error("Nothing to save, preview the wall first.");
    if (preview.renderId) return preview.renderId;
    if (!props.wall || !props.initialLayout) {
      throw new Error("Save the wall first to keep a preview.");
    }

    const flushed = await saveNow();
    if (flushed === "error") {
      throw new Error("The layout couldn't be saved, so the preview wasn't stored. Try again.");
    }

    const format = previewFormatFromType(preview.blob.type);
    const fd = new FormData();
    fd.append("image", preview.blob, previewFileName(format));
    const res = await fetch(
      `/api/walls/${props.wall.id}/layouts/${props.initialLayout.id}/preview`,
      {
        method: "POST",
        headers: props.authToken
          ? { Authorization: `Bearer ${props.authToken}` }
          : {},
        body: fd,
      },
    );
    if (res.status === 401) {
      throw new Error("Session expired. Please sign in again.");
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Save failed (${res.status})`);
    }
    const json = (await res.json()) as { render: { id: string }; publicUrl: string };
    const capturedUrl = preview.url;
    setPreview((prev) =>
      prev && prev.url === capturedUrl ? { ...prev, renderId: json.render.id } : prev,
    );
    // Whichever path stored it, the wall now carries this preview.
    setWallSaveStatus("saved");
    return json.render.id;
  }, [preview, props.wall, props.initialLayout, props.authToken, saveNow]);

  const handleSaveToWall = useCallback(async () => {
    if (wallSaveStatus === "saving" || wallSaveStatus === "saved") return;
    setWallSaveStatus("saving");
    setWallSaveError(null);
    try {
      await storePreview();
    } catch (err) {
      setWallSaveStatus("error");
      setWallSaveError(
        err instanceof Error ? err.message : "Save failed unexpectedly.",
      );
    }
  }, [wallSaveStatus, storePreview]);

  /**
   * Promote the current preview to a mockup on the chosen artwork. The
   * capture is stored first (once), then attached by its render id. Each
   * successful save sets `mockupSavedWorkId` so the button reads "Saved".
   */
  const saveAsMockup = useCallback(
    async (workId: string) => {
      if (!preview) {
        setMockupError("Nothing to save, preview the wall first.");
        return;
      }
      setMockupSaving(true);
      setMockupError(null);
      try {
        const renderId = await storePreview();
        const res = await fetch(`/api/works/${workId}/mockups`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(props.authToken
              ? { Authorization: `Bearer ${props.authToken}` }
              : {}),
          },
          body: JSON.stringify({ render_id: renderId }),
        });
        if (res.status === 401) {
          // Expired session, bounce out so AuthContext picks up the
          // logout and re-redirects on the next render.
          setMockupError("Session expired. Please sign in again.");
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Save failed (${res.status})`);
        }
        setMockupSavedWorkId(workId);
      } catch (err) {
        setMockupError(
          err instanceof Error ? err.message : "Save failed unexpectedly.",
        );
      } finally {
        setMockupSaving(false);
      }
    },
    [preview, storePreview, props.authToken],
  );

  /**
   * Send the capture to the venue as a placement request (artist_venue_wall).
   * In order: a placement id is minted, the capture and the items are stored
   * as a wall proposal under that id (multipart, a plain fetch carrying the
   * bearer token with `res.ok` checked, as the preview upload does), then
   * the placement is created through `mutate` with the proposal's layout id
   * on it. Server refusals are shown word for word: the under-review copy,
   * the outreach cap, a validation failure.
   */
  const handleSendProposal = useCallback(
    async (terms: ProposalTerms) => {
      const venue = props.venue;
      const wall = props.wall;
      if (!preview || !venue || !wall) {
        setProposalStatus("error");
        setProposalError("Preview the wall first.");
        return;
      }
      setProposalStatus("sending");
      setProposalError(null);
      try {
        const placementId = crypto.randomUUID();

        const format = previewFormatFromType(preview.blob.type);
        const fd = new FormData();
        fd.append("image", preview.blob, previewFileName(format));
        fd.append("items", JSON.stringify(items));
        fd.append("placementId", placementId);
        const res = await fetch(
          `/api/venues/${encodeURIComponent(venue.slug)}/walls/${encodeURIComponent(wall.id)}/proposals`,
          {
            method: "POST",
            headers: props.authToken
              ? { Authorization: `Bearer ${props.authToken}` }
              : {},
            body: fd,
          },
        );
        if (res.status === 401) {
          throw new Error("Session expired. Please sign in again.");
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          throw new Error(body.message || body.error || `Upload failed (${res.status})`);
        }
        const { layoutId } = (await res.json()) as { layoutId: string };

        const placement = buildProposalPlacement({
          placementId,
          venueSlug: venue.slug,
          items,
          workById,
          terms,
          layoutId,
        });
        if (!placement) {
          throw new Error("Drag at least one of your works onto the wall.");
        }
        await mutate("/api/placements", {
          method: "POST",
          body: JSON.stringify({ fromVenue: false, placements: [placement] }),
        });
        setProposalStatus("sent");
      } catch (err) {
        setProposalStatus("error");
        setProposalError(
          apiErrorMessage(err, err instanceof Error ? err.message : "Could not send the proposal."),
        );
      }
    },
    [preview, props.venue, props.wall, props.authToken, items, workById],
  );

  // ── Render ──────────────────────────────────────────────────────────
  // Common props for WorksPanel — used at two render points (the
  // desktop side rail, and the mobile bottom-sheet variant). Tap-to-
  // place inside the mobile sheet auto-closes it so the user sees the
  // wall immediately after picking a work.
  const worksPanelProps = {
    mode: props.mode,
    works,
    myWorks,
    savedWorks,
    allWorks,
    loading: worksLoading,
    error: worksError,
    onSelect: (w: PanelWork) => {
      handleSelectFromPanel(w);
      if (isMobile) setMobileSheet(null);
    },
  };

  // Whether the floating Preview button should be shown at all. Same
  // gate the desktop branch used; reused for the mobile toolbar.
  const previewButtonVisible =
    canPersist ||
    ((props.mode === "customer_artwork_page" || wallLocked) && items.length > 0);

  return (
    <div className="flex h-full w-full bg-stone-50">
      {!isMobile && <WorksPanel {...worksPanelProps} />}

      <div className="relative flex-1 min-w-0">
        {viewMode === "3d" ? (
          <Wall3DCanvas
            handleRef={canvas3dRef}
            background={background}
            widthCm={widthCm}
            heightCm={heightCm}
            items={items}
            workById={workById}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            onItemChange={handleItemChange}
            onAddItem={(workId, xCm, yCm) => addItemAt(workId, xCm, yCm)}
            bgImageUrl={effectiveBgImageUrl}
          />
        ) : (
          <WallCanvas
            flat={flatSaved}
            handleRef={canvasRef}
            background={background}
            widthCm={widthCm}
            heightCm={heightCm}
            items={items}
            workById={workById}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            onItemChange={handleItemChange}
            onAddItem={(workId, xCm, yCm) => addItemAt(workId, xCm, yCm)}
            bgImageUrl={effectiveBgImageUrl}
          />
        )}

        {/* Empty-canvas hint, sits over the canvas (pointer-events
            disabled) so it never steals drag targets. Shown when
            there's nothing on the wall yet, the 3D view in particular
            reads as a blank room without it. Auto-hides as soon as an
            item lands. */}
        {items.length === 0 && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden="true"
          >
            <div className="bg-white/85 backdrop-blur-sm border border-border rounded-sm px-4 py-3 text-center max-w-xs shadow-sm">
              <p className="text-sm font-medium text-foreground">
                {wallLocked && props.venue
                  ? `${props.venue.name}'s wall`
                  : viewMode === "3d"
                    ? "Your wall, in 3D"
                    : "Your blank wall"}
              </p>
              <p className="text-xs text-muted mt-1">
                {wallLocked
                  ? "Drag one of your works onto the wall to show the venue how it would look, then press Preview to send it."
                  : "Drag a work from the sidebar onto the wall to see how it would look in this space."}
              </p>
            </div>
          </div>
        )}

        {/* Top-right, save status. The 2D/3D toggle used to live here
            too but the centred ItemToolbar (top centre) gets wide
            enough to overlap, so the toggle moved to its own
            bottom-left perch. */}
        {canPersist && (
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <SaveStatus
              status={saveStatus}
              error={saveError}
              onSaveNow={() => {
                void saveNow();
              }}
            />
          </div>
        )}

        {/* Bottom-left, 2D / 3D toggle. Clear of the centred wall
            config bar (bottom-centre) and the centred item toolbar
            (top-centre). */}
        <div className="absolute bottom-3 left-3 z-10">
          {!flatSaved && <ViewModeToggle value={viewMode} onChange={setViewMode} />}
        </div>

        {/* Per-item toolbar, top centre when an item is selected.
            Wrapper spans the full top band of the canvas and uses
            flex justify-center to centre the pill. The older
            `left-1/2 -translate-x-1/2` pattern constrained the
            absolute element's shrink-to-fit width to 50% of the
            canvas, forcing the toolbar to wrap onto two rows
            (Delete spilled below) even when there was plenty of
            horizontal room. pointer-events-none on the strip means
            empty space still passes clicks through to the canvas. */}
        {selectedItem && (
          <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-center">
            <div className="pointer-events-auto">
              <ItemToolbar
                item={selectedItem}
                sizes={workById[selectedItem.work_id]?.sizes}
                orientation={workById[selectedItem.work_id]?.orientation}
                onChange={(partial) => handleItemChange(selectedItem.id, partial)}
                onBringForward={handleBringForward}
                onSendBack={handleSendBack}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
              />
            </div>
          </div>
        )}

        {/* Bottom-centre wall config bar — desktop only. On mobile this
            collapses into the "Wall" entry of the bottom toolbar,
            which opens a slide-up sheet hosting the same controls.
            Full-width-strip + flex justify-center, same fix as the
            item toolbar above. The older `left-1/2 -translate-x-1/2`
            constrained the bar's shrink-to-fit width to 50% of the
            canvas, which forced Upload photo / Close onto a second
            row even on wide screens. When the Preview button is
            visible at bottom-right we narrow the strip's right
            boundary so the bar can't drift under it on tighter
            viewports. */}
        {!isMobile && !wallLocked && (
          <div
            className={`pointer-events-none absolute bottom-3 flex justify-center ${
              previewButtonVisible
                ? "left-3 right-[8.5rem]"
                : "inset-x-3"
            }`}
          >
            <div className="pointer-events-auto max-w-full">
              <WallConfigBar
                colorHex={
                  background.kind === "preset" ? background.color_hex : "FFFFFF"
                }
                widthCm={widthCm}
                heightCm={heightCm}
                onColorChange={handleColorChange}
                onWidthChange={(v) => setWidthCm(clampDimension(v))}
                onHeightChange={(v) => setHeightCm(clampDimension(v))}
                onUploadPhoto={props.mode === "customer_artwork_page" ? handleUploadPhoto : undefined}
                onClose={props.onClose}
              />
            </div>
          </div>
        )}

        {/* Bottom-right floating Preview button — desktop only.
            Visible whenever there's something to preview, either a
            saved wall+layout (venue/artist editor) OR a customer-flow
            sheet with a locked work auto-placed. The mobile toolbar
            below carries the equivalent button. The feedback bubble,
            which normally sits in this corner, is held hidden while
            the editor is mounted so it can never cover this. */}
        {!isMobile && previewButtonVisible && (
          <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2">
            {previewError && (
              <div role="alert" className="px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs max-w-[260px] text-right">
                {previewError}
              </div>
            )}
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewInFlight}
              className="px-4 py-2 rounded-full bg-stone-900 text-white text-sm font-medium shadow-lg hover:bg-stone-800 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {previewInFlight ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  Previewing…
                </>
              ) : (
                <>
                  <PreviewIcon />
                  Preview
                </>
              )}
            </button>
          </div>
        )}

        {/* Mobile-only: a single stacked toolbar at the bottom — a
            collapsible works strip (peek/collapsed states), an
            optional preview-error banner, and a slim iOS-style action
            bar (wall-settings icon + Preview). The wall stays
            dominant because the strip is short and collapsable, and
            the action bar is only ~52px tall. The full WorksPanel
            and WallConfigBar still live in slide-up sheets, but
            those are now opt-in rather than the only entry point. */}
        {isMobile && (
          <>
            <div
              className="absolute bottom-0 left-0 right-0 z-20 flex flex-col bg-white/95 backdrop-blur border-t border-black/10"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              {/* Customer-artwork-page mode locks onto a single work
                  that auto-spawns; a one-tile carousel adds clutter
                  without value, so skip the strip entirely there. */}
              {props.mode !== "customer_artwork_page" && (
                <MobileWorksStrip
                  works={
                    props.mode === "venue_my_walls"
                      ? [...myWorks, ...savedWorks, ...allWorks]
                      : works
                  }
                  loading={worksLoading}
                  error={worksError}
                  onSelect={handleSelectFromPanel}
                  onExpand={() => setMobileSheet("works")}
                />
              )}

              {previewError && (
                <div role="alert" className="px-3 py-1.5 bg-red-50 border-t border-red-200 text-red-700 text-xs text-center">
                  {previewError}
                </div>
              )}

              <MobileActionBar
                wallActive={mobileSheet === "wall"}
                wallSettingsVisible={!wallLocked}
                onToggleWall={() =>
                  setMobileSheet((prev) => (prev === "wall" ? null : "wall"))
                }
                previewVisible={previewButtonVisible}
                previewInFlight={previewInFlight}
                onPreview={handlePreview}
              />
            </div>

            {/* Sheet overlays sit above the toolbar (z-30 vs z-20). */}
            {mobileSheet === "works" && (
              <MobileSheet
                title="All works"
                onClose={() => setMobileSheet(null)}
              >
                {/* WorksPanel ships an `aside w-60` rail; in the sheet
                    we override its width to fill, drop the right
                    border (the sheet draws its own divider) and let
                    the background show through. */}
                <div className="h-full w-full [&>aside]:!w-full [&>aside]:!border-r-0 [&>aside]:!bg-transparent [&>aside]:!backdrop-blur-none">
                  <WorksPanel {...worksPanelProps} />
                </div>
              </MobileSheet>
            )}

            {mobileSheet === "wall" && !wallLocked && (
              <MobileSheet
                title="Wall settings"
                onClose={() => setMobileSheet(null)}
                autoHeight
              >
                <div className="p-4">
                  <WallConfigBar
                    colorHex={
                      background.kind === "preset"
                        ? background.color_hex
                        : "FFFFFF"
                    }
                    widthCm={widthCm}
                    heightCm={heightCm}
                    onColorChange={handleColorChange}
                    onWidthChange={(v) => setWidthCm(clampDimension(v))}
                    onHeightChange={(v) => setHeightCm(clampDimension(v))}
                    onUploadPhoto={props.mode === "customer_artwork_page" ? handleUploadPhoto : undefined}
                    // Don't pipe the parent's onClose through on mobile —
                    // the sheet has its own close button, and tapping
                    // "Close" inside the WallConfigBar would shut the
                    // whole visualizer, not just the sheet.
                    onClose={undefined}
                  />
                </div>
              </MobileSheet>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <RenderPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        imageUrl={preview?.url ?? null}
        downloadName={
          preview
            ? previewFileName(previewFormatFromType(preview.blob.type))
            : undefined
        }
        // Hide the Download button + apply anti-save attributes when
        // the viewer is a venue. Realistic save-prevention only,
        // determined users can still screenshot, but right-click,
        // drag-to-desktop, and the explicit Download CTA are gone.
        // Artists keep download access because they want to share
        // their previews on socials / attach to mockups.
        venueViewer={props.mode === "venue_my_walls"}
        // Save to wall needs a saved wall + layout to store against;
        // the customer artwork-page sheet has neither, so it gets
        // Preview only.
        saveToWall={
          canPersist
            ? {
                onSave: () => {
                  void handleSaveToWall();
                },
                status: wallSaveStatus,
                error: wallSaveError,
                label:
                  props.mode === "venue_my_walls"
                    ? "Save this preview to my wall"
                    : props.mode === "artist_showroom"
                      ? "Save this preview to my showroom"
                      : "Save to wall",
                savedLabel: "Saved",
                hint:
                  props.mode === "venue_my_walls"
                    ? "It becomes this wall's picture on My Walls and, when the wall is shown on your public profile, there too."
                    : props.mode === "artist_showroom"
                      ? "It becomes this wall's picture in your Showroom and, when the wall is shown on your profile, there too."
                      : "It becomes this wall's picture in your wall list.",
              }
            : undefined
        }
        // The mockup path stores the capture first (the same upload as
        // Save to wall), then attaches it, so it only needs a saved wall.
        saveToArtwork={
          (props.mode === "artist_mockup" ||
            props.mode === "artist_showroom") &&
          canPersist &&
          works.length > 0
            ? {
                works: works.map((w) => ({
                  id: w.id,
                  title: w.title,
                  image: w.imageUrl,
                })),
                preferredWorkId: props.lockedWork?.id ?? null,
                onSave: saveAsMockup,
                saving: mockupSaving,
                savedWorkId: mockupSavedWorkId,
                error: mockupError,
              }
            : undefined
        }
        // The artist's Send step, only when laying out on a venue's wall.
        proposal={
          wallLocked && props.venue && props.wall
            ? {
                venue: props.venue,
                wallName: props.wall.name,
                status: proposalStatus,
                error: proposalError,
                onSend: (terms) => {
                  void handleSendProposal(terms);
                },
              }
            : undefined
        }
      />
    </div>
  );
}

// ── Preview icon ────────────────────────────────────────────────────────

function PreviewIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ── View mode toggle (2D / 3D) ──────────────────────────────────────────

function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-white/85 backdrop-blur border border-black/10 shadow-sm text-xs"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "2d"}
        title="Flat 2D editor, fast, precise alignment"
        onClick={() => onChange("2d")}
        className={`px-2.5 py-1 rounded-full transition ${
          value === "2d"
            ? "bg-stone-900 text-white"
            : "text-stone-600 hover:text-stone-900"
        }`}
      >
        2D
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "3d"}
        title="3D room, orbit-rotate to see how it'd look in person"
        onClick={() => onChange("3d")}
        className={`px-2.5 py-1 rounded-full transition ${
          value === "3d"
            ? "bg-stone-900 text-white"
            : "text-stone-600 hover:text-stone-900"
        }`}
      >
        3D
      </button>
    </div>
  );
}

// ── Save status ──────────────────────────────────────────────────────────

function SaveStatus({
  status,
  error,
  onSaveNow,
}: {
  status: ReturnType<typeof useAutoSave>["status"];
  error: string | null;
  onSaveNow?: () => void;
}) {
  let label = "";
  let dotColour = "bg-stone-300";
  let textColour = "text-stone-500";
  if (status === "idle") {
    label = "All saved";
  } else if (status === "dirty") {
    label = "Unsaved";
    dotColour = "bg-amber-400";
    textColour = "text-amber-700";
  } else if (status === "saving") {
    label = "Saving…";
    dotColour = "bg-stone-400 animate-pulse";
  } else if (status === "saved") {
    label = "Saved";
    dotColour = "bg-emerald-500";
    textColour = "text-stone-600";
  } else if (status === "error") {
    label = "Save failed";
    dotColour = "bg-red-500";
    textColour = "text-red-700";
  }

  // Show an explicit "Save" button when there's something to save,
  // either the user has unsaved edits, or the last save failed and
  // they want to retry. While saving (debounced auto-save in flight)
  // we hide the button so users can't double-fire.
  const showSaveBtn =
    onSaveNow && (status === "dirty" || status === "error");

  return (
    <div className="inline-flex items-center gap-1">
      <div
        title={error ?? undefined}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur border border-black/5 text-xs"
      >
        <span className={`h-2 w-2 rounded-full ${dotColour}`} />
        <span className={textColour}>{label}</span>
      </div>
      {showSaveBtn && (
        <button
          type="button"
          onClick={onSaveNow}
          className="px-3 py-1.5 rounded-full bg-stone-900 text-white text-xs font-medium hover:bg-stone-800"
        >
          {status === "error" ? "Retry save" : "Save now"}
        </button>
      )}
    </div>
  );
}

// ── Wall config bar ─────────────────────────────────────────────────────

interface ConfigProps {
  colorHex: string;
  widthCm: number;
  heightCm: number;
  onColorChange: (hex: string) => void;
  onWidthChange: (v: number) => void;
  onHeightChange: (v: number) => void;
  onUploadPhoto?: (file: File) => void;
  onClose?: () => void;
}

function WallConfigBar({
  colorHex,
  widthCm,
  heightCm,
  onColorChange,
  onWidthChange,
  onHeightChange,
  onUploadPhoto,
  onClose,
}: ConfigProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2 rounded-2xl sm:rounded-full bg-white/85 backdrop-blur border border-black/5 shadow-sm max-w-full">
      {/* Colour quick-picks from the preset palette. Previously each
          chip switched the entire preset (colour + dimensions), which
          surprised users who saw a "colour swatch" but got an
          unexpected wall resize. Decoupled, the chip writes the
          preset's colour and leaves widthCm/heightCm alone. The W/H
          inputs are the only way to change dimensions. The active-
          chip ring stays on whichever chip matches the current colour
          (purely cosmetic feedback, no functional link to presets). */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {PRESET_WALLS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={`${p.name} colour`}
            onClick={() => onColorChange(`#${p.defaultColorHex}`)}
            className={`h-7 w-7 sm:h-6 sm:w-6 rounded-full border ${
              colorHex.toUpperCase() === p.defaultColorHex.toUpperCase()
                ? "ring-2 ring-stone-900 ring-offset-1"
                : "border-black/10"
            }`}
            style={{ backgroundColor: `#${p.defaultColorHex}` }}
          />
        ))}
      </div>

      <span className="hidden sm:inline-block h-4 w-px bg-black/10" />

      <label className="flex items-center gap-1.5 text-[11px] text-stone-600 flex-shrink-0">
        <span>Colour</span>
        <input
          type="color"
          value={`#${colorHex}`}
          onChange={(e) => onColorChange(e.target.value)}
          className="h-6 w-8 sm:h-5 sm:w-7 rounded border border-black/10 bg-transparent cursor-pointer"
        />
      </label>

      {onUploadPhoto && (
        <>
          <span className="hidden sm:inline-block h-4 w-px bg-black/10" />
          <label className="flex items-center gap-1 text-[11px] text-stone-600 cursor-pointer hover:text-stone-900 flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Upload photo</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadPhoto(file);
                e.target.value = "";
              }}
            />
          </label>
        </>
      )}

      <span className="hidden sm:inline-block h-4 w-px bg-black/10" />

      <div className="flex items-center gap-2 sm:gap-3">
        <label className="flex items-center gap-1 text-[11px] text-stone-600">
          <span>W</span>
          <input
            type="number"
            min={50}
            max={1000}
            step={5}
            value={widthCm}
            onChange={(e) => onWidthChange(Number(e.target.value))}
            className="w-14 rounded border border-black/10 px-1 py-1 sm:py-0.5 text-xs"
          />
          <span className="text-stone-400">cm</span>
        </label>

        <label className="flex items-center gap-1 text-[11px] text-stone-600">
          <span>H</span>
          <input
            type="number"
            min={50}
            max={1000}
            step={5}
            value={heightCm}
            onChange={(e) => onHeightChange(Number(e.target.value))}
            className="w-14 rounded border border-black/10 px-1 py-1 sm:py-0.5 text-xs"
          />
          <span className="text-stone-400">cm</span>
        </label>
      </div>

      {onClose && (
        <>
          <span className="hidden sm:inline-block h-4 w-px bg-black/10" />
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-stone-500 hover:text-stone-900 ml-auto sm:ml-0"
          >
            Close
          </button>
        </>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function seedBackground(
  wall: Wall | null | undefined,
  fallback: { id: string; defaultColorHex: string },
): LayoutBackground {
  if (!wall) {
    return {
      kind: "preset",
      preset_id: fallback.id,
      color_hex: fallback.defaultColorHex,
    };
  }
  if (wall.kind === "uploaded") {
    return {
      kind: "uploaded",
      image_path: wall.source_image_path ?? "",
    };
  }
  return {
    kind: "preset",
    preset_id: wall.preset_id ?? fallback.id,
    color_hex: wall.wall_color_hex ?? fallback.defaultColorHex,
  };
}

function normaliseWork(raw: Record<string, unknown>): PanelWork | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  const title = typeof raw.title === "string" ? raw.title : null;
  const image = typeof raw.image === "string" ? raw.image : null;
  if (!id || !title || !image) return null;

  const dimensions =
    typeof raw.dimensions === "string" ? raw.dimensions : undefined;
  const parsedNatural = dimensions ? parseDimensions(dimensions) : null;

  // `pricing` may be an array of {label, price, ...} from artist_works,
  // or absent on placement-derived rows. Fall back to undefined.
  const pricingArr = Array.isArray(raw.pricing)
    ? (raw.pricing as Array<Record<string, unknown>>)
        .map((p) => ({
          label: typeof p.label === "string" ? p.label : "",
          price: typeof p.price === "number" ? p.price : undefined,
        }))
        .filter((p) => !!p.label)
    : null;
  const sizes = pricingArr ? buildSizeVariants(pricingArr) : [];

  // Additional aliases, the venue panel feed annotates each work with
  // its parent artist's name; pick that up.
  const artistName =
    typeof raw.artistName === "string"
      ? raw.artistName
      : typeof (raw as { _artistName?: unknown })._artistName === "string"
        ? ((raw as { _artistName: string })._artistName)
        : undefined;

  // Pull orientation if the API surfaced it. Some sources won't (the
  // placement-derived endpoint stores work_image only), that's fine,
  // pickDefaultSize tolerates it being absent.
  const rawOrientation =
    typeof raw.orientation === "string" ? raw.orientation : undefined;
  const orientation: PanelWork["orientation"] =
    rawOrientation === "portrait" ||
    rawOrientation === "landscape" ||
    rawOrientation === "square"
      ? rawOrientation
      : undefined;

  return {
    id,
    title,
    imageUrl: image,
    artistName,
    dimensions,
    widthCm: parsedNatural?.widthCm,
    heightCm: parsedNatural?.heightCm,
    sizes: sizes.length > 0 ? sizes : undefined,
    orientation,
  };
}

function clampDimension(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(1000, Math.max(50, Math.round(value)));
}

// ── Mobile works strip (collapsible peek carousel) ─────────────────────

/**
 * A horizontal-scroll strip of work thumbnails pinned just above the
 * action bar on mobile. Replaces the full-screen "Works" bottom sheet
 * as the primary picker so the wall stays visually dominant — only
 * ~96px of vertical space is given up by default, and the user can
 * collapse the strip down to a thin 28px tab when they want the wall
 * fully unobstructed.
 *
 * Tap a thumbnail to drop the work onto the wall (the parent's
 * onSelect places it at wall centre). For full search, filtering, and
 * tabs (venue mode), tap "See all" to open the full WorksPanel in a
 * sheet.
 */
function MobileWorksStrip({
  works,
  loading,
  error,
  onSelect,
  onExpand,
}: {
  works: PanelWork[];
  loading: boolean | undefined;
  error: string | null | undefined;
  onSelect: (w: PanelWork) => void;
  onExpand: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  // Cap the inline carousel; if the user has hundreds of saved works
  // we don't want the strip's scroll list to grow without bound.
  // "See all" opens the full sheet for that case.
  const MAX_PREVIEW = 24;
  const previewWorks = works.slice(0, MAX_PREVIEW);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-stone-600 hover:text-stone-900 transition-colors"
        aria-label="Show works"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
        <span className="font-medium tracking-wide uppercase">
          Works
          {works.length > 0 && (
            <span className="ml-1 text-stone-400 normal-case tracking-normal">
              · {works.length}
            </span>
          )}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header row: collapse toggle on the left, "See all" link on
          the right. Compact (28px tall) so most of the strip's
          vertical budget goes to the thumbnails themselves. */}
      <div className="flex items-center justify-between px-3 pt-1.5">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Hide works"
          className="-ml-1 p-1 flex items-center gap-1 text-[10px] text-stone-500 hover:text-stone-900 transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span className="font-medium uppercase tracking-[0.18em]">Works</span>
        </button>
        {works.length > MAX_PREVIEW && (
          <button
            type="button"
            onClick={onExpand}
            className="text-[10px] text-stone-500 hover:text-stone-900 underline-offset-2 hover:underline"
          >
            See all {works.length}
          </button>
        )}
      </div>

      {/* Carousel body */}
      {loading ? (
        <p className="px-3 py-2 text-[11px] text-stone-400">Loading…</p>
      ) : error ? (
        <p className="px-3 py-2 text-[11px] text-red-600">
          Couldn&apos;t load works.
        </p>
      ) : previewWorks.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-stone-500">
          No works to add.
        </p>
      ) : (
        <div
          // Horizontal scroll: hide the scrollbar (cosmetic) and turn
          // on momentum scrolling on iOS for a native feel.
          className="flex gap-2 overflow-x-auto px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {previewWorks.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => onSelect(w)}
              title={w.title}
              aria-label={`Add ${w.title} to the wall`}
              className="shrink-0 h-16 w-16 rounded-md overflow-hidden border border-black/10 bg-white active:scale-95 transition-transform"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={w.imageUrl}
                alt={w.title}
                className="block h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mobile action bar ──────────────────────────────────────────────────

/**
 * Slim iOS-style action bar at the very bottom of the visualizer on
 * mobile. Two controls: a circular wall-settings button (gear icon),
 * and the primary Preview pill that takes the remaining width.
 *
 * Roughly 52 px tall (plus safe-area-inset on the parent), so the wall
 * stays dominant. Pairs with MobileWorksStrip above it.
 */
function MobileActionBar({
  wallActive,
  wallSettingsVisible,
  onToggleWall,
  previewVisible,
  previewInFlight,
  onPreview,
}: {
  wallActive: boolean;
  /** False when the wall is not the user's to change (a venue's wall). */
  wallSettingsVisible: boolean;
  onToggleWall: () => void;
  previewVisible: boolean;
  previewInFlight: boolean;
  onPreview: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-black/5">
      {wallSettingsVisible && (
      <button
        type="button"
        onClick={onToggleWall}
        aria-pressed={wallActive}
        aria-label="Wall settings"
        className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-colors ${
          wallActive
            ? "bg-stone-900 text-white"
            : "bg-stone-100 text-stone-700 hover:bg-stone-200"
        }`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      </button>
      )}

      {previewVisible ? (
        <button
          type="button"
          onClick={onPreview}
          disabled={previewInFlight}
          className="flex-1 h-10 rounded-full bg-stone-900 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 px-4"
        >
          {previewInFlight ? (
            <>
              <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
              Previewing…
            </>
          ) : (
            <>
              <PreviewIcon />
              Preview
            </>
          )}
        </button>
      ) : (
        // Nothing to preview yet (e.g. customer-mode with no items) — keep
        // the row balanced with a transparent spacer so the wall-
        // settings button doesn't drift to centre.
        <span className="flex-1" aria-hidden />
      )}
    </div>
  );
}

// ── Mobile sheet (slide-up panel) ───────────────────────────────────────

/**
 * Mobile-only slide-up sheet that overlays the canvas column. Tapping
 * the dimmed backdrop closes the sheet. By default the sheet caps at
 * 70 % of the column height so the user can still see the wall while
 * scrolling through works. Pass `autoHeight` for sheets whose content
 * is short and predictable (e.g. wall settings) so the sheet hugs
 * its content instead of reserving a fixed slab.
 */
function MobileSheet({
  title,
  onClose,
  children,
  autoHeight,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  autoHeight?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 z-30 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Dim backdrop, also acts as a tap-to-close target. Using a
          button (rather than a div + onClick) so screen readers
          describe it as activatable. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-black/40 backdrop-blur-[1px] cursor-default"
      />
      <div
        className={`bg-white rounded-t-2xl shadow-2xl flex flex-col ${
          // autoHeight: hug content, keep a generous safety cap so
          // pathological content (very tall picker, etc.) can't push
          // past the canvas. Default: reserve a slab for scrollable
          // long lists (e.g. WorksPanel grid).
          autoHeight ? "max-h-[80%]" : "max-h-[70%]"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Drag handle + header */}
        <div className="shrink-0 flex flex-col items-stretch border-b border-black/5">
          <div className="flex justify-center pt-2 pb-1">
            <div className="h-1 w-10 rounded-full bg-stone-300" />
          </div>
          <div className="flex items-center justify-between px-4 pb-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
              {title}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 p-1 text-stone-500 hover:text-stone-900 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div
          className={
            // autoHeight: hug content, just scroll if it overflows the
            // outer cap. Default: take all remaining height (long
            // scrollable lists like the works grid).
            autoHeight
              ? "overflow-y-auto"
              : "flex-1 min-h-0 overflow-y-auto"
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
