"use client";

/**
 * WallVisualizer — top-level editor.
 *
 * Owns:
 *   - layout state (background, dimensions, items, selection)
 *   - works data (fetched once, kept as both list + lookup map)
 *   - high-level interactions: add/move/resize/delete/duplicate/z-order
 *   - render flow (POST /render → preview modal, 429 → upgrade modal)
 *   - auto-save (debounced PATCH /layouts/[lid] when wallId+layoutId set)
 *
 * Composes:
 *   - WorksPanel       (presentational)
 *   - WallCanvas       (Konva, dynamic-imported with ssr:false)
 *   - QuotaChip        (self-fetching, refreshes after each render)
 *   - ItemToolbar      (visible when an item is selected)
 *   - WallConfigBar    (preset/colour/dimensions)
 *   - UpgradeModal     (shown on 429 or chip-out click)
 *   - RenderPreview    (shown after a successful render)
 *
 * Feature flag:
 *   Returns null when WALL_VISUALIZER_V1 is off, so embedding routes
 *   compile + render fine.
 *
 * Persistence model:
 *   - Pass `wall` + `initialLayout` to enable auto-save + render. Without
 *     them, the editor runs in "preview only" mode (no persistence — fine
 *     for the customer artwork-page sheet, etc.)
 *   - Auto-save PATCHes the layout 800ms after the last edit. The hook
 *     handles stale-while-saving so a fast typist can't outrun it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { isFlagOn } from "@/lib/feature-flags";
import {
  buildSizeVariants,
  parseDimensions,
  pickDefaultSize,
  type SizeVariant,
} from "@/lib/visualizer/dimensions";
import { defaultFrameConfig } from "@/lib/visualizer/frames";
import { PRESET_WALLS, getPresetWall } from "@/lib/visualizer/preset-walls";
import { useAutoSave } from "@/lib/visualizer/use-auto-save";
import type {
  LayoutBackground,
  QuotaConsumeResult,
  VisualizerEditorProps,
  VisualizerTier,
  Wall,
  WallItem,
  WallLayout,
} from "@/lib/visualizer/types";
import ItemToolbar from "./ItemToolbar";
import QuotaChip from "./QuotaChip";
import RenderPreview from "./RenderPreview";
import UpgradeModal, { type UpgradeReason } from "./UpgradeModal";
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
  /** Bearer token for authenticated API calls (quota, works fetch, render, save). */
  authToken?: string | null;
  /** Pre-supplied work to lock onto (artwork-page entry). */
  lockedWork?: PanelWork | null;
  /** Loaded wall — required for auto-save + render. */
  wall?: Wall | null;
  /** Loaded initial layout — required for auto-save + render. */
  initialLayout?: WallLayout | null;
  /**
   * Display URL for the wall photo (uploaded walls only). Resolved by
   * the parent page from the GET /api/walls/[id] response — the
   * Storage bucket is private so we can't use the path directly.
   */
  bgImageUrl?: string | null;
}

interface LastRender {
  /** wall_renders.id — needed when promoting this render to an artwork
   *  mockup. Optional because legacy server responses didn't include it. */
  renderId?: string;
  publicUrl: string;
  cached: boolean;
  costUnits: number;
  meta?: {
    width: number;
    height: number;
    itemCount: number;
    skippedItems: number;
    durationMs: number;
  };
}

export default function WallVisualizer(props: ExtendedProps) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) return null;
  return <WallVisualizerInner {...props} />;
}

// ── Inner ───────────────────────────────────────────────────────────────

function WallVisualizerInner(props: ExtendedProps) {
  const fallbackPreset = getPresetWall(DEFAULT_PRESET_ID) ?? PRESET_WALLS[0];

  // ── Layout state — hydrated from `wall` + `initialLayout` if present
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

  // ── Render flow state ─────────────────────────────────────────────
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [renderInFlight, setRenderInFlight] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [lastRender, setLastRender] = useState<LastRender | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | undefined>(undefined);
  const [upgradeTier, setUpgradeTier] = useState<VisualizerTier | null>(null);
  const [upgradeResetsAt, setUpgradeResetsAt] = useState<string | null>(null);

  // Mockup-save state — only relevant in artist modes. Tracked here
  // (rather than inside RenderPreview) so it survives previews opening
  // and closing, and so we can reset it on a fresh render.
  const [mockupSaving, setMockupSaving] = useState(false);
  const [mockupSavedWorkId, setMockupSavedWorkId] = useState<string | null>(
    null,
  );
  const [mockupError, setMockupError] = useState<string | null>(null);

  const canPersist = Boolean(props.wall && props.initialLayout);

  // ── Auto-save ─────────────────────────────────────────────────────
  // The value we save is the items array + dimensions. Background isn't
  // editable when persisting (the wall is fixed) — but if we ever expose
  // colour edits on a saved wall we'll wire it through here.
  const layoutSnapshot = useMemo(
    () => ({ items, width_cm: widthCm, height_cm: heightCm }),
    [items, widthCm, heightCm],
  );

  // Track the last successfully-saved wall dimensions so the
  // wall-PATCH gate stays accurate across multiple autosave cycles.
  // `props.wall` comes from the parent and only refreshes if the
  // parent re-fetches after save — without this ref we'd compare
  // against the stale prop and fire a wall PATCH on every save once
  // dimensions have changed even once. Initialised lazily from the
  // first wall snapshot so a freshly-mounted editor starts in sync.
  const lastSavedDimsRef = useRef<{ width_cm: number; height_cm: number } | null>(
    null,
  );
  if (lastSavedDimsRef.current === null && props.wall) {
    lastSavedDimsRef.current = {
      width_cm: props.wall.width_cm,
      height_cm: props.wall.height_cm,
    };
  }

  const saveLayout = useCallback(
    async (snap: { items: WallItem[]; width_cm: number; height_cm: number }) => {
      if (!props.wall || !props.initialLayout) return;
      const headers = {
        "content-type": "application/json",
        ...(props.authToken
          ? { Authorization: `Bearer ${props.authToken}` }
          : {}),
      };

      // Wall dimensions live on the WALL row (width_cm / height_cm),
      // not the layout — the layout owns items + per-item geometry,
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
        };
      const wallDimsChanged =
        snap.width_cm !== lastSaved.width_cm ||
        snap.height_cm !== lastSaved.height_cm;
      if (wallDimsChanged) {
        const wallRes = await fetch(`/api/walls/${props.wall.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            width_cm: snap.width_cm,
            height_cm: snap.height_cm,
          }),
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
      // Three parallel fetches — fail soft if any individual one breaks.
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

    if (props.mode === "artist_mockup" || props.mode === "artist_showroom") {
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
  // Without this, customers see an empty wall — they shouldn't have to
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
  const handlePickPreset = useCallback((presetId: string) => {
    const preset = getPresetWall(presetId);
    if (!preset) return;
    setBackground({
      kind: "preset",
      preset_id: preset.id,
      color_hex: preset.defaultColorHex,
    });
    setWidthCm(preset.defaultWidthCm);
    setHeightCm(preset.defaultHeightCm);
  }, []);

  const handleColorChange = useCallback((hex: string) => {
    const clean = hex.replace(/^#/, "").toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(clean)) return;
    setBackground((prev) =>
      prev.kind === "preset" ? { ...prev, color_hex: clean } : prev,
    );
  }, []);

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

  // ── Render flow ───────────────────────────────────────────────────
  // Two paths:
  //   1. Saved-wall path: POST to /api/walls/[id]/layouts/[lid]/render
  //      with the items array — auto-saves the layout in the same
  //      pipeline.
  //   2. Quick path (customer artwork-page sheet): POST to
  //      /api/walls/render-quick with preset_id + dims + work_id +
  //      placement override. No DB rows for wall or layout.
  const handleRender = useCallback(async () => {
    if (renderInFlight) return;
    if (items.length === 0) {
      setRenderError("Drag at least one artwork onto the wall.");
      return;
    }

    const useQuick = !props.wall || !props.initialLayout;

    setRenderInFlight(true);
    setRenderError(null);
    try {
      let url: string;
      let payload: Record<string, unknown>;

      if (useQuick) {
        // Customer / unsaved flow — single artwork to a preset wall.
        const firstItem = items[0];
        if (background.kind !== "preset") {
          // Quick endpoint requires preset background (uploaded photos
          // need a saved wall). Surface a helpful message.
          setRenderError("Save the wall first to render uploaded photos.");
          return;
        }
        url = "/api/walls/render-quick";
        payload = {
          preset_id: background.preset_id,
          width_cm: widthCm,
          height_cm: heightCm,
          wall_color_hex: background.color_hex,
          work_id: firstItem.work_id,
          placement: {
            x_cm: firstItem.x_cm,
            y_cm: firstItem.y_cm,
            width_cm: firstItem.width_cm,
            height_cm: firstItem.height_cm,
            frame: firstItem.frame,
          },
          kind: "standard",
        };
      } else {
        url = `/api/walls/${props.wall!.id}/layouts/${props.initialLayout!.id}/render`;
        payload = { kind: "standard", items };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(props.authToken
            ? { Authorization: `Bearer ${props.authToken}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      // Always bump the chip — we may have spent units even on failure
      // (only some failures refund), and a chip showing stale "10 left"
      // after a 429 would be confusing.
      setRefreshNonce((n) => n + 1);

      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as Partial<
          QuotaConsumeResult & { error?: string }
        >;
        const reason = (body as { reason?: UpgradeReason }).reason;
        const tier = (body as { tier?: VisualizerTier }).tier ?? null;
        const resets = (body as { resets_at?: string }).resets_at ?? null;
        setUpgradeReason(reason);
        setUpgradeTier(tier);
        setUpgradeResetsAt(resets);
        setUpgradeOpen(true);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({} as Record<string, unknown>));
        const msg =
          typeof body.error === "string"
            ? body.error
            : `Render failed (${res.status}).`;
        setRenderError(msg);
        return;
      }

      const json = (await res.json()) as {
        publicUrl: string;
        cached: boolean;
        cost_units: number;
        meta?: LastRender["meta"];
        render?: { id?: string };
      };
      setLastRender({
        renderId: json.render?.id,
        publicUrl: json.publicUrl,
        cached: Boolean(json.cached),
        costUnits: Number(json.cost_units ?? 0),
        meta: json.meta,
      });
      // Fresh render → fresh mockup save state. The artist might want
      // to attach this new render to a different work than last time.
      setMockupSavedWorkId(null);
      setMockupError(null);
      setPreviewOpen(true);
    } catch (err) {
      setRenderError(
        err instanceof Error ? err.message : "Render failed unexpectedly.",
      );
    } finally {
      setRenderInFlight(false);
    }
  }, [
    props.wall,
    props.initialLayout,
    props.authToken,
    items,
    renderInFlight,
    background,
    widthCm,
    heightCm,
  ]);

  // Auto-clear render errors after a few seconds.
  useEffect(() => {
    if (!renderError) return;
    const t = setTimeout(() => setRenderError(null), 5000);
    return () => clearTimeout(t);
  }, [renderError]);

  /**
   * Promote the most recent render to a mockup on the chosen artwork.
   * The render id is captured from the render-quick / layout-render
   * response and stored on `lastRender.renderId`. Each successful save
   * sets `mockupSavedWorkId` so the button label flips to "Saved ✓".
   */
  const saveAsMockup = useCallback(
    async (workId: string) => {
      if (!lastRender?.renderId) {
        setMockupError("Nothing to save — render the scene first.");
        return;
      }
      setMockupSaving(true);
      setMockupError(null);
      try {
        const res = await fetch(`/api/works/${workId}/mockups`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(props.authToken
              ? { Authorization: `Bearer ${props.authToken}` }
              : {}),
          },
          body: JSON.stringify({ render_id: lastRender.renderId }),
        });
        if (res.status === 401) {
          // Expired session — bounce out so AuthContext picks up the
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
    [lastRender?.renderId, props.authToken],
  );

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full bg-stone-50">
      <WorksPanel
        mode={props.mode}
        works={works}
        myWorks={myWorks}
        savedWorks={savedWorks}
        allWorks={allWorks}
        loading={worksLoading}
        error={worksError}
        onSelect={handleSelectFromPanel}
      />

      <div className="relative flex-1 min-w-0">
        {viewMode === "3d" ? (
          <Wall3DCanvas
            background={background}
            widthCm={widthCm}
            heightCm={heightCm}
            items={items}
            workById={workById}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            onItemChange={handleItemChange}
            onAddItem={(workId, xCm, yCm) => addItemAt(workId, xCm, yCm)}
            bgImageUrl={props.bgImageUrl ?? null}
          />
        ) : (
          <WallCanvas
            background={background}
            widthCm={widthCm}
            heightCm={heightCm}
            items={items}
            workById={workById}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            onItemChange={handleItemChange}
            onAddItem={(workId, xCm, yCm) => addItemAt(workId, xCm, yCm)}
            bgImageUrl={props.bgImageUrl ?? null}
          />
        )}

        {/* Top-right — quota chip + save status. The 2D/3D toggle
            used to live here too but the centred ItemToolbar (top
            centre) gets wide enough to overlap, so the toggle moved
            to its own bottom-left perch. */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {canPersist && (
            <SaveStatus
              status={saveStatus}
              error={saveError}
              onSaveNow={() => {
                void saveNow();
              }}
            />
          )}
          <QuotaChip
            ownerTypeHint={ownerTypeFromMode(props.mode)}
            authToken={props.authToken ?? null}
            refreshNonce={refreshNonce}
            onUpgradeClick={() => {
              setUpgradeReason("daily");
              setUpgradeTier(null);
              setUpgradeResetsAt(null);
              setUpgradeOpen(true);
            }}
          />
        </div>

        {/* Bottom-left — 2D / 3D toggle. Clear of the centred wall
            config bar (bottom-centre) and the centred item toolbar
            (top-centre). */}
        <div className="absolute bottom-3 left-3 z-10">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>

        {/* Per-item toolbar — top centre when an item is selected */}
        {selectedItem && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-auto">
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
        )}

        {/* Bottom-centre wall config bar */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <WallConfigBar
            currentPresetId={
              background.kind === "preset" ? background.preset_id : null
            }
            colorHex={
              background.kind === "preset" ? background.color_hex : "FFFFFF"
            }
            widthCm={widthCm}
            heightCm={heightCm}
            onPickPreset={handlePickPreset}
            onColorChange={handleColorChange}
            onWidthChange={(v) => setWidthCm(clampDimension(v))}
            onHeightChange={(v) => setHeightCm(clampDimension(v))}
            onClose={props.onClose}
          />
        </div>

        {/* Bottom-right floating render button.
            Visible whenever there's something to render — either a
            saved wall+layout (venue/artist editor) OR a customer-flow
            sheet with a locked work auto-placed. */}
        {(canPersist ||
          (props.mode === "customer_artwork_page" && items.length > 0)) && (
          <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
            {renderError && (
              <div className="px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs max-w-[260px] text-right">
                {renderError}
              </div>
            )}
            <button
              type="button"
              onClick={handleRender}
              disabled={renderInFlight}
              className="px-4 py-2 rounded-full bg-stone-900 text-white text-sm font-medium shadow-lg hover:bg-stone-800 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {renderInFlight ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  Rendering…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="6,4 20,12 6,20" />
                  </svg>
                  Render
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason={upgradeReason}
        currentTier={upgradeTier}
        resetsAt={upgradeResetsAt}
      />
      <RenderPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        publicUrl={lastRender?.publicUrl ?? null}
        cached={lastRender?.cached ?? false}
        costUnits={lastRender?.costUnits ?? 0}
        meta={lastRender?.meta}
        saveToArtwork={
          (props.mode === "artist_mockup" ||
            props.mode === "artist_showroom") &&
          lastRender?.renderId &&
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
      />
    </div>
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
        title="Flat 2D editor — fast, precise alignment"
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
        title="3D room — orbit-rotate to see how it'd look in person"
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

  // Show an explicit "Save" button when there's something to save —
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
  currentPresetId: string | null;
  colorHex: string;
  widthCm: number;
  heightCm: number;
  onPickPreset: (id: string) => void;
  onColorChange: (hex: string) => void;
  onWidthChange: (v: number) => void;
  onHeightChange: (v: number) => void;
  onClose?: () => void;
}

function WallConfigBar({
  currentPresetId,
  colorHex,
  widthCm,
  heightCm,
  onPickPreset,
  onColorChange,
  onWidthChange,
  onHeightChange,
  onClose,
}: ConfigProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/85 backdrop-blur border border-black/5 shadow-sm">
      <div className="flex items-center gap-1">
        {PRESET_WALLS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.name}
            onClick={() => onPickPreset(p.id)}
            className={`h-6 w-6 rounded-full border ${
              currentPresetId === p.id
                ? "ring-2 ring-stone-900 ring-offset-1"
                : "border-black/10"
            }`}
            style={{ backgroundColor: `#${p.defaultColorHex}` }}
          />
        ))}
      </div>

      <span className="h-4 w-px bg-black/10" />

      <label className="flex items-center gap-1 text-[11px] text-stone-600">
        <span>Colour</span>
        <input
          type="color"
          value={`#${colorHex}`}
          onChange={(e) => onColorChange(e.target.value)}
          className="h-5 w-7 rounded border border-black/10 bg-transparent"
        />
      </label>

      <span className="h-4 w-px bg-black/10" />

      <label className="flex items-center gap-1 text-[11px] text-stone-600">
        <span>W</span>
        <input
          type="number"
          min={50}
          max={1000}
          step={5}
          value={widthCm}
          onChange={(e) => onWidthChange(Number(e.target.value))}
          className="w-14 rounded border border-black/10 px-1 py-0.5 text-xs"
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
          className="w-14 rounded border border-black/10 px-1 py-0.5 text-xs"
        />
        <span className="text-stone-400">cm</span>
      </label>

      {onClose && (
        <>
          <span className="h-4 w-px bg-black/10" />
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-stone-500 hover:text-stone-900"
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

  // Additional aliases — the venue panel feed annotates each work with
  // its parent artist's name; pick that up.
  const artistName =
    typeof raw.artistName === "string"
      ? raw.artistName
      : typeof (raw as { _artistName?: unknown })._artistName === "string"
        ? ((raw as { _artistName: string })._artistName)
        : undefined;

  // Pull orientation if the API surfaced it. Some sources won't (the
  // placement-derived endpoint stores work_image only) — that's fine,
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

function ownerTypeFromMode(mode: VisualizerEditorProps["mode"]) {
  if (mode === "venue_my_walls") return "venue" as const;
  if (mode === "artist_mockup" || mode === "artist_showroom") return "artist" as const;
  return "customer" as const;
}
