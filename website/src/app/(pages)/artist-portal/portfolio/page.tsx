"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import Button from "@/components/Button";
import { type ArtistWork, type SizePricing } from "@/data/artists";
import { uploadImage } from "@/lib/upload";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";
import { authFetch } from "@/lib/api-client";
import { useToast } from "@/context/ToastContext";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import { estimateShipping, tierLabel } from "@/lib/shipping-calculator";
import Combobox from "@/components/Combobox";
import { WORK_MEDIUM_OPTIONS } from "@/data/work-medium-options";

interface SizeEntry {
  label: string;
  price: number;
}

/** One row in the bulk-price spreadsheet — flattened (work × size). */
interface BulkPriceRow {
  workId: string;
  workTitle: string;
  workImage: string;
  /** Index into the original pricing array; useful for re-sequencing. */
  sizeIndex: number;
  label: string;
  price: number;
  /** Set when the row is a placeholder for a work that had no sizes. */
  isNew: boolean;
}

/**
 * One draft in the bulk-add flow — a candidate ArtistWork the artist
 * has dragged in but not yet saved. Mirrors the shape of WorkFormState
 * but trimmed to just the fields the bulk UI surfaces; the rest get
 * sensible defaults at save time.
 *
 * Per-size arrays (shipping, inStore) are kept parallel to `sizes`
 * by index — same convention as the single-work edit form. Empty
 * string means "no override at this size".
 */
interface BulkAddDraft {
  /** Local-only key. Discarded on save. */
  draftId: string;
  /** Uploaded image URL — empty until upload settles. */
  imageUrl: string;
  /** Object URL for instant preview while the upload is in flight. */
  imagePreview: string;
  uploading: boolean;
  title: string;
  dimensions: string;
  orientation: "landscape" | "portrait" | "square";
  sizes: SizeEntry[];
  /** Per-size shipping price overrides. Parallel to `sizes`. */
  shippingPrices: string[];
  /** Per-size in-store pickup prices. Parallel to `sizes`. */
  inStorePrices: string[];
  /** Frame options offered for this work — applies across all sizes
   *  (per-size frames not in the data model yet). Each frame option
   *  is a free-text label + a £ price uplift. */
  frameOptions: { label: string; priceUplift: string }[];
  available: boolean;
  /** UI: which expandable sections are open on the draft card. */
  showShipping: boolean;
  showInStore: boolean;
  showFrames: boolean;
}

interface WorkFormState {
  title: string;
  medium: string;
  dimensions: string;
  imagePreview: string;
  additionalImages: string[];
  description: string;
  available: boolean;
  orientation: "portrait" | "landscape" | "square";
  sizes: SizeEntry[];
  shippingPrice: string;
  shippingPerSize: boolean;
  sizeShipping: string[];
  inStorePrice: string;
  inStorePricing: string[];
  /** When true, the In-store column is shown in the sizes table. */
  inStoreEnabled: boolean;
  /** When true, the sizes table exposes a per-size Qty column so
      the artist can split their total availability across sizes
      (e.g. 3 of A4, 1 of A3). When false we fall back to the
      single work-level quantityAvailable field. */
  stockPerSize: boolean;
  /** Stock count per size, aligned by index with `sizes`. Empty
      string = unlimited for that size. */
  sizeStock: string[];
  detectedRatio: number | null;
  quantityAvailable: string;
  frameOptions: { label: string; priceUplift: string; imageUrl?: string }[];
}

// Standard print sizes in inches [width, height] — always width <= height
const STANDARD_SIZES: [number, number, string][] = [
  [6, 4, 'A6'],
  [7, 5, '7×5"'],
  [8, 6, '8×6"'],
  [10, 8, 'A4'],
  [12, 8, '12×8"'],
  [14, 11, 'A3'],
  [16, 12, '16×12"'],
  [20, 16, 'A2'],
  [24, 16, '24×16"'],
  [24, 18, '24×18"'],
  [30, 20, 'A1'],
  [36, 24, '36×24"'],
  [40, 30, 'A0'],
];

/**
 * Given an aspect ratio (w/h), return standard sizes that closely match.
 *
 * Label format: `{w}×{h}" ({wCm}×{hCm} cm)` — inch measurement up
 * front (matches the "STANDARD_SIZES" naming most artists shop in)
 * with the cm equivalent in brackets so venues sourcing in metric
 * see the actual dimensions at a glance. The third element of
 * STANDARD_SIZES (paper-size code) is kept for future use but no
 * longer surfaces in the label — repeating it as `(8×6")` was
 * redundant and `(A4)` alone hid the cm value users actually need.
 */
function getSuggestedSizes(ratio: number): SizeEntry[] {
  const isLandscape = ratio >= 1;
  const normalRatio = isLandscape ? ratio : 1 / ratio;

  return STANDARD_SIZES
    .map(([w, h]) => {
      const sizeRatio = Math.max(w, h) / Math.min(w, h);
      const diff = Math.abs(sizeRatio - normalRatio);
      const wDisplay = isLandscape ? Math.max(w, h) : Math.min(w, h);
      const hDisplay = isLandscape ? Math.min(w, h) : Math.max(w, h);
      const wCm = Math.round(wDisplay * 2.54);
      const hCm = Math.round(hDisplay * 2.54);
      return {
        label: `${wDisplay}×${hDisplay}" (${wCm}×${hCm} cm)`,
        price: 0,
        diff,
      };
    })
    .filter((s) => s.diff < 0.3) // Within 30% aspect ratio tolerance
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 5)
    .map(({ label, price }) => ({ label, price }));
}

const defaultSizes: SizeEntry[] = [
  { label: '10×8" (25×20 cm)', price: 0 },
];

const emptyWork: WorkFormState = {
  title: "",
  medium: "",
  dimensions: "",
  imagePreview: "",
  additionalImages: [],
  description: "",
  available: true,
  orientation: "landscape",
  sizes: [...defaultSizes],
  shippingPrice: "",
  shippingPerSize: false,
  sizeShipping: [],
  inStorePrice: "",
  inStorePricing: [],
  inStoreEnabled: false,
  stockPerSize: false,
  sizeStock: [],
  detectedRatio: null,
  quantityAvailable: "",
  frameOptions: [],
};

const statusColors: Record<string, string> = {
  Available: "bg-accent/10 text-accent",
  Sold: "bg-border/50 text-muted",
};

const PORTFOLIO_LIMITS: Record<string, number> = { core: 8, premium: 20, pro: 9999 };

// Total images allowed per artwork (primary + extras) by subscription tier.
const IMAGE_LIMITS: Record<string, number> = { core: 3, premium: 5, pro: 10 };

export default function PortfolioPage() {
  const { artist, loading: artistLoading } = useCurrentArtist();
  const { showToast } = useToast();
  const [works, setWorks] = useState<ArtistWork[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form, setForm] = useState<WorkFormState>(emptyWork);
  const [hoveredWork, setHoveredWork] = useState<number | null>(null);
  // Drag-reorder state. We track the source index (work being dragged)
  // and the current target hovered. Visual cues: the source card fades,
  // the target card gets a left-edge accent line so the artist sees
  // exactly where their drop will land. Reorder fires on drop; the
  // existing saveWorks() syncs each row's new sort_order to the DB.
  const [reorderDrag, setReorderDrag] = useState<{
    fromIndex: number;
    overIndex: number | null;
  } | null>(null);

  // ── Bulk edit state ────────────────────────────────────────────────
  // Shopify-style multi-select. `selectMode` is the explicit mode
  // toggle (turning it on shows checkboxes on every card and hides
  // the per-card hover overlay). `selectedIds` tracks which works
  // are currently checked. The Copy-from trio
  // (`bulkEditApplyKind` / `bulkEditPendingSource` / `bulkEditTargetIds`)
  // drives the source-then-targets-then-apply picker below.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Bulk-edit Copy-from flow. Mirrors the bulk-add modal's two-step
  // pattern: (1) pick a kind ("sizes" or "prices") + a source work,
  // then (2) tick exactly which works in the selection to apply to
  // and click Apply. Replaces the older one-shot dropdown that
  // immediately overwrote every selected work — that gave artists
  // no chance to exclude works that were intentionally different.
  const [bulkEditApplyKind, setBulkEditApplyKind] = useState<
    "sizes" | "prices" | null
  >(null);
  const [bulkEditPendingSource, setBulkEditPendingSource] =
    useState<ArtistWork | null>(null);
  const [bulkEditTargetIds, setBulkEditTargetIds] = useState<Set<string>>(
    new Set(),
  );
  // Single-form "Copy from another work…" picker. Lives next to
  // the size table header in the Add/Edit work form. Picking a
  // source seeds the form's sizes / prices in-place, so artists
  // setting up a new work in a series don't have to re-key every
  // size and price by hand.
  const [formCopyKind, setFormCopyKind] = useState<"sizes" | "prices" | null>(
    null,
  );
  // Spreadsheet-style price editor. Opens a modal with one row per
  // (work × size) so you can scan and tweak many prices at once
  // without clicking into each work individually.
  const [bulkPricesOpen, setBulkPricesOpen] = useState(false);
  const [bulkPriceRows, setBulkPriceRows] = useState<BulkPriceRow[]>([]);
  // Bulk-add modal state. Drag images in, edit titles + sizes for
  // each in parallel, then save them all in one go.
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkAddDrafts, setBulkAddDrafts] = useState<BulkAddDraft[]>([]);
  const [bulkAddDragOver, setBulkAddDragOver] = useState(false);
  // Two pickers — one for "Copy sizes from", one for "Copy prices
  // from". They're separated because an artist often wants to clone
  // size labels (the size table stays the same across a series) but
  // set different prices per piece, or vice versa.
  const [bulkAddApplyKind, setBulkAddApplyKind] = useState<
    "sizes" | "prices" | null
  >(null);
  // After picking a source, we ask the artist which drafts to apply
  // it to. This holds the source until the target is confirmed.
  // `shipping` is an index-aligned array of per-size shipping
  // numbers (or null where the source had none), so when the artist
  // applies "prices" the per-size shipping comes along too. The
  // source can be a draft (BulkAddDraft.shippingPrices: string[]) or
  // an existing work (pricing[i].shippingPrice) — both are
  // normalised to the same shape here.
  const [bulkAddPendingSource, setBulkAddPendingSource] = useState<{
    label: string;
    sizes: SizeEntry[];
    shipping?: Array<number | null>;
  } | null>(null);
  const [bulkAddTargetIds, setBulkAddTargetIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkAddSaving, setBulkAddSaving] = useState(false);
  const bulkAddInputRef = useRef<HTMLInputElement>(null);
  // Spreadsheet-style row selection for the bulk-price modal. Tracks
  // row indexes (not workIds) because two rows on the same work are
  // distinct selections.
  const [bulkPriceSelected, setBulkPriceSelected] = useState<Set<number>>(
    new Set(),
  );
  // Last-clicked row drives Shift-click range selection.
  const bulkPriceAnchorRef = useRef<number | null>(null);
  // Quick "set selected to £X" input.
  const [bulkPriceFillValue, setBulkPriceFillValue] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadingExtra, setUploadingExtra] = useState(false);
  // Highlights the dropzone when a file is hovered. Mirrored separately
  // for the primary image vs additional-images zones so dragging onto
  // one doesn't light up the other.
  const [dragMain, setDragMain] = useState(false);
  const [dragExtras, setDragExtras] = useState(false);
  const [initialised, setInitialised] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);
  const [formError, setFormError] = useState("");
  const [defaultShipping, setDefaultShipping] = useState<string>("");
  const [shipsInternationally, setShipsInternationally] = useState(false);
  const [internationalShipping, setInternationalShipping] = useState<string>("");
  const [savingDefault, setSavingDefault] = useState(false);

  // Track whether the work form has unsaved changes. We snapshot the form
  // each time it opens, then compare on every change. The beforeunload
  // guard only fires when the form is open AND currently dirty.
  const initialFormJson = useRef<string>("");
  const formDirty = showForm && JSON.stringify(form) !== initialFormJson.current;
  useUnsavedWarning(formDirty);

  useEffect(() => {
    if (!artist || initialised) return;
    setWorks([...artist.works]);
    setInitialised(true);
    // Fetch default shipping price
    authFetch("/api/artist-profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile?.default_shipping_price != null) {
          setDefaultShipping(String(data.profile.default_shipping_price));
        }
        if (data.profile?.ships_internationally) {
          setShipsInternationally(true);
        }
        if (data.profile?.international_shipping_price != null) {
          setInternationalShipping(String(data.profile.international_shipping_price));
        }
      })
      .catch(() => {});
  }, [artist, initialised]);

  // ──────────────────────────────────────────────────────────────────
  // ALL HOOKS MUST LIVE ABOVE THE `if (!artist) return ...` EARLY-RETURN
  // BELOW. React enforces a stable hook count between renders — adding
  // a hook after a conditional return triggers
  //   "Rendered more hooks than during the previous render"
  // which the Next.js error boundary surfaces as
  //   "Something went wrong"
  // Don't move these effects below the early-return.
  // ──────────────────────────────────────────────────────────────────

  // Whenever the bulk-prices modal opens or the row list changes shape,
  // clear the spreadsheet-style row selection so it doesn't reference
  // stale indexes (a removed row would leave a phantom highlight).
  useEffect(() => {
    if (!bulkPricesOpen) {
      setBulkPriceSelected(new Set());
      bulkPriceAnchorRef.current = null;
      setBulkPriceFillValue("");
    }
  }, [bulkPricesOpen]);

  // Cmd/Ctrl + C / V keyboard shortcuts when the bulk-prices modal is
  // open. Only fires when the focused element isn't a real input —
  // otherwise the user copying inside an input field would get hijacked.
  useEffect(() => {
    if (!bulkPricesOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      const isField =
        tag === "input" || tag === "textarea" || tag === "select";
      if (isField) return;
      if (e.key === "c" || e.key === "C") {
        if (bulkPriceSelected.size === 0) return;
        e.preventDefault();
        bulkPriceCopySelected();
      } else if (e.key === "v" || e.key === "V") {
        if (bulkPriceSelected.size === 0) return;
        e.preventDefault();
        bulkPricePasteIntoSelected();
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        const all = new Set<number>();
        for (let i = 0; i < bulkPriceRows.length; i++) all.add(i);
        setBulkPriceSelected(all);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkPricesOpen, bulkPriceSelected, bulkPriceRows.length]);

  if (artistLoading || !artist) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/portfolio">
        <p className="text-muted text-sm py-12 text-center">{artistLoading ? "Loading..." : "No artist profile found."}</p>
      </ArtistPortalLayout>
    );
  }

  function saveWorks(updated: ArtistWork[]) {
    setWorks(updated);

    // Sync each work to Supabase. After the response lands, reconcile the
    // work's description/images against what the DB actually returned so
    // the UI reflects persisted state (not just the in-memory form).
    const shownWarnings = new Set<string>();
    updated.forEach((work, index) => {
      // priceUplift must be numeric for the API's Zod-like validator to
      // accept the frame; previously we stringified, which caused frames
      // to be silently sanitized away.
      const frames = ((work as ArtistWork & { frameOptions?: { label: string; priceUplift: number; imageUrl?: string }[] }).frameOptions ?? [])
        .map((f) => ({
          label: f.label,
          priceUplift: typeof f.priceUplift === "number" ? f.priceUplift : Number(f.priceUplift) || 0,
          imageUrl: f.imageUrl,
        }));

      authFetch("/api/artist-works", {
        method: "POST",
        body: JSON.stringify({
          id: work.id,
          title: work.title,
          medium: work.medium,
          dimensions: work.dimensions,
          priceBand: work.priceBand,
          pricing: work.pricing,
          available: work.available,
          color: work.color || "#C17C5A",
          image: work.image,
          orientation: work.orientation || "landscape",
          sortOrder: index,
          shippingPrice: (work as ArtistWork & { shippingPrice?: number; inStorePrice?: number }).shippingPrice ?? null,
          inStorePrice: (work as ArtistWork & { shippingPrice?: number; inStorePrice?: number }).inStorePrice ?? null,
          quantityAvailable: (work as ArtistWork & { quantityAvailable?: number | null }).quantityAvailable ?? null,
          frameOptions: frames,
          description: work.description || "",
          images: work.images || [],
        }),
      })
        .then((r) => r.json())
        .then((res: { warnings?: string[]; savedRow?: { id?: string; description?: string; images?: string[] } }) => {
          // Reconcile DB state back into local works so subsequent edits
          // see what actually persisted.
          if (res.savedRow && res.savedRow.id) {
            setWorks((prev) => prev.map((w) => {
              if (w.id !== res.savedRow!.id) return w;
              return {
                ...w,
                description: res.savedRow?.description ?? w.description,
                images: Array.isArray(res.savedRow?.images) ? res.savedRow!.images : w.images,
              };
            }));
          }
          if (Array.isArray(res.warnings)) {
            res.warnings.forEach((w) => {
              if (!shownWarnings.has(w)) {
                shownWarnings.add(w);
                showToast(w);
              }
            });
          }
        })
        .catch((err) => console.error("Work sync error:", err));
    });
  }

  function handleDeleteWork(index: number) {
    const work = works[index];
    // Delete from Supabase
    authFetch(`/api/artist-works?id=${work.id}`, { method: "DELETE" })
      .catch((err) => console.error("Work delete error:", err));
    saveWorks(works.filter((_, i) => i !== index));
  }

  /**
   * Reorder works by dropping one card onto another. The dropped-on
   * card becomes the new neighbour: dropping later in the grid moves
   * the source to that position; dropping earlier moves it before.
   * saveWorks pushes each work's new sort_order=index to the API.
   */
  function reorderWorks(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= works.length) return;
    const next = works.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    saveWorks(next);
  }

  // ── Bulk edit actions ──────────────────────────────────────────────

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    // Replaced bulkApplyOpen with the bulkEdit* trio. Wipe each so
    // re-entering select mode doesn't leak a half-open Copy-from
    // picker from the previous session.
    setBulkEditApplyKind(null);
    setBulkEditPendingSource(null);
    setBulkEditTargetIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(works.map((w) => w.id)));
  }

  /** Apply availability=true|false to every selected work. */
  function bulkSetAvailability(available: boolean) {
    if (selectedIds.size === 0) return;
    const next = works.map((w) =>
      selectedIds.has(w.id) ? { ...w, available } : w,
    );
    saveWorks(next);
    showToast(
      `Marked ${selectedIds.size} work${selectedIds.size === 1 ? "" : "s"} as ${available ? "available" : "sold"}`,
    );
  }

  /** Delete every selected work (with confirm). */
  function bulkDelete() {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} work${count === 1 ? "" : "s"}? This can't be undone.`)) return;

    // Best-effort: fire the API delete for each. saveWorks(filtered)
    // also POSTs the remaining works which is harmless.
    Array.from(selectedIds).forEach((id) => {
      authFetch(`/api/artist-works?id=${id}`, { method: "DELETE" }).catch(
        (err) => console.error("Bulk delete error:", err),
      );
    });
    saveWorks(works.filter((w) => !selectedIds.has(w.id)));
    showToast(`Deleted ${count} work${count === 1 ? "" : "s"}`);
    exitSelectMode();
  }

  /**
   * Open the spreadsheet-style price editor. Flattens every (work × size)
   * combo from the selected works into a single rows array so the artist
   * can tab between cells and tweak prices in bulk. Saves on submit by
   * folding the edited rows back onto each work's `pricing` array.
   */
  /**
   * Open the bulk-price editor on every work, regardless of whether the
   * user has entered select-mode. Most artists hit "Bulk edit prices"
   * because they want to scan _everything_ — making them tick boxes
   * first is friction.
   */

  /**
   * Toggle/range-extend row selection. Plain click sets the anchor +
   * single-selects the row. Shift-click extends from the anchor.
   * Cmd/Ctrl-click toggles the row in the existing set.
   */
  function bulkPriceClickRow(idx: number, e: React.MouseEvent) {
    if (e.shiftKey && bulkPriceAnchorRef.current !== null) {
      const a = bulkPriceAnchorRef.current;
      const lo = Math.min(a, idx);
      const hi = Math.max(a, idx);
      const next = new Set<number>();
      for (let i = lo; i <= hi; i++) next.add(i);
      setBulkPriceSelected(next);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setBulkPriceSelected((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
      bulkPriceAnchorRef.current = idx;
      return;
    }
    setBulkPriceSelected(new Set([idx]));
    bulkPriceAnchorRef.current = idx;
  }

  /**
   * Apply the fill value to every selected row. Empty input is treated
   * as "no change" so the artist can highlight rows + paste prices via
   * Cmd+V instead.
   */
  function bulkPriceApplyFill() {
    const v = bulkPriceFillValue.trim();
    if (!v) return;
    const num = Number(v);
    if (!Number.isFinite(num) || num < 0) return;
    setBulkPriceRows((rows) =>
      rows.map((r, i) =>
        bulkPriceSelected.has(i) ? { ...r, price: num } : r,
      ),
    );
  }

  /**
   * Copy the selected rows' prices as newline-separated values so
   * artists can paste them into Excel / Numbers / Sheets. We use the
   * row order as displayed.
   */
  async function bulkPriceCopySelected() {
    const indexes = Array.from(bulkPriceSelected).sort((a, b) => a - b);
    if (indexes.length === 0) return;
    const text = indexes
      .map((i) => bulkPriceRows[i]?.price ?? 0)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard permissions can fail in tests / older browsers.
      // Falling back is fine — the user can use the fill input.
    }
  }

  /**
   * Read newline-separated numbers from the clipboard and write them
   * into the selected rows in order. Currency symbols, commas, and
   * whitespace are stripped. Excess values are ignored; missing values
   * leave the corresponding row unchanged.
   */
  async function bulkPricePasteIntoSelected() {
    const indexes = Array.from(bulkPriceSelected).sort((a, b) => a - b);
    if (indexes.length === 0) return;
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }
    const values = text
      .split(/\r?\n|\t/)
      .map((s) => s.trim().replace(/[£$€,]/g, ""))
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (values.length === 0) return;
    setBulkPriceRows((rows) => {
      const next = [...rows];
      indexes.forEach((rowIdx, i) => {
        if (i < values.length) {
          next[rowIdx] = { ...next[rowIdx], price: values[i] };
        }
      });
      return next;
    });
  }

  // ── Bulk add ────────────────────────────────────────────────────

  function openBulkAdd() {
    setBulkAddDrafts([]);
    setBulkAddOpen(true);
    setBulkAddApplyKind(null);
    setBulkAddPendingSource(null);
    setBulkAddTargetIds(new Set());
  }

  /**
   * Upload N files in parallel and push them into the drafts list.
   * Each draft starts with a sensible auto-detected orientation +
   * suggested sizes (no prices) so the artist can scan-and-tweak
   * rather than start from scratch on every card.
   */
  async function bulkAddFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;

    // Seed drafts immediately with previews so the UI feels instant
    // while uploads run in parallel.
    const seeded = images.map<BulkAddDraft>((f) => ({
      draftId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      imageUrl: "",
      imagePreview: URL.createObjectURL(f),
      uploading: true,
      title: f.name.replace(/\.[^.]+$/, "").slice(0, 200),
      dimensions: "",
      orientation: "landscape",
      sizes: [{ label: '10×8" (25×20 cm)', price: 0 }],
      shippingPrices: [""],
      inStorePrices: [""],
      frameOptions: [],
      available: true,
      showShipping: false,
      showInStore: false,
      showFrames: false,
    }));
    setBulkAddDrafts((prev) => [...prev, ...seeded]);

    // Upload + replace each seed in turn. Settle independently so a
    // single slow upload doesn't gate the others.
    await Promise.all(
      images.map(async (file, i) => {
        const draftId = seeded[i].draftId;
        try {
          // Detect orientation + suggested sizes from the natural
          // dimensions BEFORE the upload comes back, since the upload
          // strips the file blob. Same logic as the single-add flow.
          const img = new window.Image();
          const objectUrl = URL.createObjectURL(file);
          img.src = objectUrl;
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
          const ratio = img.naturalWidth / img.naturalHeight;
          URL.revokeObjectURL(objectUrl);
          const orientation: "landscape" | "portrait" | "square" =
            ratio > 1.05 ? "landscape" : ratio < 0.95 ? "portrait" : "square";
          const suggested = getSuggestedSizes(ratio);
          const sizesToUse =
            suggested.length > 0
              ? suggested.map((s) => ({ label: s.label, price: 0 }))
              : [{ label: '10×8" (25×20 cm)', price: 0 }];

          const url = await uploadImage(file, "artworks");

          setBulkAddDrafts((prev) =>
            prev.map((d) =>
              d.draftId === draftId
                ? {
                    ...d,
                    imageUrl: url,
                    uploading: false,
                    orientation,
                    sizes: sizesToUse,
                    // Re-pad parallel arrays to the new size count.
                    shippingPrices: sizesToUse.map(() => ""),
                    inStorePrices: sizesToUse.map(() => ""),
                    dimensions: `${img.naturalWidth} × ${img.naturalHeight} px`,
                  }
                : d,
            ),
          );
        } catch (err) {
          console.error("Bulk-add upload failed:", err);
          setBulkAddDrafts((prev) =>
            prev.map((d) =>
              d.draftId === draftId ? { ...d, uploading: false } : d,
            ),
          );
        }
      }),
    );
  }

  function bulkAddRemoveDraft(draftId: string) {
    setBulkAddDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
  }

  function bulkAddUpdateDraft(
    draftId: string,
    patch: Partial<BulkAddDraft>,
  ) {
    setBulkAddDrafts((prev) =>
      prev.map((d) => (d.draftId === draftId ? { ...d, ...patch } : d)),
    );
  }

  /**
   * Two-step copy flow. Step 1: artist picks a source (existing work
   * or another draft) from the toolbar dropdown — that fires
   * `bulkAddPickSource`. Step 2: a target picker opens with checkboxes
   * for which drafts to apply to (defaults to all). On confirm,
   * `bulkAddApplyToTargets` does the merge.
   */
  function bulkAddPickSource(
    label: string,
    sizes: SizeEntry[],
    shipping?: Array<number | null>,
  ) {
    if (sizes.length === 0) return;
    setBulkAddPendingSource({ label, sizes, shipping });
    // Default-target every draft except the source itself when the
    // source is a draft — applying to yourself is a no-op.
    const allIds = bulkAddDrafts
      .filter((d) => d.title !== label)
      .map((d) => d.draftId);
    setBulkAddTargetIds(new Set(allIds));
  }

  function bulkAddApplyToTargets() {
    if (!bulkAddPendingSource || bulkAddApplyKind === null) return;
    const { sizes: sourceSizes, shipping: sourceShipping } =
      bulkAddPendingSource;
    const kind = bulkAddApplyKind;
    setBulkAddDrafts((prev) =>
      prev.map((d) => {
        if (!bulkAddTargetIds.has(d.draftId)) return d;
        if (kind === "sizes") {
          // Copy LABELS only. Existing prices for matching labels
          // (case-insensitive) are kept so an artist who priced
          // first then aligned the table to a reference work doesn't
          // lose their numbers. Shipping arrays reset to empty —
          // sizes flow doesn't carry shipping. The artist runs Copy
          // Prices next if they want the source's numbers.
          const nextSizes = sourceSizes.map((s) => {
            const existing = d.sizes.find(
              (x) => x.label.toLowerCase() === s.label.toLowerCase(),
            );
            return {
              label: s.label,
              price: existing?.price ?? 0,
            };
          });
          return {
            ...d,
            sizes: nextSizes,
            shippingPrices: nextSizes.map(() => ""),
            inStorePrices: nextSizes.map(() => ""),
          };
        }
        // kind === "prices" — row-by-row (index aligned). Source
        // row i's price → target row i's price; same for shipping.
        // Target rows beyond the source's length keep their existing
        // values so we never blank out work the artist did.
        const nextSizes = d.sizes.map((s, i) => ({
          label: s.label,
          price: sourceSizes[i]?.price ?? s.price,
        }));
        const nextShipping = d.shippingPrices.length === d.sizes.length
          ? [...d.shippingPrices]
          : d.sizes.map((_, i) => d.shippingPrices[i] ?? "");
        if (Array.isArray(sourceShipping)) {
          for (let i = 0; i < nextShipping.length; i++) {
            const v = sourceShipping[i];
            if (typeof v === "number") nextShipping[i] = String(v);
          }
        }
        return {
          ...d,
          sizes: nextSizes,
          shippingPrices: nextShipping,
          // Show the shipping panel if we just populated any row so
          // the artist actually sees what was copied.
          showShipping:
            d.showShipping || nextShipping.some((v) => v !== ""),
        };
      }),
    );
    showToast(
      `Applied ${kind} to ${bulkAddTargetIds.size} draft${
        bulkAddTargetIds.size === 1 ? "" : "s"
      }`,
    );
    // Reset the picker.
    setBulkAddApplyKind(null);
    setBulkAddPendingSource(null);
    setBulkAddTargetIds(new Set());
  }

  function bulkAddCancelApply() {
    setBulkAddApplyKind(null);
    setBulkAddPendingSource(null);
    setBulkAddTargetIds(new Set());
  }

  /**
   * Save every draft as a new ArtistWork. Drafts missing an image are
   * silently dropped (the artist hasn't finished setting them up);
   * drafts with no priced size are flagged so they can fix before
   * saving. saveWorks() handles the network sync.
   */
  function bulkAddSaveAll() {
    const valid = bulkAddDrafts.filter(
      (d) =>
        !d.uploading &&
        d.imageUrl &&
        d.title.trim().length > 0 &&
        d.sizes.some((s) => s.label && s.price > 0),
    );
    if (valid.length === 0) {
      setFormError(
        "Each draft needs an image, a title, and at least one priced size.",
      );
      return;
    }

    setBulkAddSaving(true);
    const newWorks: ArtistWork[] = valid.map((d, i) => {
      // Build pricing rows from valid sizes; remember the index in
      // the original sizes array so we can pull matching shipping +
      // in-store entries by index even after invalid rows are
      // filtered out.
      const validWithIndex = d.sizes
        .map((s, idx) => ({ size: s, idx }))
        .filter(({ size }) => size.label && size.price > 0);
      const lowest = Math.min(...validWithIndex.map((v) => v.size.price));
      // Per-size shipping now persists per-row via the SizePricing.
      // shippingPrice field added to the data model. We still collapse
      // to a single work-level `shippingPrice` (using the lowest of
      // the entered values) as a fallback for legacy code paths that
      // read the work-level field — the cart prefers per-size when
      // present. Empty rows are skipped.
      const perSizeShipping = d.shippingPrices.map((s) => {
        if (!s || !s.trim()) return undefined;
        const n = parseFloat(s);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      });
      const shippingNums = perSizeShipping.filter(
        (n): n is number => typeof n === "number",
      );
      const shippingPrice =
        shippingNums.length > 0 ? Math.min(...shippingNums) : undefined;
      // In-store pricing: only emit when the artist set at least one
      // non-empty value, otherwise it's a noisy empty array.
      const inStorePricing = validWithIndex
        .map(({ size, idx }) => {
          const raw = d.inStorePrices[idx];
          const num = raw && raw.trim() ? parseFloat(raw) : NaN;
          return { label: size.label, price: Number.isFinite(num) ? num : 0 };
        })
        .filter((p) => p.price > 0);
      // Frame options — work-level today; per-size frames isn't in
      // the data model yet. Numeric coerce + drop blanks to match the
      // single-add validation.
      const frameOptions = d.frameOptions
        .map((f) => ({
          label: f.label.trim(),
          priceUplift: Number(f.priceUplift) || 0,
        }))
        .filter((f) => f.label.length > 0);
      return {
        id: `${artist!.slug}-${Date.now()}-${i}`,
        title: d.title.trim(),
        medium: "",
        dimensions: d.dimensions,
        priceBand: `From £${lowest}`,
        pricing: validWithIndex.map(({ size, idx }) => {
          const ship = perSizeShipping[idx];
          const row: SizePricing = {
            label: size.label,
            price: size.price,
          };
          if (typeof ship === "number") row.shippingPrice = ship;
          return row;
        }),
        available: d.available,
        color: "#C17C5A",
        image: d.imageUrl,
        orientation: d.orientation,
        ...(shippingPrice !== undefined ? { shippingPrice } : {}),
        ...(inStorePricing.length > 0 ? { inStorePricing } : {}),
        ...(frameOptions.length > 0 ? { frameOptions } : {}),
      };
    });

    // Append to the existing works array; saveWorks handles the API
    // sync and the UI update.
    saveWorks([...works, ...newWorks]);
    showToast(
      `Added ${newWorks.length} work${newWorks.length === 1 ? "" : "s"}`,
    );
    setBulkAddSaving(false);
    setBulkAddOpen(false);
    setBulkAddDrafts([]);
  }

  function openBulkPricesAll() {
    if (works.length === 0) return;
    setSelectedIds(new Set(works.map((w) => w.id)));
    // Build rows from `works` directly so we don't race the next
    // render of selectedIds before openBulkPrices reads it.
    const rows: BulkPriceRow[] = [];
    works.forEach((w) => {
      if (!w.pricing || w.pricing.length === 0) {
        rows.push({
          workId: w.id,
          workTitle: w.title,
          workImage: w.image,
          sizeIndex: 0,
          label: "",
          price: 0,
          isNew: true,
        });
        return;
      }
      w.pricing.forEach((p, i) => {
        rows.push({
          workId: w.id,
          workTitle: w.title,
          workImage: w.image,
          sizeIndex: i,
          label: p.label,
          price: p.price,
          isNew: false,
        });
      });
    });
    setBulkPriceRows(rows);
    setBulkPricesOpen(true);
  }

  function openBulkPrices() {
    if (selectedIds.size === 0) return;
    const rows: BulkPriceRow[] = [];
    works
      .filter((w) => selectedIds.has(w.id))
      .forEach((w) => {
        // Works with no sizes still show a placeholder row so the artist
        // can add their first size from this view.
        if (!w.pricing || w.pricing.length === 0) {
          rows.push({
            workId: w.id,
            workTitle: w.title,
            workImage: w.image,
            sizeIndex: 0,
            label: "",
            price: 0,
            isNew: true,
          });
          return;
        }
        w.pricing.forEach((p, i) => {
          rows.push({
            workId: w.id,
            workTitle: w.title,
            workImage: w.image,
            sizeIndex: i,
            label: p.label,
            price: p.price,
            isNew: false,
          });
        });
      });
    setBulkPriceRows(rows);
    setBulkPricesOpen(true);
  }

  function saveBulkPrices() {
    // Fold rows back onto works, grouped by workId. Empty-label or
    // £0-price rows are dropped so users can clear a row to delete it.
    const byWork = new Map<string, BulkPriceRow[]>();
    bulkPriceRows.forEach((r) => {
      const arr = byWork.get(r.workId) ?? [];
      arr.push(r);
      byWork.set(r.workId, arr);
    });

    const next = works.map((w) => {
      if (!byWork.has(w.id)) return w;
      const rowsForWork = byWork.get(w.id)!;
      const newPricing = rowsForWork
        .filter((r) => r.label.trim() && r.price > 0)
        .map((r) => ({
          label: r.label.trim(),
          price: Math.round(r.price * 100) / 100,
        }));
      if (newPricing.length === 0) {
        // Don't accidentally wipe a work's only sizes if the artist
        // emptied them all — leave the original pricing intact.
        return w;
      }
      const lowest = Math.min(...newPricing.map((p) => p.price));
      return {
        ...w,
        pricing: newPricing,
        priceBand: `From £${lowest}`,
      };
    });
    saveWorks(next);
    showToast(
      `Updated prices for ${byWork.size} work${byWork.size === 1 ? "" : "s"}`,
    );
    setBulkPricesOpen(false);
  }

  /**
   * Two-step Copy-from flow for the bulk-edit toolbar (mirrors the
   * bulk-add modal pattern).
   *
   * Step 1 — `bulkEditPickSource`: artist picks which work to copy
   * from. The target set defaults to every work currently selected
   * EXCEPT the source itself (applying to the source is a no-op).
   *
   * Step 2 — `bulkEditApplyToTargets`: artist ticks which targets to
   * keep, hits Apply. Behaviour depends on `bulkEditApplyKind`:
   *
   *   - "sizes": copy size LABELS only. For matching labels keep the
   *     target's existing price; for new labels, default price=0
   *     (artist fills in afterwards). Doesn't touch shipping or
   *     in-store prices.
   *
   *   - "prices": fill in £ values for size labels the target already
   *     has. Labels not present in the source stay untouched. Also
   *     propagates the source's `shippingPrice`, `inStorePrice` and
   *     `inStorePricing` IF the source has them set — this matches
   *     how artists actually price: shipping & in-store are usually
   *     consistent across a series, so when copying prices from a
   *     "reference" piece we want to clone those too. We only
   *     overwrite when the source has a value, so a target's existing
   *     shipping isn't wiped by a source that hasn't set one.
   */
  function bulkEditPickSource(source: ArtistWork) {
    setBulkEditPendingSource(source);
    setBulkEditTargetIds(
      new Set(
        works
          .filter((w) => selectedIds.has(w.id) && w.id !== source.id)
          .map((w) => w.id),
      ),
    );
  }

  function bulkEditCancelApply() {
    setBulkEditApplyKind(null);
    setBulkEditPendingSource(null);
    setBulkEditTargetIds(new Set());
  }

  /**
   * Apply a source work's sizes OR prices into the currently-open
   * Add/Edit form. Used by the picker that lives next to the size
   * table header. The two operations are strictly independent —
   * "Copy sizes" must NOT seed prices, "Copy prices" must NOT touch
   * size labels. Lumping them together led to artists clicking
   * "Copy sizes" expecting just the labels and finding the prices
   * had been overwritten too. This was the bug the user flagged:
   * "autofill sizes from another work… also autofills prices,
   * should just be sizes".
   *
   * "sizes" — replace the form's size labels with the source's.
   * For matching labels keep the form's existing prices; for new
   * labels seed price=0 so the artist explicitly fills them in.
   * Shipping arrays reset to empty (prices flow brings shipping;
   * sizes flow doesn't).
   *
   * "prices" — index-aligned. Source row i's price ↔ form row i's
   * price. Per-size shipping comes along where set on the source.
   * Work-level shipping / in-store prices also propagate IF the
   * source has them. Size LABELS are never touched.
   */
  function applyCopyFromSourceToForm(
    source: ArtistWork,
    kind: "sizes" | "prices",
  ) {
    setForm((p) => {
      if (kind === "sizes") {
        // Replace labels only. Prices for matching labels are
        // preserved (case-insensitive) so an artist who sets up
        // their prices first then aligns the size table to a
        // reference work doesn't lose their numbers.
        const existingByLabel = new Map(
          p.sizes.map((s) => [s.label.toLowerCase(), s.price]),
        );
        const newSizes: SizeEntry[] = source.pricing.map((s) => ({
          label: s.label,
          price: existingByLabel.get(s.label.toLowerCase()) ?? 0,
        }));
        return {
          ...p,
          sizes: newSizes,
          // Reset parallel arrays so they line up with the new
          // labels — but keep them empty (no shipping/in-store
          // copied through the sizes flow).
          shippingPerSize: false,
          sizeShipping: newSizes.map(() => ""),
          stockPerSize: false,
          sizeStock: newSizes.map(() => ""),
          inStorePricing: newSizes.map(() => ""),
        };
      }
      // kind === "prices" — index-aligned per-row copy. Labels are
      // left as-is; only the price (and optionally per-size
      // shipping) is filled in.
      const nextSizes = p.sizes.map((s, i) => ({
        ...s,
        price: source.pricing[i]?.price ?? s.price,
      }));
      const nextSizeShipping = p.sizes.map((_, i) => {
        const shipping = source.pricing[i]?.shippingPrice;
        return typeof shipping === "number" ? String(shipping) : "";
      });
      const anyShipping = nextSizeShipping.some((v) => v !== "");
      const nextInStorePricing =
        Array.isArray(source.inStorePricing) &&
        source.inStorePricing.length > 0
          ? p.sizes.map((_, i) => {
              const v = source.inStorePricing![i]?.price;
              return typeof v === "number" && v > 0 ? String(v) : "";
            })
          : p.inStorePricing;
      return {
        ...p,
        sizes: nextSizes,
        sizeShipping: anyShipping ? nextSizeShipping : p.sizeShipping,
        shippingPerSize: anyShipping || p.shippingPerSize,
        shippingPrice:
          source.shippingPrice != null
            ? String(source.shippingPrice)
            : p.shippingPrice,
        inStorePrice:
          source.inStorePrice != null
            ? String(source.inStorePrice)
            : p.inStorePrice,
        inStorePricing: nextInStorePricing,
        inStoreEnabled:
          (Array.isArray(source.inStorePricing) &&
            source.inStorePricing.length > 0) ||
          source.inStorePrice != null
            ? true
            : p.inStoreEnabled,
      };
    });
    setFormCopyKind(null);
    showToast(`Applied ${kind} from "${source.title}"`);
  }

  function bulkEditApplyToTargets() {
    if (!bulkEditPendingSource || bulkEditApplyKind === null) return;
    const source = bulkEditPendingSource;
    const kind = bulkEditApplyKind;
    if (bulkEditTargetIds.size === 0) return;

    const next = works.map((w) => {
      if (!bulkEditTargetIds.has(w.id)) return w;
      if (kind === "sizes") {
        const nextPricing: SizePricing[] = source.pricing.map((s) => {
          const existing = w.pricing.find(
            (x) => x.label.toLowerCase() === s.label.toLowerCase(),
          );
          return {
            label: s.label,
            price: existing?.price ?? 0,
            quantityAvailable: existing?.quantityAvailable ?? null,
          };
        });
        const prices = nextPricing.map((p) => p.price).filter((n) => n > 0);
        const lowest = prices.length > 0 ? Math.min(...prices) : 0;
        return {
          ...w,
          pricing: nextPricing,
          priceBand: lowest > 0 ? `From £${lowest}` : w.priceBand,
        };
      }
      // kind === "prices" — copy row-by-row (index-aligned), not by
      // matching size labels. Artists asked for this: their size
      // tables don't always use identical labels (e.g. "A4 print"
      // vs "A4 / 30×21cm") but the row order is consistent across
      // a series, so the i-th source row ↔ i-th target row gives
      // them what they actually want. Target rows beyond the
      // source's length keep their existing price.
      //
      // Per-size shipping is brought along the same way: if the
      // source set a row-i shipping price, that lands on the
      // target's row i. We don't blank out an existing target
      // shipping just because the source didn't set one — preserve
      // it explicitly.
      const nextPricing: SizePricing[] = w.pricing.map((s, i) => {
        const sourceRow = source.pricing[i];
        const next: SizePricing = {
          ...s,
          price: sourceRow?.price ?? s.price,
        };
        if (sourceRow?.shippingPrice != null) {
          next.shippingPrice = sourceRow.shippingPrice;
        }
        return next;
      });
      const lowest = Math.min(...nextPricing.map((p) => p.price));
      const result: ArtistWork = {
        ...w,
        pricing: nextPricing,
        priceBand: lowest > 0 ? `From £${lowest}` : w.priceBand,
      };
      // Only overwrite work-level shipping / in-store fields when the
      // source has them set — matches the user's ask: "if the one I'm
      // copying from has those prices available too".
      if (source.shippingPrice != null) {
        result.shippingPrice = source.shippingPrice;
      }
      if (source.inStorePrice != null) {
        result.inStorePrice = source.inStorePrice;
      }
      if (
        Array.isArray(source.inStorePricing) &&
        source.inStorePricing.length > 0
      ) {
        // Per-size in-store pricing — index-aligned, same as the
        // main pricing copy above. Source row i's in-store price
        // lands on target row i. Drops rows where source had no
        // in-store entry so we don't seed zeros into the target.
        const inStoreCloned = nextPricing
          .map((p, i) => ({
            label: p.label,
            price: source.inStorePricing![i]?.price ?? 0,
          }))
          .filter((p) => p.price > 0);
        if (inStoreCloned.length > 0) {
          result.inStorePricing = inStoreCloned;
        }
      }
      return result;
    });
    saveWorks(next);
    showToast(
      `Applied ${kind} from "${source.title}" to ${bulkEditTargetIds.size} work${
        bulkEditTargetIds.size === 1 ? "" : "s"
      }`,
    );
    bulkEditCancelApply();
  }

  function openAdd(seed?: Partial<WorkFormState>) {
    // `seed` lets the Duplicate flow preload everything except the
    // title + image — those should be unique per work so the artist
    // doesn't accidentally publish two artworks with the same headline.
    const fresh: WorkFormState = {
      ...emptyWork,
      sizes: [...defaultSizes],
      ...seed,
      title: "",
      imagePreview: "",
      additionalImages: [],
    };
    setForm(fresh);
    initialFormJson.current = JSON.stringify(fresh);
    setEditingIndex(null);
    setShowForm(true);
  }

  /**
   * "Duplicate from this work" — opens the new-work form with sizes,
   * prices, medium, dimensions, orientation, shipping, frames, etc.
   * pre-populated from the source work. Title and images stay blank
   * so the artist replaces them. Implements user ask:
   * "auto-fill details from previous artwork".
   */
  function duplicateFrom(index: number) {
    const w = works[index] as ArtistWork & {
      shippingPrice?: number | null;
      inStorePrice?: number | null;
      quantityAvailable?: number | null;
    };
    openAdd({
      medium: w.medium,
      dimensions: w.dimensions,
      description: w.description ?? "",
      available: true,
      orientation: w.orientation || "landscape",
      sizes: w.pricing.map((p) => ({ label: p.label, price: p.price })),
      shippingPrice: w.shippingPrice != null ? String(w.shippingPrice) : "",
      inStorePrice: w.inStorePrice != null ? String(w.inStorePrice) : "",
      inStoreEnabled:
        Array.isArray(w.inStorePricing) &&
        w.inStorePricing.some((p) => p.price > 0),
      inStorePricing: w.inStorePricing
        ? w.inStorePricing.map((p) => String(p.price))
        : [],
      quantityAvailable:
        w.quantityAvailable != null ? String(w.quantityAvailable) : "",
      frameOptions: ((w as ArtistWork & {
        frameOptions?: { label: string; priceUplift: number; imageUrl?: string }[];
      }).frameOptions ?? []).map((f) => ({
        label: f.label,
        priceUplift: String(f.priceUplift),
        imageUrl: f.imageUrl,
      })),
    });
  }

  function openEdit(index: number) {
    const w = works[index] as ArtistWork & { shippingPrice?: number };
    const initial: WorkFormState = {
      title: w.title,
      medium: w.medium,
      dimensions: w.dimensions,
      imagePreview: w.image,
      additionalImages: Array.isArray(w.images) ? [...w.images] : [],
      description: w.description || "",
      available: w.available,
      orientation: w.orientation || "landscape",
      sizes: w.pricing.map((p) => ({ label: p.label, price: p.price })),
      shippingPrice: w.shippingPrice != null ? String(w.shippingPrice) : "",
      // Rehydrate per-size shipping. Previously hard-coded to `false`
      // / `[]` here, which meant opening a work that HAD per-size
      // shipping silently lost it: the toggle showed off, the column
      // disappeared, and Save Changes overwrote the work without the
      // per-size values. Now we look at `pricing[i].shippingPrice`:
      // if any size carries a number, the toggle flips on and the
      // column is populated.
      shippingPerSize: w.pricing.some(
        (p) => typeof p.shippingPrice === "number",
      ),
      sizeShipping: w.pricing.map((p) =>
        typeof p.shippingPrice === "number" ? String(p.shippingPrice) : "",
      ),
      inStorePrice: w.inStorePrice != null ? String(w.inStorePrice) : "",
      inStorePricing: w.inStorePricing ? w.inStorePricing.map((p) => String(p.price)) : [],
      inStoreEnabled: Array.isArray(w.inStorePricing) && w.inStorePricing.some((p) => p.price > 0),
      // Rehydrate the per-size Qty column from each SizePricing's
      // optional quantityAvailable. If any size carries a number we
      // flip the toggle on so the column shows.
      stockPerSize: w.pricing.some((p) => typeof p.quantityAvailable === "number"),
      sizeStock: w.pricing.map((p) => typeof p.quantityAvailable === "number" ? String(p.quantityAvailable) : ""),
      detectedRatio: null,
      quantityAvailable: (w as ArtistWork & { quantityAvailable?: number | null }).quantityAvailable != null
        ? String((w as ArtistWork & { quantityAvailable?: number | null }).quantityAvailable)
        : "",
      frameOptions: Array.isArray((w as ArtistWork & { frameOptions?: { label: string; priceUplift: number; imageUrl?: string }[] }).frameOptions)
        ? (w as ArtistWork & { frameOptions?: { label: string; priceUplift: number; imageUrl?: string }[] }).frameOptions!.map((f) => ({ label: f.label, priceUplift: String(f.priceUplift), imageUrl: f.imageUrl }))
        : [],
    };
    setForm(initial);
    initialFormJson.current = JSON.stringify(initial);
    setEditingIndex(index);
    setShowForm(true);

    // Scroll the form into view so the artist lands at the top of
    // the edit panel instead of the work grid they just clicked
    // from. Without this, clicking Edit on a work three rows down
    // mounts the form above and leaves the viewport at the row's
    // y-position — the artist sees no visible change. Defer to the
    // next frame so React has finished the showForm=true layout
    // pass before we scroll.
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    // Detect ratio from existing image for size suggestions
    if (w.image) {
      const img = new window.Image();
      img.onload = () => {
        const ratio = img.naturalWidth / img.naturalHeight;
        setForm((p) => ({ ...p, detectedRatio: ratio }));
      };
      img.src = w.image;
    }
  }

  // Core upload routine — accepts a raw File so it can be called from
  // both the file-input change event and the drag-and-drop handler.
  async function handleImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setFormError("Please choose an image file (JPG, PNG, or WebP).");
      return;
    }
    setUploading(true);

    // Detect image dimensions before upload
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
    const ratio = img.naturalWidth / img.naturalHeight;
    URL.revokeObjectURL(objectUrl);

    // Auto-detect orientation
    const orientation: "landscape" | "portrait" | "square" =
      ratio > 1.05 ? "landscape" : ratio < 0.95 ? "portrait" : "square";

    // Generate suggested sizes matching this ratio
    const suggested = getSuggestedSizes(ratio);
    const sizesToUse = suggested.length > 0 ? suggested : [{ label: '10×8" (A4)', price: 0 }];

    const url = await uploadImage(file, "artworks");
    setForm((p) => ({
      ...p,
      imagePreview: url,
      orientation,
      detectedRatio: ratio,
      dimensions: `${img.naturalWidth} × ${img.naturalHeight} px`,
      // Only auto-set sizes if user hasn't already entered prices
      sizes: p.sizes.some((s) => s.price > 0) ? p.sizes : sizesToUse,
    }));
    setUploading(false);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImageFile(file);
    // Clear the input so the same file can be re-picked.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAdditionalImageFiles(files: File[]) {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const plan = artist?.subscriptionPlan || "core";
    const totalLimit = IMAGE_LIMITS[plan] ?? 3;
    const extrasAllowed = Math.max(0, totalLimit - 1);
    const currentExtras = form.additionalImages.length;
    const canAdd = Math.max(0, extrasAllowed - currentExtras);

    if (canAdd === 0) {
      setFormError(`Your ${plan} plan allows ${totalLimit} image${totalLimit === 1 ? "" : "s"} per artwork.`);
      return;
    }

    setUploadingExtra(true);
    setFormError("");
    const toUpload = imageFiles.slice(0, canAdd);
    try {
      const urls = await Promise.all(toUpload.map((f) => uploadImage(f, "artworks")));
      const clean = urls.filter((u) => typeof u === "string" && u.length > 0);
      setForm((p) => ({ ...p, additionalImages: [...p.additionalImages, ...clean] }));
    } catch (err) {
      console.error("Additional image upload failed:", err);
      setFormError("One or more images failed to upload.");
    } finally {
      setUploadingExtra(false);
    }
  }

  async function handleAdditionalImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    await handleAdditionalImageFiles(files);
    if (extraFileInputRef.current) extraFileInputRef.current.value = "";
  }

  function removeAdditionalImage(index: number) {
    setForm((p) => ({ ...p, additionalImages: p.additionalImages.filter((_, i) => i !== index) }));
  }

  function moveAdditionalImage(index: number, dir: -1 | 1) {
    setForm((p) => {
      const next = [...p.additionalImages];
      const target = index + dir;
      if (target < 0 || target >= next.length) return p;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...p, additionalImages: next };
    });
  }

  function addSize() {
    setForm((p) => ({
      ...p,
      sizes: [...p.sizes, { label: "", price: 0 }],
      // Keep the parallel per-size arrays aligned so a new row
      // doesn't silently drop / mis-align shipping / in-store / qty
      // values when the user edits them.
      sizeShipping: p.shippingPerSize ? [...p.sizeShipping, ""] : p.sizeShipping,
      inStorePricing: p.inStoreEnabled ? [...p.inStorePricing, ""] : p.inStorePricing,
      sizeStock: p.stockPerSize ? [...p.sizeStock, ""] : p.sizeStock,
    }));
  }

  function updateSize(index: number, field: "label" | "price", value: string | number) {
    setForm((p) => ({
      ...p,
      sizes: p.sizes.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  }

  function removeSize(index: number) {
    setForm((p) => ({
      ...p,
      sizes: p.sizes.filter((_, i) => i !== index),
      sizeShipping: p.sizeShipping.filter((_, i) => i !== index),
      inStorePricing: p.inStorePricing.filter((_, i) => i !== index),
      sizeStock: p.sizeStock.filter((_, i) => i !== index),
    }));
  }

  function handleSubmit() {
    setFormError("");

    if (!form.title.trim()) {
      setFormError("Title is required");
      return;
    }
    if (form.title.length > 200) {
      setFormError("Title must be under 200 characters");
      return;
    }

    const validSizes = form.sizes.filter((s) => s.label && s.price > 0);
    if (validSizes.length === 0) {
      setFormError("At least one size with a price above £0 is required");
      return;
    }
    if (validSizes.some((s) => s.price > 100000)) {
      setFormError("Price must be under £100,000");
      return;
    }

    const lowestPrice = Math.min(...validSizes.map((s) => s.price));

    const shippingVal = form.shippingPrice.trim() ? parseFloat(form.shippingPrice) : undefined;
    const inStoreVal = form.inStorePrice.trim() ? parseFloat(form.inStorePrice) : undefined;
    const qtyRaw = form.quantityAvailable.trim();
    const qtyVal = qtyRaw === "" ? null : Math.max(0, Math.floor(Number(qtyRaw)));
    const qtyFinite = qtyVal !== null && Number.isFinite(qtyVal);

    const cleanFrameOptions = form.frameOptions
      .map((f) => ({
        label: f.label.trim(),
        priceUplift: Number(f.priceUplift) || 0,
        ...(f.imageUrl && f.imageUrl.length > 0 ? { imageUrl: f.imageUrl } : {}),
      }))
      .filter((f) => f.label.length > 0);

    const newWork: ArtistWork & { shippingPrice?: number; inStorePrice?: number; quantityAvailable?: number | null; frameOptions?: { label: string; priceUplift: number; imageUrl?: string }[] } = {
      id: editingIndex !== null ? works[editingIndex].id : `${artist!.slug}-${Date.now()}`,
      title: form.title,
      medium: form.medium,
      dimensions: form.dimensions,
      priceBand: `From \u00a3${lowestPrice}`,
      // Attach per-size stock when the toggle is on. Find the
      // matching sizeStock entry by label so filter + add rows stay
      // aligned even if the array indexes have drifted.
      pricing: validSizes.map((s) => {
        const base: {
          label: string;
          price: number;
          quantityAvailable?: number;
          shippingPrice?: number;
        } = {
          label: s.label,
          price: s.price,
        };
        // Look up the original form.sizes index by label so the
        // sizeStock / sizeShipping arrays stay aligned even if the
        // artist removed empty rows above this one.
        const formIdx = form.sizes.findIndex((x) => x.label === s.label);
        if (form.stockPerSize) {
          const raw = form.sizeStock[formIdx];
          const n = raw === undefined || raw === "" ? NaN : Number(raw);
          if (Number.isFinite(n) && n >= 0) base.quantityAvailable = Math.floor(n);
        }
        // Per-size shipping is the bug-fix: we previously dropped it
        // on the floor (no SizePricing.shippingPrice field) so the
        // form's per-size values never made it to the DB. Now we
        // persist them when the toggle is on AND the row has a
        // numeric value. Empty rows are skipped so the work-level
        // `shippingPrice` can still apply for that size.
        if (form.shippingPerSize) {
          const raw = form.sizeShipping[formIdx];
          const n = raw === undefined || raw === "" ? NaN : Number(raw);
          if (Number.isFinite(n) && n >= 0) base.shippingPrice = n;
        }
        return base;
      }),
      available: form.available && (!qtyFinite || qtyVal! > 0),
      color: "#C17C5A",
      description: form.description.trim(),
      images: form.additionalImages.filter((u) => typeof u === "string" && u.length > 0),
      image: form.imagePreview || "https://picsum.photos/seed/new-work/900/600",
      orientation: form.orientation,
      ...(shippingVal != null && !isNaN(shippingVal) ? { shippingPrice: shippingVal } : {}),
      ...(inStoreVal != null && !isNaN(inStoreVal) ? { inStorePrice: inStoreVal } : {}),
      // In-store pricing — walk form.sizes (NOT validSizes) so we
      // line up with the parallel `form.inStorePricing[]` array. The
      // previous code used `validSizes.map((s, i) => form.inStorePricing[i])`
      // which silently mismatched whenever the artist had any
      // empty-priced rows above a priced one: validSizes filtered
      // those rows out so its index 0 was form.sizes[1], but the
      // in-store array still held the form.sizes[0] value at index 0
      // — the saved in-store price ended up bound to the wrong size.
      // We also drop entries where the *online* price is 0 (matches
      // the validSizes filter applied to `pricing` above) so the
      // shapes stay aligned, and we gate on `inStoreEnabled` so a
      // toggle-off truly clears the section.
      inStorePricing: form.inStoreEnabled
        ? form.sizes
            .map((s, i) => {
              if (!s.label || !(s.price > 0)) return null;
              const raw = form.inStorePricing[i];
              const price = raw ? parseFloat(raw) : 0;
              return Number.isFinite(price) && price > 0
                ? { label: s.label, price }
                : null;
            })
            .filter(
              (p): p is { label: string; price: number } => p !== null,
            )
        : undefined,
      quantityAvailable: qtyFinite ? qtyVal : null,
      frameOptions: cleanFrameOptions.length > 0 ? cleanFrameOptions : undefined,
    };

    let updated: ArtistWork[];
    if (editingIndex !== null) {
      updated = works.map((w, i) => (i === editingIndex ? newWork : w));
    } else {
      updated = [...works, newWork];
    }

    saveWorks(updated);
    // Clear dirty snapshot so the beforeunload guard drops after save
    initialFormJson.current = JSON.stringify(form);
    setShowForm(false);
    showToast(editingIndex !== null ? "Artwork updated" : "Artwork added");
    setEditingIndex(null);
  }

  function deleteWork(index: number) {
    handleDeleteWork(index);
  }

  const inputClass = "w-full bg-background border border-border rounded-sm px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors";

  return (
    <ArtistPortalLayout activePath="/artist-portal/portfolio">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h1 className="text-2xl lg:text-3xl">My Portfolio</h1>
        <div className="flex gap-2">
          <Button href="/artist-portal/profile" variant="secondary" size="sm">
            Edit Profile
          </Button>
          {(() => {
            const plan = artist?.subscriptionPlan || "core";
            const limit = PORTFOLIO_LIMITS[plan] || 8;
            const atLimit = works.length >= limit;
            return atLimit ? (
              <div className="text-right">
                <p className="text-xs text-muted">{works.length}/{limit} works</p>
                <a href="/pricing" className="text-xs text-accent hover:text-accent-hover">Upgrade for more</a>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">{works.length}/{limit} works</span>
                <button onClick={() => openAdd()} className="px-4 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors">
                  + Add New Work
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Shipping Settings — rendered only when the edit form is closed,
          so clicking "Edit work" doesn't push the form below a tall
          settings panel. When the form opens it slots in here at the
          top of the page. */}
      {!showForm && (
      <div className="bg-surface border border-border rounded-sm p-5 mb-6 space-y-5" id="shipping-settings">
        <h2 className="text-sm font-medium">Shipping Settings</h2>

        {/* Default UK Shipping */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium mb-0.5">Default UK Shipping</p>
            <p className="text-xs text-muted">Applied to all works unless overridden per work. System default is £9.95.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">&pound;</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={defaultShipping}
              onChange={(e) => setDefaultShipping(e.target.value)}
              placeholder="9.95"
              className="w-24 bg-background border border-border rounded-sm px-3 py-2 text-sm text-foreground text-right focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>

        {/* International Shipping */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium mb-0.5">International Shipping</p>
              <p className="text-xs text-muted">Enable to accept orders from outside the UK.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={shipsInternationally}
              onClick={() => setShipsInternationally(!shipsInternationally)}
              className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors duration-200 cursor-pointer ${
                shipsInternationally ? "bg-accent" : "bg-border"
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform duration-200 ${shipsInternationally ? "translate-x-4" : "translate-x-1"}`} />
            </button>
          </div>
          {shipsInternationally && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">&pound;</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={internationalShipping}
                onChange={(e) => setInternationalShipping(e.target.value)}
                placeholder="19.95"
                className="w-24 bg-background border border-border rounded-sm px-3 py-2 text-sm text-foreground text-right focus:outline-none focus:border-accent/60"
              />
              <span className="text-xs text-muted">per item</span>
            </div>
          )}
        </div>

        {/* Save all shipping settings */}
        <div className="border-t border-border pt-4">
          <button
            onClick={async () => {
              setSavingDefault(true);
              const ukVal = defaultShipping.trim() ? parseFloat(defaultShipping) : null;
              const intlVal = internationalShipping.trim() ? parseFloat(internationalShipping) : null;
              await authFetch("/api/artist-profile", {
                method: "PUT",
                body: JSON.stringify({
                  default_shipping_price: ukVal,
                  ships_internationally: shipsInternationally,
                  international_shipping_price: intlVal,
                }),
              }).catch(() => {});
              setSavingDefault(false);
            }}
            disabled={savingDefault}
            className="px-4 py-2 text-xs font-medium bg-foreground text-white rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50"
          >
            {savingDefault ? "Saving..." : "Save Shipping Settings"}
          </button>
        </div>
      </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-surface border border-border rounded-sm p-6 mb-6">
          {/* Sticky form header — title on the left, Cancel + primary
              save on the right. The save button used to live only at
              the very bottom of a long form; on mobile + on works
              with lots of size rows the artist had to scroll past
              everything to commit changes. Mirroring it at the top
              (with the same handleSubmit) means Save Changes is
              always one tap away. The bottom button stays as a
              fall-through for desktop scroll-flow. */}
          <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
            <h2 className="text-base font-medium">
              {editingIndex !== null ? "Edit Work" : "Add New Work"}
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="text-xs text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="text-xs px-4 py-2 rounded-sm bg-foreground text-white hover:bg-foreground/90 transition-colors font-medium"
              >
                {editingIndex !== null ? "Save Changes" : "Save Work"}
              </button>
            </div>
          </div>

          <div className="space-y-5">
            {/* Image upload — supports drag-drop. Both the empty state
                and the populated state listen for drops so artists can
                replace by dragging without having to click "Replace". */}
            <div>
              <label className="block text-sm font-medium mb-2">Image <span className="text-accent">*</span></label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              {form.imagePreview ? (
                <div
                  className="space-y-3"
                  onDragOver={(e) => {
                    if (e.dataTransfer.types?.includes("Files")) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      if (!dragMain) setDragMain(true);
                    }
                  }}
                  onDragLeave={() => setDragMain(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragMain(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleImageFile(file);
                  }}
                >
                  {/*
                   * Big preview: artists need to actually see the work
                   * they're editing. Caps height so a tall portrait
                   * doesn't push the rest of the form off-screen, and
                   * uses object-contain so we never crop their image.
                   */}
                  <div
                    className={`relative w-full max-w-2xl rounded-sm overflow-hidden bg-stone-100 border ${
                      dragMain ? "border-accent ring-2 ring-accent/30" : "border-border"
                    }`}
                  >
                    <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
                      <Image
                        src={form.imagePreview}
                        alt="Preview"
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                      {dragMain && (
                        <div className="absolute inset-0 grid place-items-center bg-accent/15 backdrop-blur-[1px]">
                          <span className="text-xs font-medium text-accent bg-white px-3 py-1.5 rounded-full shadow">
                            Drop to replace
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 text-sm font-medium border border-border rounded-sm hover:border-foreground/30 transition-colors"
                    >
                      {uploading ? "Uploading..." : "Replace Image"}
                    </button>
                    <p className="text-[10px] text-muted">JPG, PNG, or WebP — drag-and-drop supported. Recommended minimum 1200px wide.</p>
                    <p className="text-[10px] text-muted/80 italic">Public versions are capped to a smaller resolution to discourage image theft — your full-resolution original is kept on file for fulfilment.</p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types?.includes("Files")) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      if (!dragMain) setDragMain(true);
                    }
                  }}
                  onDragLeave={() => setDragMain(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragMain(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleImageFile(file);
                  }}
                  className={`w-full max-w-2xl rounded-sm border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-2 py-16 ${
                    dragMain
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent hover:bg-accent/5"
                  }`}
                >
                  <span className="text-sm text-muted">
                    {uploading ? "Uploading..." : dragMain ? "Drop to upload" : "Click or drag an image here"}
                  </span>
                  <span className="text-[10px] text-muted">JPG, PNG, or WebP. Recommended minimum 1200px wide.</span>
                  <span className="text-[10px] text-muted/80 italic">Public images are downsized to discourage theft — the original is kept for fulfilment.</span>
                </button>
              )}
            </div>

            {/* Additional images */}
            {(() => {
              const plan = artist?.subscriptionPlan || "core";
              const totalLimit = IMAGE_LIMITS[plan] ?? 3;
              const extrasAllowed = Math.max(0, totalLimit - 1);
              const used = form.additionalImages.length;
              const atLimit = used >= extrasAllowed;
              return (
                <div>
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <label className="block text-sm font-medium">Additional images <span className="text-muted font-normal">(optional)</span></label>
                      <p className="text-[10px] text-muted mt-0.5">
                        Show details, textures, in-situ shots, or frame options. Primary image counts towards your total.
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted">
                        {used + 1}/{totalLimit} <span className="uppercase tracking-wider">({plan})</span>
                      </p>
                      {atLimit && plan !== "pro" && (
                        <a href="/pricing" className="text-[10px] text-accent hover:text-accent-hover">Upgrade for more</a>
                      )}
                    </div>
                  </div>
                  <input
                    ref={extraFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleAdditionalImageUpload}
                    className="hidden"
                  />
                  {extrasAllowed === 0 ? (
                    <p className="text-[11px] text-muted">
                      Your {plan} plan includes 1 image per artwork. <a href="/pricing" className="text-accent hover:text-accent-hover">Upgrade</a> to add more.
                    </p>
                  ) : (
                    <div
                      className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 rounded-sm transition-colors ${
                        dragExtras ? "ring-2 ring-accent/40 bg-accent/5 p-1" : ""
                      }`}
                      onDragOver={(e) => {
                        if (atLimit) return;
                        if (e.dataTransfer.types?.includes("Files")) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "copy";
                          if (!dragExtras) setDragExtras(true);
                        }
                      }}
                      onDragLeave={() => setDragExtras(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragExtras(false);
                        if (atLimit) return;
                        const files = Array.from(e.dataTransfer.files ?? []);
                        if (files.length > 0) handleAdditionalImageFiles(files);
                      }}
                    >
                      {form.additionalImages.map((img, i) => (
                        <div
                          key={img + i}
                          className="relative group aspect-square rounded-sm overflow-hidden bg-border/20"
                        >
                          <Image src={img} alt={`Additional ${i + 1}`} fill className="object-cover" sizes="120px" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                          <div className="absolute inset-0 flex items-start justify-between p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex gap-0.5">
                              <button
                                type="button"
                                onClick={() => moveAdditionalImage(i, -1)}
                                disabled={i === 0}
                                className="w-5 h-5 flex items-center justify-center bg-white/90 text-foreground rounded-sm disabled:opacity-40"
                                aria-label="Move left"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => moveAdditionalImage(i, 1)}
                                disabled={i === form.additionalImages.length - 1}
                                className="w-5 h-5 flex items-center justify-center bg-white/90 text-foreground rounded-sm disabled:opacity-40"
                                aria-label="Move right"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeAdditionalImage(i)}
                              className="w-5 h-5 flex items-center justify-center bg-white/90 text-red-500 rounded-sm"
                              aria-label="Remove image"
                            >
                              <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                      {!atLimit && (
                        <button
                          type="button"
                          onClick={() => extraFileInputRef.current?.click()}
                          disabled={uploadingExtra}
                          className="aspect-square flex items-center justify-center border-2 border-dashed border-border rounded-sm text-muted hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
                        >
                          <span className="text-xs">{uploadingExtra ? "Uploading..." : "+ Add"}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Title + Medium */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Title <span className="text-accent">*</span></label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Last Light on Mare Street"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Medium <span className="text-muted font-normal">(optional)</span>
                </label>
                <Combobox
                  value={form.medium}
                  onChange={(next) => setForm((p) => ({ ...p, medium: next }))}
                  options={WORK_MEDIUM_OPTIONS}
                  allowCustom
                  placeholder="e.g. Oil on canvas"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Description <span className="text-muted font-normal">(optional)</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value.slice(0, 2000) }))}
                placeholder="Tell the story behind this piece — inspiration, process, what you were thinking when you made it. This appears on the artwork page under 'About this work'."
                rows={5}
                maxLength={2000}
                className={`${inputClass} resize-y font-serif leading-relaxed`}
              />
              <p className="text-[10px] text-muted mt-1 text-right">
                {form.description.length}/2000
              </p>
            </div>

            {/* Dimensions + Orientation */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Original Dimensions</label>
                <input
                  type="text"
                  value={form.dimensions}
                  onChange={(e) => setForm((p) => ({ ...p, dimensions: e.target.value }))}
                  placeholder="e.g. 70 x 50 cm"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Orientation</label>
                <select
                  value={form.orientation}
                  onChange={(e) => setForm((p) => ({ ...p, orientation: e.target.value as "portrait" | "landscape" | "square" }))}
                  className={`${inputClass} wp-select`}
                >
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                  <option value="square">Square</option>
                </select>
              </div>
            </div>

            {/* Sizes, shipping and in-store — one unified table so the
                artist sets everything about a size in one row. Shipping
                and in-store columns only appear when their respective
                toggles are on; frame add-ons stay below as they apply
                across all sizes rather than per-size. */}
            <div>
              <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
                <label className="text-sm font-medium">Available Sizes & Prices <span className="text-accent">*</span></label>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Copy-from picker — opens a small dropdown of the
                      artist's existing works (excluding the one being
                      edited). Picking a source seeds either size
                      labels or row-aligned prices into the form. */}
                  <FormCopyFromPicker
                    works={works.filter(
                      (w) =>
                        editingIndex === null ||
                        w.id !== works[editingIndex]?.id,
                    )}
                    activeKind={formCopyKind}
                    onToggleOpen={(k) =>
                      setFormCopyKind(formCopyKind === k ? null : k)
                    }
                    onPick={applyCopyFromSourceToForm}
                  />
                  <button
                    type="button"
                    onClick={addSize}
                    className="text-xs text-accent hover:text-accent-hover transition-colors"
                  >
                    + Add custom size
                  </button>
                </div>
              </div>

              {/* Column toggles */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.shippingPerSize}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((p) => ({
                        ...p,
                        shippingPerSize: checked,
                        sizeShipping: checked ? p.sizes.map(() => "") : [],
                      }));
                    }}
                    className="w-3.5 h-3.5 rounded-sm border border-border accent-accent"
                  />
                  <span className="text-xs text-muted">Different shipping per size</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.inStoreEnabled}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((p) => ({
                        ...p,
                        inStoreEnabled: checked,
                        inStorePricing: checked ? (p.inStorePricing.length ? p.inStorePricing : p.sizes.map(() => "")) : [],
                      }));
                    }}
                    className="w-3.5 h-3.5 rounded-sm border border-border accent-accent"
                  />
                  <span className="text-xs text-muted">Also sold in-store at venues</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.stockPerSize}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((p) => ({
                        ...p,
                        stockPerSize: checked,
                        // Seed an empty entry for each existing size
                        // when turning on; leave blank = unlimited.
                        sizeStock: checked
                          ? (p.sizeStock.length === p.sizes.length ? p.sizeStock : p.sizes.map(() => ""))
                          : [],
                      }));
                    }}
                    className="w-3.5 h-3.5 rounded-sm border border-border accent-accent"
                  />
                  <span className="text-xs text-muted">Different quantity per size</span>
                </label>
              </div>

              {/* Quick-add standard sizes */}
              {form.detectedRatio && (
                <div className="mb-3">
                  <p className="text-[10px] text-muted mb-2">
                    Suggested sizes for your image ({form.orientation}, {form.detectedRatio.toFixed(2)} ratio):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {getSuggestedSizes(form.detectedRatio).map((s) => {
                      const alreadyAdded = form.sizes.some((existing) => existing.label === s.label);
                      return (
                        <button
                          key={s.label}
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => {
                            if (!alreadyAdded) {
                              setForm((p) => ({ ...p, sizes: [...p.sizes, { label: s.label, price: 0 }] }));
                            }
                          }}
                          className={`px-2.5 py-1 text-[11px] rounded-sm border transition-colors ${
                            alreadyAdded
                              ? "bg-accent/10 border-accent/30 text-accent cursor-default"
                              : "border-border text-muted hover:border-accent hover:text-accent cursor-pointer"
                          }`}
                        >
                          {alreadyAdded ? "✓ " : "+ "}{s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Desktop grid — explicit column template so Size takes
                  the space it needs and the price columns hug to the
                  right. Avoids the "Price floating 1000px from Size"
                  look that plain <table width=100%> was giving when
                  shipping and in-store were turned off. */}
              {(() => {
                // Build the grid-template-columns dynamically. Size is
                // a flexible column capped at ~340px; price/shipping/
                // in-store cells are fixed-width; the last column is
                // the remove icon.
                const cols = [
                  "minmax(140px, 360px)",   // Size
                  "1fr",                    // Spacer — pushes price columns to the right edge
                  "110px",                  // Price (£ + input)
                  form.shippingPerSize ? "140px" : null,
                  form.inStoreEnabled   ? "110px" : null,
                  form.stockPerSize     ? "90px"  : null,
                  "20px",                   // Remove
                ].filter(Boolean).join(" ");
                return (
                  <div className="hidden sm:block">
                    <div
                      className="grid items-center text-[10px] text-muted uppercase tracking-wider pb-2 gap-x-3"
                      style={{ gridTemplateColumns: cols }}
                    >
                      <div>Size</div>
                      <div />
                      <div className="text-right pr-1">Price</div>
                      {form.shippingPerSize && <div className="text-right pr-1">Shipping</div>}
                      {form.inStoreEnabled && <div className="text-right pr-1">In-store</div>}
                      {form.stockPerSize && <div className="text-right pr-1">Qty</div>}
                      <div />
                    </div>
                    <div className="divide-y divide-border/60">
                      {form.sizes.map((size, i) => {
                        const shipEst = estimateShipping({ dimensions: size.label || form.dimensions, framed: false, medium: form.medium });
                        const shipCurrent = form.sizeShipping[i] || "";
                        const storeCurrent = form.inStorePricing?.[i] || "";
                        return (
                          <div
                            key={i}
                            className="grid items-start py-2 gap-x-3"
                            style={{ gridTemplateColumns: cols }}
                          >
                            <input
                              type="text"
                              value={size.label}
                              onChange={(e) => updateSize(i, "label", e.target.value)}
                              placeholder='e.g. 12×16" (A3)'
                              className="bg-background border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-accent/60 min-w-0"
                            />
                            <div />
                            <div className="flex items-center gap-1 justify-end">
                              <span className="text-xs text-muted">£</span>
                              <input
                                type="number"
                                min={0}
                                value={size.price || ""}
                                onChange={(e) => updateSize(i, "price", Number(e.target.value) || 0)}
                                placeholder="0"
                                className="w-[90px] bg-background border border-border rounded-sm px-2 py-2 text-sm text-right focus:outline-none focus:border-accent/60"
                              />
                            </div>
                            {form.shippingPerSize && (
                              <div className="flex flex-col items-end gap-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-muted">£</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={shipCurrent}
                                    onChange={(e) => setForm((p) => {
                                      const updated = [...p.sizeShipping];
                                      updated[i] = e.target.value;
                                      return { ...p, sizeShipping: updated };
                                    })}
                                    placeholder={shipEst ? shipEst.cost.toFixed(2) : (defaultShipping || "9.95")}
                                    className="w-[90px] bg-background border border-border rounded-sm px-2 py-2 text-sm text-right focus:outline-none focus:border-accent/60"
                                  />
                                </div>
                                {shipEst && !shipCurrent && (
                                  <button
                                    type="button"
                                    onClick={() => setForm((p) => {
                                      const updated = [...p.sizeShipping];
                                      updated[i] = shipEst.cost.toFixed(2);
                                      return { ...p, sizeShipping: updated };
                                    })}
                                    className="text-[10px] text-accent hover:text-accent-hover whitespace-nowrap"
                                    title={`${tierLabel(shipEst.tier)} · ${shipEst.estimatedDays}`}
                                  >
                                    Recommended £{shipEst.cost.toFixed(2)}
                                  </button>
                                )}
                              </div>
                            )}
                            {form.inStoreEnabled && (
                              <div className="flex items-center gap-1 justify-end">
                                <span className="text-xs text-muted">£</span>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={storeCurrent}
                                  onChange={(e) => setForm((p) => {
                                    const updated = [...(p.inStorePricing?.length ? p.inStorePricing : p.sizes.map(() => ""))];
                                    updated[i] = e.target.value;
                                    return { ...p, inStorePricing: updated };
                                  })}
                                  placeholder="—"
                                  className="w-[90px] bg-background border border-border rounded-sm px-2 py-2 text-sm text-right focus:outline-none focus:border-accent/60"
                                />
                              </div>
                            )}
                            {form.stockPerSize && (
                              <div className="flex items-center gap-1 justify-end">
                                <input
                                  type="number"
                                  min={0}
                                  step="1"
                                  value={form.sizeStock[i] ?? ""}
                                  onChange={(e) => setForm((p) => {
                                    const updated = [...(p.sizeStock.length ? p.sizeStock : p.sizes.map(() => ""))];
                                    updated[i] = e.target.value;
                                    return { ...p, sizeStock: updated };
                                  })}
                                  placeholder="∞"
                                  className="w-[70px] bg-background border border-border rounded-sm px-2 py-2 text-sm text-right focus:outline-none focus:border-accent/60"
                                  aria-label="Quantity available at this size"
                                />
                              </div>
                            )}
                            <div className="flex items-center justify-end h-full">
                              {form.sizes.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => removeSize(i)}
                                  className="text-muted hover:text-red-500 transition-colors p-1"
                                  aria-label="Remove size"
                                >
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Mobile — stacked cards per size. The table doesn't fit
                  well on small viewports when multiple columns are on. */}
              <div className="sm:hidden space-y-3">
                {form.sizes.map((size, i) => {
                  const shipEst = estimateShipping({ dimensions: size.label || form.dimensions, framed: false, medium: form.medium });
                  const shipCurrent = form.sizeShipping[i] || "";
                  const storeCurrent = form.inStorePricing?.[i] || "";
                  return (
                    <div key={i} className="bg-background border border-border rounded-sm p-3">
                      <div className="flex items-start gap-2">
                        <input
                          type="text"
                          value={size.label}
                          onChange={(e) => updateSize(i, "label", e.target.value)}
                          placeholder='e.g. 12×16" (A3)'
                          className="flex-1 bg-background border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
                        />
                        {form.sizes.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSize(i)}
                            className="p-2 text-muted hover:text-red-500 transition-colors"
                            aria-label="Remove size"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] text-muted uppercase tracking-wider">Price</span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted">£</span>
                            <input
                              type="number"
                              min={0}
                              value={size.price || ""}
                              onChange={(e) => updateSize(i, "price", Number(e.target.value) || 0)}
                              placeholder="Price"
                              className="w-full bg-background border border-border rounded-sm px-2 py-2 text-sm focus:outline-none focus:border-accent/60"
                            />
                          </div>
                        </label>
                        {form.shippingPerSize && (
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted uppercase tracking-wider">Shipping</span>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted">£</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={shipCurrent}
                                onChange={(e) => setForm((p) => {
                                  const updated = [...p.sizeShipping];
                                  updated[i] = e.target.value;
                                  return { ...p, sizeShipping: updated };
                                })}
                                placeholder={shipEst ? shipEst.cost.toFixed(2) : (defaultShipping || "9.95")}
                                className="w-full bg-background border border-border rounded-sm px-2 py-2 text-sm focus:outline-none focus:border-accent/60"
                              />
                            </div>
                            {shipEst && !shipCurrent && (
                              <button
                                type="button"
                                onClick={() => setForm((p) => {
                                  const updated = [...p.sizeShipping];
                                  updated[i] = shipEst.cost.toFixed(2);
                                  return { ...p, sizeShipping: updated };
                                })}
                                className="text-[10px] text-accent hover:text-accent-hover text-left"
                                title={`${tierLabel(shipEst.tier)} · ${shipEst.estimatedDays}`}
                              >
                                Recommended £{shipEst.cost.toFixed(2)} ({tierLabel(shipEst.tier).toLowerCase()})
                              </button>
                            )}
                          </label>
                        )}
                        {form.inStoreEnabled && (
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted uppercase tracking-wider">In-store</span>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted">£</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={storeCurrent}
                                onChange={(e) => setForm((p) => {
                                  const updated = [...(p.inStorePricing?.length ? p.inStorePricing : p.sizes.map(() => ""))];
                                  updated[i] = e.target.value;
                                  return { ...p, inStorePricing: updated };
                                })}
                                placeholder="—"
                                className="w-full bg-background border border-border rounded-sm px-2 py-2 text-sm focus:outline-none focus:border-accent/60"
                              />
                            </div>
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-muted mt-2">
                Set a price for each size. Enable the toggles above to add per-size shipping or in-store prices as extra columns.
              </p>

              {/* Single-price shipping fallback — only visible when the
                  per-size toggle is off. Keeps one shipping number for
                  the whole artwork. */}
              {!form.shippingPerSize && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <label className="text-sm font-medium sm:w-40 shrink-0">Shipping price</label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted">£</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.shippingPrice}
                        onChange={(e) => setForm((p) => ({ ...p, shippingPrice: e.target.value }))}
                        placeholder={defaultShipping || "9.95"}
                        className="w-32 bg-background border border-border rounded-sm px-3 py-2 text-sm text-right focus:outline-none focus:border-accent/60"
                      />
                      <span className="text-[10px] text-muted ml-2">Blank = default · 0 = free</span>
                    </div>
                  </div>
                  {(() => {
                    // Suggest work-level shipping based on the SMALLEST
                    // priced size label, not form.dimensions. The
                    // dimensions field is auto-filled from the image's
                    // pixel size on upload ("1920 × 1080 px") — those
                    // numbers are large enough that the calculator's
                    // mm-fallback kicks in (any number > 300 → divide
                    // by 10), spitting out 192cm → oversized → £35.
                    // The smallest size label ("10×8\"" / "A4") parses
                    // correctly and gives the cheapest tier the artist
                    // actually ships, which is what "default" shipping
                    // means: the floor charge applied when the buyer
                    // picks the smallest size and the artist hasn't
                    // set per-size shipping.
                    const validSizes = form.sizes.filter(
                      (s) => s.label && s.price > 0,
                    );
                    let baseLabel = "";
                    let smallestArea = Infinity;
                    for (const s of validSizes) {
                      const e = estimateShipping({
                        dimensions: s.label,
                        framed: false,
                        medium: form.medium,
                      });
                      if (!e) continue;
                      const area = e.longestEdgeCm * e.longestEdgeCm;
                      if (area < smallestArea) {
                        smallestArea = area;
                        baseLabel = s.label;
                      }
                    }
                    const est = baseLabel
                      ? estimateShipping({
                          dimensions: baseLabel,
                          framed: false,
                          medium: form.medium,
                        })
                      : null;
                    if (!est) return null;
                    return (
                      <div className="mt-2 flex items-start gap-2 p-3 bg-accent/5 border border-accent/20 rounded-sm text-xs">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 mt-0.5">
                          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-foreground">
                            Suggested: <span className="font-semibold">£{est.cost.toFixed(2)}</span> — {tierLabel(est.tier)}, {est.estimatedDays}
                          </p>
                          {!form.shippingPrice && (
                            <button
                              type="button"
                              onClick={() => setForm((p) => ({ ...p, shippingPrice: est.cost.toFixed(2) }))}
                              className="mt-1 text-[11px] font-medium text-accent hover:text-accent-hover"
                            >
                              Use this price →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Available toggle */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, available: !p.available }))}
                  className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                    form.available ? "bg-accent border-accent" : "bg-white border-border"
                  }`}
                >
                  {form.available && <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>}
                </button>
                <span className="text-sm">Available for purchase</span>
              </label>
            </div>

            {/* Quantity available */}
            <div>
              <label className="block text-sm font-medium mb-1">Quantity available (optional)</label>
              <p className="text-xs text-muted mb-2">Leave blank for unlimited (e.g. print-on-demand). Enter a number if you have a fixed number of units.</p>
              <input
                type="number"
                min={0}
                step={1}
                value={form.quantityAvailable}
                onChange={(e) => setForm((p) => ({ ...p, quantityAvailable: e.target.value }))}
                placeholder="e.g. 10"
                className="w-32 bg-background border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
              />
            </div>

            {/* Frame options */}
            <div>
              <label className="block text-sm font-medium mb-1">Frame options (optional)</label>
              <p className="text-xs text-muted mb-3">Offer framed variants. Price uplift is added on top of the size price. Per-size pricing may be added later.</p>
              <div className="space-y-2">
                {form.frameOptions.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {/* Frame preview / upload trigger with hover-remove on top-right */}
                    <div className="relative w-12 h-12 sm:w-14 sm:h-14 shrink-0">
                      <label className="absolute inset-0 border border-dashed border-border rounded-sm flex items-center justify-center overflow-hidden bg-surface cursor-pointer hover:border-accent/60 transition-colors" title={f.imageUrl ? "Replace image" : "Add image"}>
                        {f.imageUrl ? (
                          <Image src={f.imageUrl} alt={f.label || "Frame preview"} fill sizes="56px" className="object-cover" />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="9" cy="9" r="1.5" />
                            <path d="m21 15-5-5L5 21" />
                          </svg>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const url = await uploadImage(file, "artworks");
                              setForm((p) => {
                                const next = [...p.frameOptions];
                                next[i] = { ...next[i], imageUrl: url };
                                return { ...p, frameOptions: next };
                              });
                            } catch {
                              setFormError("Frame image upload failed.");
                            } finally {
                              e.target.value = "";
                            }
                          }}
                        />
                      </label>
                      {f.imageUrl && (
                        <button
                          type="button"
                          onClick={() => setForm((p) => {
                            const next = [...p.frameOptions];
                            next[i] = { ...next[i], imageUrl: undefined };
                            return { ...p, frameOptions: next };
                          })}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center text-[9px] hover:bg-red-500 transition-colors"
                          aria-label="Remove frame image"
                          title="Remove frame image"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    {/* Label + price + delete — single row on one line */}
                    <input
                      type="text"
                      value={f.label}
                      onChange={(e) => setForm((p) => {
                        const next = [...p.frameOptions];
                        next[i] = { ...next[i], label: e.target.value };
                        return { ...p, frameOptions: next };
                      })}
                      placeholder="e.g. Black oak frame"
                      maxLength={80}
                      className="min-w-0 flex-1 bg-background border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-sm text-muted">+£</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={f.priceUplift}
                        onChange={(e) => setForm((p) => {
                          const next = [...p.frameOptions];
                          next[i] = { ...next[i], priceUplift: e.target.value };
                          return { ...p, frameOptions: next };
                        })}
                        placeholder="0"
                        className="w-16 sm:w-20 bg-background border border-border rounded-sm px-2 py-2 text-sm focus:outline-none focus:border-accent/60"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, frameOptions: p.frameOptions.filter((_, j) => j !== i) }))}
                      className="shrink-0 w-8 h-8 flex items-center justify-center text-muted hover:text-red-500 transition-colors"
                      aria-label="Remove frame option"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, frameOptions: [...p.frameOptions, { label: "", priceUplift: "" }] }))}
                  className="text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  + Add frame option
                </button>
              </div>
            </div>

            {/* Error message */}
            {formError && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {formError}
              </p>
            )}

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSubmit}
                disabled={!form.title || form.sizes.filter((s) => s.label && s.price > 0).length === 0}
                className="px-6 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {editingIndex !== null ? "Save Changes" : "Save Work"}
              </button>
              <button onClick={() => setShowForm(false)} className="px-6 py-2.5 text-sm text-muted border border-border rounded-sm hover:text-foreground transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Works grid */}
      <div className="bg-surface border border-border rounded-sm p-6 pb-24">
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <h2 className="text-base font-medium">Works ({works.length})</h2>
          {/* Select-mode toggle + select-all when active. The Bulk-edit
              prices button skips select-mode entirely — clicking opens
              the spreadsheet table with every work pre-loaded. */}
          {works.length > 0 && (
            <div className="flex items-center gap-2">
              {selectMode ? (
                <>
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-accent hover:text-accent-hover"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={exitSelectMode}
                    className="text-xs text-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectMode(true)}
                    className="text-xs text-stone-700 hover:text-foreground border border-border rounded-sm px-3 py-1.5"
                  >
                    Select multiple
                  </button>
                  <button
                    type="button"
                    onClick={openBulkPricesAll}
                    className="text-xs text-stone-700 hover:text-foreground border border-border rounded-sm px-3 py-1.5"
                  >
                    Bulk edit prices
                  </button>
                  <button
                    type="button"
                    onClick={openBulkAdd}
                    className="text-xs text-white bg-accent hover:bg-accent-hover border border-accent rounded-sm px-3 py-1.5"
                  >
                    + Bulk add works
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {works.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted mb-4">No works yet. Add your first piece to get started.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => openAdd()} className="text-sm text-accent hover:text-accent-hover transition-colors">
                + Add your first work
              </button>
              <span className="text-border">·</span>
              <button onClick={openBulkAdd} className="text-sm text-stone-700 hover:text-foreground transition-colors">
                Bulk add multiple
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted mb-3">
              Drag cards to reorder &mdash; the order here is what
              venues see on your public profile.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {works.map((work, index) => {
                const isDraggingSource =
                  reorderDrag?.fromIndex === index;
                const isDropTarget =
                  reorderDrag !== null &&
                  reorderDrag.overIndex === index &&
                  reorderDrag.fromIndex !== index;
                const isChecked = selectedIds.has(work.id);
                return (
                  <div
                    key={work.id}
                    // Drag-to-reorder is disabled in select mode so a
                    // click on a card reads cleanly as a selection
                    // toggle, not a drag start.
                    draggable={!selectMode}
                    onDragStart={(e) => {
                      if (selectMode) return;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", work.id);
                      setReorderDrag({ fromIndex: index, overIndex: null });
                    }}
                    onDragOver={(e) => {
                      if (selectMode || !reorderDrag) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (reorderDrag.overIndex !== index) {
                        setReorderDrag({ ...reorderDrag, overIndex: index });
                      }
                    }}
                    onDragEnd={() => setReorderDrag(null)}
                    onDrop={(e) => {
                      if (selectMode) return;
                      e.preventDefault();
                      if (!reorderDrag) return;
                      reorderWorks(reorderDrag.fromIndex, index);
                      setReorderDrag(null);
                    }}
                    onClick={() => {
                      if (selectMode) toggleSelected(work.id);
                    }}
                    className={`relative group rounded-sm overflow-hidden border transition-all ${
                      selectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
                    } ${
                      isDraggingSource
                        ? "border-border opacity-40"
                        : isDropTarget
                          ? "border-accent ring-2 ring-accent/40"
                          : isChecked
                            ? "border-accent ring-2 ring-accent/40"
                            : "border-border"
                    }`}
                    onMouseEnter={() => setHoveredWork(index)}
                    onMouseLeave={() => setHoveredWork(null)}
                  >
                    <div className="aspect-[4/3] relative bg-border/20">
                      <Image src={work.image} alt={work.title} fill className="object-cover" sizes="(max-width: 768px) 50vw, 33vw" />
                    </div>

                    {/* Checkbox in top-left when select mode is on. */}
                    {selectMode && (
                      <div
                        className="absolute top-2 left-2 z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelected(work.id);
                        }}
                      >
                        <span
                          className={`block w-5 h-5 rounded-sm border-2 flex items-center justify-center ${
                            isChecked
                              ? "bg-accent border-accent"
                              : "bg-white/95 border-white/95"
                          }`}
                        >
                          {isChecked && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 14 14"
                              fill="none"
                              stroke="white"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            >
                              <polyline points="2 7 5.5 10.5 12 3.5" />
                            </svg>
                          )}
                        </span>
                      </div>
                    )}

                    {/* Hover actions hidden in select mode — the click
                        target there belongs entirely to the checkbox. */}
                    {!selectMode &&
                      hoveredWork === index &&
                      reorderDrag === null && (
                      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 transition-opacity">
                        <button
                          onClick={() => openEdit(index)}
                          className="text-xs font-medium bg-white text-foreground px-4 py-1.5 rounded-sm hover:bg-background transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => duplicateFrom(index)}
                          className="text-xs font-medium bg-white/10 text-white border border-white/30 px-4 py-1.5 rounded-sm hover:bg-white/20 transition-colors"
                          title="Create a new artwork pre-filled with these size/price/medium details"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => { if (confirm("Remove this work?")) deleteWork(index); }}
                          className="text-xs text-white/60 hover:text-red-400 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    )}

                    <div className="p-3 border-t border-border">
                      <p className="text-xs font-medium text-foreground leading-snug truncate mb-1">{work.title}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted">{work.medium}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          work.available ? statusColors.Available : statusColors.Sold
                        }`}>
                          {work.available ? "Available" : "Sold"}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-1">{work.pricing.length} size{work.pricing.length !== 1 ? "s" : ""} from {work.priceBand.replace("From ", "")}</p>
                    </div>
                  </div>
                );
              })}
              {/* In-grid "+ Add new work" tile so the artist doesn't
                  have to scroll to the top to add another. Hidden in
                  select-mode where the focus is on the existing
                  selection. */}
              {!selectMode && (
                <button
                  type="button"
                  onClick={() => openAdd()}
                  className="aspect-square flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-sm text-muted hover:border-accent hover:text-accent hover:bg-accent/5 transition-colors"
                >
                  <span className="text-2xl leading-none">+</span>
                  <span className="text-xs font-medium">Add new work</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/*
       * Sticky bulk-action bar — Shopify-style. Appears at the bottom
       * of the viewport whenever ≥1 work is selected in select mode.
       * Stays out of the way otherwise, and the X dismisses without
       * clearing other selection state.
       */}
      {/* Target picker — sits just above the dark bulk-action toolbar
          and shows after the artist picks a source. Defaults targets
          to "everything currently selected, minus the source" so the
          common case (clone across the lot) is one click; deselecting
          anything that was intentionally priced differently is a
          checkbox tick away. */}
      {selectMode &&
        selectedIds.size > 0 &&
        bulkEditPendingSource &&
        bulkEditApplyKind && (
          <div className="fixed bottom-[64px] left-0 right-0 z-40 bg-white border-t border-border shadow-2xl">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
              <div className="flex flex-wrap items-center gap-3 mb-2 text-xs">
                <span className="font-medium text-foreground">
                  Apply {bulkEditApplyKind} from{" "}
                  <em className="font-serif italic">
                    {bulkEditPendingSource.title}
                  </em>{" "}
                  to:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setBulkEditTargetIds(
                      new Set(
                        works
                          .filter(
                            (w) =>
                              selectedIds.has(w.id) &&
                              w.id !== bulkEditPendingSource.id,
                          )
                          .map((w) => w.id),
                      ),
                    )
                  }
                  className="text-accent hover:text-accent-hover"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setBulkEditTargetIds(new Set())}
                  className="text-muted hover:text-foreground"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mb-3 max-h-32 overflow-y-auto">
                {works
                  .filter(
                    (w) =>
                      selectedIds.has(w.id) &&
                      w.id !== bulkEditPendingSource.id,
                  )
                  .map((w) => {
                    const checked = bulkEditTargetIds.has(w.id);
                    return (
                      <label
                        key={w.id}
                        className={`inline-flex items-center gap-2 px-2 py-1 rounded-sm border cursor-pointer text-xs ${
                          checked
                            ? "border-accent bg-white"
                            : "border-border bg-stone-50 text-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setBulkEditTargetIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(w.id);
                              else next.delete(w.id);
                              return next;
                            });
                          }}
                        />
                        <span className="relative w-5 h-5 rounded-sm overflow-hidden bg-border/30 shrink-0">
                          {w.image && (
                            <Image
                              src={w.image}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="20px"
                            />
                          )}
                        </span>
                        <span className="truncate max-w-[10rem]">{w.title}</span>
                      </label>
                    );
                  })}
                {works.filter(
                  (w) =>
                    selectedIds.has(w.id) && w.id !== bulkEditPendingSource.id,
                ).length === 0 && (
                  <span className="text-xs text-muted">
                    No other selected works to apply to.
                  </span>
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={bulkEditCancelApply}
                  className="text-xs text-muted hover:text-foreground px-2 py-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={bulkEditApplyToTargets}
                  disabled={bulkEditTargetIds.size === 0}
                  className="text-xs px-3 py-1 rounded-sm bg-foreground text-white hover:bg-foreground/90 disabled:opacity-40"
                >
                  Apply to {bulkEditTargetIds.size} work
                  {bulkEditTargetIds.size === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          </div>
        )}

      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-foreground text-white shadow-2xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium mr-2">
              {selectedIds.size} selected
            </p>
            <button
              type="button"
              onClick={() => bulkSetAvailability(true)}
              className="text-xs px-3 py-1.5 rounded-sm bg-white/10 hover:bg-white/20 transition-colors"
            >
              Mark available
            </button>
            <button
              type="button"
              onClick={() => bulkSetAvailability(false)}
              className="text-xs px-3 py-1.5 rounded-sm bg-white/10 hover:bg-white/20 transition-colors"
            >
              Mark sold
            </button>
            <button
              type="button"
              onClick={openBulkPrices}
              className="text-xs px-3 py-1.5 rounded-sm bg-white/10 hover:bg-white/20 transition-colors"
            >
              Edit sizes &amp; prices
            </button>
            {/* Two separate buttons — sizes and prices are independent
                operations. Picking a source kicks open the target
                picker (rendered as a panel above this toolbar) so the
                artist can deselect any work that's intentionally
                priced differently before applying. */}
            <CopyFromSourceButton
              label="Copy sizes from…"
              kind="sizes"
              // Treat the kind buttons as inactive while a source is
              // pending — the target picker panel takes over the
              // visual ownership at that point, and leaving the
              // dropdown open hid the Apply confirm button under it.
              activeKind={bulkEditPendingSource ? null : bulkEditApplyKind}
              works={works}
              excludeIds={
                bulkEditPendingSource
                  ? new Set([bulkEditPendingSource.id])
                  : new Set()
              }
              onToggleOpen={() => {
                setBulkEditApplyKind(
                  bulkEditApplyKind === "sizes" ? null : "sizes",
                );
                setBulkEditPendingSource(null);
              }}
              onPick={bulkEditPickSource}
            />
            <CopyFromSourceButton
              label="Copy prices from…"
              kind="prices"
              // Treat the kind buttons as inactive while a source is
              // pending — the target picker panel takes over the
              // visual ownership at that point, and leaving the
              // dropdown open hid the Apply confirm button under it.
              activeKind={bulkEditPendingSource ? null : bulkEditApplyKind}
              works={works}
              excludeIds={
                bulkEditPendingSource
                  ? new Set([bulkEditPendingSource.id])
                  : new Set()
              }
              onToggleOpen={() => {
                setBulkEditApplyKind(
                  bulkEditApplyKind === "prices" ? null : "prices",
                );
                setBulkEditPendingSource(null);
              }}
              onPick={bulkEditPickSource}
            />
            <button
              type="button"
              onClick={bulkDelete}
              className="text-xs px-3 py-1.5 rounded-sm bg-red-500/20 hover:bg-red-500/30 transition-colors text-red-200"
            >
              Delete
            </button>
            <span className="flex-1" />
            <button
              type="button"
              onClick={exitSelectMode}
              className="text-xs px-3 py-1.5 rounded-sm hover:bg-white/10 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/*
       * Spreadsheet-style bulk-price editor. Modal opens on top of the
       * bulk-action bar; rows scroll inside the modal when the list is
       * long. Each row is fully editable inline.
       */}
      {bulkPricesOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-prices-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setBulkPricesOpen(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-lg bg-white shadow-2xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4 shrink-0">
              <div>
                <h2
                  id="bulk-prices-title"
                  className="font-serif text-lg text-foreground"
                >
                  Edit sizes &amp; prices
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  {bulkPriceRows.length} row{bulkPriceRows.length === 1 ? "" : "s"} across {selectedIds.size} work{selectedIds.size === 1 ? "" : "s"}.
                  Edit a row, leave it blank to remove that size, or click <em>Add size</em> on a work.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkPricesOpen(false)}
                className="text-muted hover:text-foreground"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>

            {/* Selection toolbar — only shown when rows are highlighted.
                Lets the artist set a flat price for the selection or
                copy/paste prices to/from a spreadsheet (also Cmd+C/V).
                Sits above the table so it's always discoverable. */}
            {bulkPriceSelected.size > 0 && (
              <div className="px-5 py-2 border-b border-border bg-accent/5 text-xs flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">
                  {bulkPriceSelected.size} row
                  {bulkPriceSelected.size === 1 ? "" : "s"} selected
                </span>
                <span className="text-muted">·</span>
                <label className="flex items-center gap-1">
                  <span className="text-muted">Set price £</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={bulkPriceFillValue}
                    onChange={(e) => setBulkPriceFillValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") bulkPriceApplyFill();
                    }}
                    placeholder="0"
                    className="w-20 bg-white border border-border rounded-sm px-2 py-1 text-right tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={bulkPriceApplyFill}
                    disabled={!bulkPriceFillValue.trim()}
                    className="ml-1 px-2 py-1 rounded-sm bg-foreground text-white text-[11px] hover:bg-foreground/90 disabled:opacity-40"
                  >
                    Apply
                  </button>
                </label>
                <span className="text-muted">·</span>
                <button
                  type="button"
                  onClick={bulkPriceCopySelected}
                  className="px-2 py-1 rounded-sm bg-white border border-border hover:border-foreground/30"
                  title="Copy selected prices (⌘C)"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={bulkPricePasteIntoSelected}
                  className="px-2 py-1 rounded-sm bg-white border border-border hover:border-foreground/30"
                  title="Paste prices into selected rows (⌘V)"
                >
                  Paste
                </button>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => setBulkPriceSelected(new Set())}
                  className="text-muted hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Table */}
            <div className="overflow-y-auto flex-1 min-h-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-stone-50 border-b border-border text-xs text-muted uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        aria-label="Select all rows"
                        checked={
                          bulkPriceRows.length > 0 &&
                          bulkPriceSelected.size === bulkPriceRows.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            const all = new Set<number>();
                            for (let i = 0; i < bulkPriceRows.length; i++) all.add(i);
                            setBulkPriceSelected(all);
                          } else {
                            setBulkPriceSelected(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="text-left font-medium px-4 py-2 w-2/5">Work</th>
                    <th className="text-left font-medium px-4 py-2">Size label</th>
                    <th className="text-right font-medium px-4 py-2 w-32">Price (£)</th>
                    <th className="px-2 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {bulkPriceRows.map((row, idx) => {
                    // Row groups: only show the work title + thumb on the
                    // first row for that work, so the table doesn't repeat
                    // and the visual scan is easier.
                    const prev = idx > 0 ? bulkPriceRows[idx - 1] : null;
                    const startsGroup = !prev || prev.workId !== row.workId;
                    const isSelected = bulkPriceSelected.has(idx);
                    return (
                      <tr
                        key={`${row.workId}-${row.sizeIndex}-${idx}`}
                        className={`border-b border-border/60 ${startsGroup ? "" : "border-t-0"} ${
                          isSelected ? "bg-accent/8" : ""
                        }`}
                      >
                        <td className="px-3 py-2 align-middle">
                          <input
                            type="checkbox"
                            aria-label={`Select row ${idx + 1}`}
                            checked={isSelected}
                            onChange={() => {
                              setBulkPriceSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(idx)) next.delete(idx);
                                else next.add(idx);
                                return next;
                              });
                              bulkPriceAnchorRef.current = idx;
                            }}
                            onClick={(e) => {
                              // Shift-click on the checkbox extends the
                              // range from the anchor — same behaviour
                              // as clicking the row body.
                              if (e.shiftKey) {
                                e.preventDefault();
                                bulkPriceClickRow(idx, e);
                              }
                            }}
                          />
                        </td>
                        <td
                          className="px-4 py-2 align-middle cursor-pointer select-none"
                          onClick={(e) => bulkPriceClickRow(idx, e)}
                        >
                          {startsGroup ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="relative w-8 h-8 rounded-sm overflow-hidden bg-border/30 shrink-0">
                                {row.workImage && (
                                  <Image
                                    src={row.workImage}
                                    alt=""
                                    fill
                                    className="object-cover"
                                    sizes="32px"
                                  />
                                )}
                              </div>
                              <span className="truncate text-foreground">{row.workTitle}</span>
                            </div>
                          ) : (
                            <span className="text-stone-300">↳</span>
                          )}
                        </td>
                        <td className="px-4 py-2 align-middle">
                          <input
                            type="text"
                            value={row.label}
                            onChange={(e) =>
                              setBulkPriceRows((rows) => {
                                const next = [...rows];
                                next[idx] = { ...next[idx], label: e.target.value };
                                return next;
                              })
                            }
                            placeholder='e.g. 12×16" (30×40 cm)'
                            className="w-full bg-background border border-border rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:border-accent/60"
                          />
                        </td>
                        <td className="px-4 py-2 align-middle">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={row.price || ""}
                            onChange={(e) =>
                              setBulkPriceRows((rows) => {
                                const next = [...rows];
                                next[idx] = {
                                  ...next[idx],
                                  price: e.target.value === "" ? 0 : Number(e.target.value),
                                };
                                return next;
                              })
                            }
                            placeholder="0"
                            className="w-full bg-background border border-border rounded-sm px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-accent/60"
                          />
                        </td>
                        <td className="px-2 py-2 align-middle text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setBulkPriceRows((rows) => rows.filter((_, i) => i !== idx))
                            }
                            className="w-7 h-7 inline-flex items-center justify-center text-muted hover:text-red-500 transition-colors"
                            aria-label="Remove size"
                            title="Remove size"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <path d="M3 3l8 8M11 3L3 11" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* "Add size" buttons grouped by work — one per selected
                  work, placed below the table so the artist can extend
                  any work's size list inline. */}
              <div className="px-4 py-3 border-t border-border bg-stone-50/60 space-y-1.5">
                {Array.from(selectedIds).map((id) => {
                  const w = works.find((x) => x.id === id);
                  if (!w) return null;
                  return (
                    <div key={id} className="flex items-center gap-2 text-xs">
                      <span className="text-muted truncate">+ Add size to</span>
                      <span className="font-medium text-foreground truncate">{w.title}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkPriceRows((rows) => [
                            ...rows,
                            {
                              workId: w.id,
                              workTitle: w.title,
                              workImage: w.image,
                              sizeIndex: rows.filter((r) => r.workId === w.id).length,
                              label: "",
                              price: 0,
                              isNew: true,
                            },
                          ]);
                        }}
                        className="text-accent hover:text-accent-hover"
                      >
                        Add size
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setBulkPricesOpen(false)}
                className="text-sm text-muted hover:text-foreground px-3 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveBulkPrices}
                className="px-4 py-2 rounded-sm bg-foreground text-white text-sm font-medium hover:bg-foreground/90"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
       * Bulk-add modal — drop multiple images, edit each draft side
       * by side, optionally clone sizes/prices across the lot, then
       * Save All to push them to the works table in one go.
       */}
      {bulkAddOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-add-title"
          // pt-20 leaves clearance for the artist-portal sticky nav
          // (and the global header above it) so the modal's title +
          // image dropzone aren't hidden behind it. Without the
          // explicit top inset the modal centred to viewport-mid
          // and on shorter screens the upper edge sat under the
          // bar — clicking the dropzone still worked but the artist
          // couldn't actually see what they were dropping into.
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm pt-20 sm:pt-24 pb-4 px-4 overflow-y-auto"
          onClick={() => !bulkAddSaving && setBulkAddOpen(false)}
        >
          <div
            className="w-full max-w-5xl max-h-[calc(100vh-7rem)] sm:max-h-[calc(100vh-8rem)] flex flex-col rounded-lg bg-white shadow-2xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4 shrink-0">
              <div>
                <h2 id="bulk-add-title" className="font-serif text-lg text-foreground">
                  Bulk add artworks
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Drop multiple images at once, edit each one&apos;s
                  title and sizes side by side, then save them all in
                  one go.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !bulkAddSaving && setBulkAddOpen(false)}
                className="text-muted hover:text-foreground"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>

            {/* Toolbar */}
            {bulkAddDrafts.length > 0 && (
              <div className="px-5 py-2 border-b border-border bg-stone-50 flex flex-wrap items-center gap-3 text-xs">
                <span className="text-muted">
                  {bulkAddDrafts.length} draft{bulkAddDrafts.length === 1 ? "" : "s"}
                </span>
                <span className="text-border">·</span>
                {/*
                 * Two pickers: Copy SIZES from / Copy PRICES from.
                 * Both share the same source list (other drafts +
                 * existing works) but apply differently — sizes
                 * overwrites the size labels, prices fills in £
                 * values for matching size labels. Whichever button
                 * the artist clicks sets `bulkAddApplyKind`, then
                 * picking a source opens the target-selector.
                 */}
                <CopyFromButton
                  label="Copy sizes from…"
                  // Hide the source list once a source has been
                  // picked — the target picker that appears below
                  // covers the same screen real estate, and leaving
                  // the dropdown open hid the "Apply to N drafts"
                  // confirm button under it.
                  open={
                    bulkAddApplyKind === "sizes" && !bulkAddPendingSource
                  }
                  onOpen={() => {
                    setBulkAddApplyKind(
                      bulkAddApplyKind === "sizes" ? null : "sizes",
                    );
                    setBulkAddPendingSource(null);
                  }}
                  drafts={bulkAddDrafts}
                  works={works}
                  onPick={bulkAddPickSource}
                />
                <CopyFromButton
                  label="Copy prices from…"
                  open={
                    bulkAddApplyKind === "prices" && !bulkAddPendingSource
                  }
                  onOpen={() => {
                    setBulkAddApplyKind(
                      bulkAddApplyKind === "prices" ? null : "prices",
                    );
                    setBulkAddPendingSource(null);
                  }}
                  drafts={bulkAddDrafts}
                  works={works}
                  onPick={bulkAddPickSource}
                />
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => bulkAddInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-sm border border-border hover:border-foreground/30"
                >
                  + Add more images
                </button>
              </div>
            )}

            {/* Target picker — appears once a source is chosen, asks
                the artist which drafts to apply to. Defaults to all
                drafts (excluding the source if it's a draft). */}
            {bulkAddPendingSource && bulkAddApplyKind && (
              <div className="px-5 py-3 border-b border-border bg-accent/5 text-xs">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span className="font-medium text-foreground">
                    Apply {bulkAddApplyKind} from{" "}
                    <em className="font-serif italic">
                      {bulkAddPendingSource.label}
                    </em>{" "}
                    to:
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setBulkAddTargetIds(
                        new Set(bulkAddDrafts.map((d) => d.draftId)),
                      )
                    }
                    className="text-accent hover:text-accent-hover"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkAddTargetIds(new Set())}
                    className="text-muted hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {bulkAddDrafts.map((d) => {
                    const checked = bulkAddTargetIds.has(d.draftId);
                    return (
                      <label
                        key={d.draftId}
                        className={`inline-flex items-center gap-2 px-2 py-1 rounded-sm border cursor-pointer ${
                          checked
                            ? "border-accent bg-white"
                            : "border-border bg-stone-50 text-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setBulkAddTargetIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(d.draftId);
                              else next.delete(d.draftId);
                              return next;
                            });
                          }}
                        />
                        <span className="relative w-5 h-5 rounded-sm overflow-hidden bg-border/30 shrink-0">
                          {d.imagePreview && (
                            <Image src={d.imagePreview} alt="" fill className="object-cover" sizes="20px" />
                          )}
                        </span>
                        <span className="truncate max-w-[10rem]">
                          {d.title || "(untitled)"}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={bulkAddCancelApply}
                    className="text-muted hover:text-foreground px-2 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={bulkAddApplyToTargets}
                    disabled={bulkAddTargetIds.size === 0}
                    className="px-3 py-1 rounded-sm bg-foreground text-white text-[11px] hover:bg-foreground/90 disabled:opacity-40"
                  >
                    Apply to {bulkAddTargetIds.size} draft
                    {bulkAddTargetIds.size === 1 ? "" : "s"}
                  </button>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="overflow-y-auto flex-1 min-h-0 p-5">
              <input
                ref={bulkAddInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) bulkAddFiles(files);
                  if (e.target) e.target.value = "";
                }}
              />

              {bulkAddDrafts.length === 0 ? (
                <button
                  type="button"
                  onClick={() => bulkAddInputRef.current?.click()}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types?.includes("Files")) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      if (!bulkAddDragOver) setBulkAddDragOver(true);
                    }
                  }}
                  onDragLeave={() => setBulkAddDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setBulkAddDragOver(false);
                    const files = Array.from(e.dataTransfer.files ?? []);
                    if (files.length > 0) bulkAddFiles(files);
                  }}
                  className={`w-full rounded-lg border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-3 py-24 ${
                    bulkAddDragOver
                      ? "border-accent bg-accent/10"
                      : "border-border bg-stone-50 hover:border-accent hover:bg-accent/5"
                  }`}
                >
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-stone-400">
                    <path d="M12 4v12M6 10l6-6 6 6" strokeLinecap="round" />
                    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" />
                  </svg>
                  <p className="text-base font-medium text-foreground">
                    {bulkAddDragOver ? "Drop to upload" : "Drop multiple images here"}
                  </p>
                  <p className="text-xs text-muted">
                    or click to choose. JPG, PNG, or WebP — each becomes a draft you can edit before saving.
                  </p>
                </button>
              ) : (
                <div
                  className={`grid gap-4 ${
                    bulkAddDragOver ? "ring-2 ring-accent/40 rounded-md p-2 bg-accent/5" : ""
                  }`}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types?.includes("Files")) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      if (!bulkAddDragOver) setBulkAddDragOver(true);
                    }
                  }}
                  onDragLeave={() => setBulkAddDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setBulkAddDragOver(false);
                    const files = Array.from(e.dataTransfer.files ?? []);
                    if (files.length > 0) bulkAddFiles(files);
                  }}
                >
                  {bulkAddDrafts.map((draft) => (
                    <BulkAddDraftCard
                      key={draft.draftId}
                      draft={draft}
                      onChange={(patch) => bulkAddUpdateDraft(draft.draftId, patch)}
                      onRemove={() => bulkAddRemoveDraft(draft.draftId)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3 shrink-0">
              <p className="text-xs text-muted">
                {bulkAddDrafts.filter((d) => d.imageUrl && d.title.trim() && d.sizes.some((s) => s.label && s.price > 0)).length}
                {" / "}
                {bulkAddDrafts.length} ready to save
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => !bulkAddSaving && setBulkAddOpen(false)}
                  disabled={bulkAddSaving}
                  className="text-sm text-muted hover:text-foreground px-3 py-2 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={bulkAddSaveAll}
                  disabled={bulkAddSaving || bulkAddDrafts.length === 0}
                  className="px-4 py-2 rounded-sm bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
                >
                  {bulkAddSaving ? "Saving…" : `Save ${bulkAddDrafts.length} work${bulkAddDrafts.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ArtistPortalLayout>
  );
}

// ── Bulk-add draft card ─────────────────────────────────────────────

/**
 * Side-by-side editor card for a single bulk-add draft. The card is
 * intentionally lean — title + sizes table + available toggle. Anything
 * the artist wants to fine-tune (medium, description, framing options,
 * shipping override) can be set after saving via the regular Edit Work
 * flow.
 *
 * "Suggest sizes" re-runs the aspect-ratio-based suggestion against
 * the image so the artist can wipe whatever's there and start from
 * the recommended set if they typed dimensions and want fresh sizes.
 */
function BulkAddDraftCard({
  draft,
  onChange,
  onRemove,
}: {
  draft: BulkAddDraft;
  onChange: (patch: Partial<BulkAddDraft>) => void;
  onRemove: () => void;
}) {
  function suggestSizesFromDraft() {
    // Use the orientation as a proxy ratio when we don't have the
    // exact pixel dimensions on hand any more (the file blob is gone
    // after upload). 1.33 / 1 / 0.75 are reasonable defaults that
    // produce sensible cm values.
    const ratio =
      draft.orientation === "landscape"
        ? 1.33
        : draft.orientation === "portrait"
          ? 0.75
          : 1.0;
    const suggested = getSuggestedSizes(ratio);
    if (suggested.length === 0) return;
    onChange({
      sizes: suggested.map((s) => ({ label: s.label, price: 0 })),
    });
  }

  return (
    <div className="border border-border rounded-md bg-background overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-0">
        {/* Image side */}
        <div className="relative bg-stone-100 aspect-square sm:aspect-auto sm:min-h-[180px]">
          {draft.imagePreview ? (
            <Image
              src={draft.imagePreview}
              alt=""
              fill
              className="object-cover"
              sizes="180px"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-xs text-muted">
              No image
            </div>
          )}
          {draft.uploading && (
            <div className="absolute inset-0 grid place-items-center bg-black/40 text-white text-xs">
              Uploading…
            </div>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white text-xs hover:bg-red-600"
            aria-label="Remove draft"
            title="Remove from bulk add"
          >
            ×
          </button>
        </div>

        {/* Form side */}
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-muted mb-1">Title</label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="e.g. Last Light on Mare Street"
              className="w-full bg-background border border-border rounded-sm px-3 py-1.5 text-sm focus:outline-none focus:border-accent/60"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-muted mb-1">Dimensions</label>
              <input
                type="text"
                value={draft.dimensions}
                onChange={(e) => onChange({ dimensions: e.target.value })}
                placeholder="e.g. 50 × 70 cm"
                className="w-full bg-background border border-border rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:border-accent/60"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted mb-1">Orientation</label>
              <select
                value={draft.orientation}
                onChange={(e) =>
                  onChange({
                    orientation: e.target.value as
                      | "landscape"
                      | "portrait"
                      | "square",
                  })
                }
                className="wp-select w-full bg-background border border-border rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:border-accent/60"
              >
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
                <option value="square">Square</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-medium text-muted">Sizes &amp; prices</label>
              <button
                type="button"
                onClick={suggestSizesFromDraft}
                className="text-[11px] text-accent hover:text-accent-hover"
                title="Replace the size list with sizes suggested by the image's orientation"
              >
                Suggest sizes
              </button>
            </div>
            <div className="space-y-1.5">
              {draft.sizes.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={s.label}
                    onChange={(e) => {
                      const next = [...draft.sizes];
                      next[i] = { ...next[i], label: e.target.value };
                      onChange({ sizes: next });
                    }}
                    placeholder='e.g. 12×16" (30×40 cm)'
                    className="flex-1 bg-background border border-border rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:border-accent/60"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-muted">£</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={s.price || ""}
                      onChange={(e) => {
                        const next = [...draft.sizes];
                        next[i] = {
                          ...next[i],
                          price: e.target.value === "" ? 0 : Number(e.target.value),
                        };
                        onChange({ sizes: next });
                      }}
                      placeholder="0"
                      className="w-20 bg-background border border-border rounded-sm px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-accent/60"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      // Keep all parallel arrays in sync when removing a row.
                      const nextSizes = draft.sizes.filter((_, j) => j !== i);
                      const nextShipping = draft.shippingPrices.filter((_, j) => j !== i);
                      const nextInStore = draft.inStorePrices.filter((_, j) => j !== i);
                      onChange({
                        sizes: nextSizes.length > 0 ? nextSizes : [{ label: "", price: 0 }],
                        shippingPrices: nextShipping.length > 0 ? nextShipping : [""],
                        inStorePrices: nextInStore.length > 0 ? nextInStore : [""],
                      });
                    }}
                    className="w-7 h-7 inline-flex items-center justify-center text-muted hover:text-red-500"
                    aria-label="Remove size"
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    sizes: [...draft.sizes, { label: "", price: 0 }],
                    shippingPrices: [...draft.shippingPrices, ""],
                    inStorePrices: [...draft.inStorePrices, ""],
                  })
                }
                className="text-[11px] text-accent hover:text-accent-hover"
              >
                + Add size
              </button>
            </div>
          </div>

          {/* Per-size shipping (optional, collapsed by default) */}
          <CollapsibleRow
            label="Shipping per size"
            open={draft.showShipping}
            onToggle={() => onChange({ showShipping: !draft.showShipping })}
          >
            <div className="space-y-1.5">
              {draft.sizes.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-[11px] text-muted truncate">
                    {s.label || `(size ${i + 1})`}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-muted">£</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={draft.shippingPrices[i] ?? ""}
                      onChange={(e) => {
                        const next = [...draft.shippingPrices];
                        // Pad to length if a row got out of sync.
                        while (next.length < draft.sizes.length) next.push("");
                        next[i] = e.target.value;
                        onChange({ shippingPrices: next });
                      }}
                      placeholder="0"
                      className="w-20 bg-background border border-border rounded-sm px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-accent/60"
                    />
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-muted leading-snug">
                Each size persists its own shipping price. Leave a row
                blank to fall back to the work-level shipping default.
              </p>
            </div>
          </CollapsibleRow>

          {/* Per-size in-store / pickup price (optional). */}
          <CollapsibleRow
            label="In-store / pickup prices"
            open={draft.showInStore}
            onToggle={() => onChange({ showInStore: !draft.showInStore })}
          >
            <div className="space-y-1.5">
              {draft.sizes.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-[11px] text-muted truncate">
                    {s.label || `(size ${i + 1})`}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-muted">£</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={draft.inStorePrices[i] ?? ""}
                      onChange={(e) => {
                        const next = [...draft.inStorePrices];
                        while (next.length < draft.sizes.length) next.push("");
                        next[i] = e.target.value;
                        onChange({ inStorePrices: next });
                      }}
                      placeholder="0"
                      className="w-20 bg-background border border-border rounded-sm px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-accent/60"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleRow>

          {/* Frame options (work-level — applies to all sizes). */}
          <CollapsibleRow
            label="Frame options"
            open={draft.showFrames}
            onToggle={() => onChange({ showFrames: !draft.showFrames })}
          >
            <div className="space-y-1.5">
              {draft.frameOptions.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={f.label}
                    onChange={(e) => {
                      const next = [...draft.frameOptions];
                      next[i] = { ...next[i], label: e.target.value };
                      onChange({ frameOptions: next });
                    }}
                    placeholder="e.g. Black oak frame"
                    className="flex-1 bg-background border border-border rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:border-accent/60"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-muted">+£</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={f.priceUplift}
                      onChange={(e) => {
                        const next = [...draft.frameOptions];
                        next[i] = { ...next[i], priceUplift: e.target.value };
                        onChange({ frameOptions: next });
                      }}
                      placeholder="0"
                      className="w-20 bg-background border border-border rounded-sm px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-accent/60"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        frameOptions: draft.frameOptions.filter((_, j) => j !== i),
                      })
                    }
                    className="w-7 h-7 inline-flex items-center justify-center text-muted hover:text-red-500"
                    aria-label="Remove frame option"
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    frameOptions: [
                      ...draft.frameOptions,
                      { label: "", priceUplift: "" },
                    ],
                  })
                }
                className="text-[11px] text-accent hover:text-accent-hover"
              >
                + Add frame option
              </button>
              <p className="text-[10px] text-muted leading-snug">
                Frames apply across all sizes — true per-size frames
                aren&apos;t in the data model yet.
              </p>
            </div>
          </CollapsibleRow>

          <div className="flex items-center gap-2 pt-1">
            <input
              id={`avail-${draft.draftId}`}
              type="checkbox"
              checked={draft.available}
              onChange={(e) => onChange({ available: e.target.checked })}
            />
            <label htmlFor={`avail-${draft.draftId}`} className="text-xs text-foreground">
              Available
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Disclosure-style row for the bulk-add card. Header is the label +
 * a chevron; click toggles. Keeps the card lean by default — most
 * artists won't bother setting per-size shipping or frames in bulk
 * add, so collapsing them keeps the form scannable.
 */
function CollapsibleRow({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border/50 pt-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between text-left text-[11px] font-medium text-muted hover:text-foreground transition-colors"
      >
        <span>{label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

/**
 * "Copy <kind> from…" picker button used in the bulk-add toolbar.
 * Lists in-flight drafts (above the divider) and existing saved
 * works (below). Clicking an entry sets it as the pending source —
 * the parent then opens the target-selector to pick which drafts
 * to apply to.
 */
function CopyFromButton({
  label,
  open,
  onOpen,
  drafts,
  works,
  onPick,
}: {
  label: string;
  open: boolean;
  onOpen: () => void;
  drafts: BulkAddDraft[];
  works: ArtistWork[];
  // Optional `shipping` array is index-aligned with `sizes`. Each
  // entry is the source row's shipping price as a number, or null
  // where the source had none. Lets the parent's "Copy prices"
  // path bring per-size shipping along too.
  onPick: (
    label: string,
    sizes: SizeEntry[],
    shipping?: Array<number | null>,
  ) => void;
}) {
  const draftsWithSizes = drafts.filter((d) =>
    d.sizes.some((s) => s.label && s.price > 0),
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        className={`px-3 py-1.5 rounded-sm border transition-colors ${
          open
            ? "border-accent text-accent"
            : "border-border hover:border-foreground/30"
        }`}
      >
        {label} ▾
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute top-full mt-1 left-0 max-h-72 w-80 overflow-y-auto rounded-sm bg-white text-foreground shadow-xl border border-border z-10"
        >
          {draftsWithSizes.map((d) => (
            <li key={d.draftId}>
              <button
                type="button"
                onClick={() =>
                  onPick(
                    d.title || "(untitled draft)",
                    d.sizes,
                    d.sizes.map((_, i) => {
                      const v = d.shippingPrices[i];
                      if (!v || !v.trim()) return null;
                      const n = parseFloat(v);
                      return Number.isFinite(n) && n >= 0 ? n : null;
                    }),
                  )
                }
                className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 flex items-center gap-2"
              >
                <span className="relative w-7 h-7 rounded-sm overflow-hidden bg-border/30 shrink-0">
                  {d.imagePreview && (
                    <Image src={d.imagePreview} alt="" fill className="object-cover" sizes="28px" />
                  )}
                </span>
                <span className="truncate font-medium flex-1">
                  {d.title || "(untitled draft)"}
                </span>
                <span className="text-stone-400 shrink-0">
                  {d.sizes.filter((s) => s.price > 0).length} size
                  {d.sizes.filter((s) => s.price > 0).length === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
          {works.map((source) => (
            <li key={source.id}>
              <button
                type="button"
                onClick={() =>
                  onPick(
                    source.title,
                    source.pricing.map((p) => ({
                      label: p.label,
                      price: p.price,
                    })),
                    source.pricing.map((p) =>
                      typeof p.shippingPrice === "number"
                        ? p.shippingPrice
                        : null,
                    ),
                  )
                }
                className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 flex items-center gap-2 border-t border-border/50"
              >
                <span className="relative w-7 h-7 rounded-sm overflow-hidden bg-border/30 shrink-0">
                  <Image src={source.image} alt="" fill className="object-cover" sizes="28px" />
                </span>
                <span className="truncate font-medium flex-1">{source.title}</span>
                <span className="text-stone-400 shrink-0">
                  {source.pricing.length} size
                  {source.pricing.length === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
          {draftsWithSizes.length === 0 && works.length === 0 && (
            <li className="px-3 py-2 text-xs text-stone-400">
              Set prices on a draft first, or save an existing work to copy from.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Source-picker button for the bulk-edit toolbar. Two of these
 * render side-by-side in the dark sticky toolbar — one for "Copy
 * sizes from…" and one for "Copy prices from…". Picking a source
 * here calls `onPick(source)` which kicks open the target picker
 * panel above the toolbar (rendered separately, not by this
 * component).
 *
 * Different from `CopyFromButton` above: that one is for the
 * bulk-add modal where sources are mostly drafts (BulkAddDraft) and
 * targets are sibling drafts. This one is for the bulk-edit
 * toolbar where sources are existing ArtistWork rows and targets
 * are other selected works on the page. Keeping them separate
 * avoids dragging draft-specific shape constraints into the edit
 * flow and vice versa.
 */
function CopyFromSourceButton({
  label,
  kind,
  activeKind,
  works,
  excludeIds,
  onToggleOpen,
  onPick,
}: {
  label: string;
  kind: "sizes" | "prices";
  activeKind: "sizes" | "prices" | null;
  works: ArtistWork[];
  excludeIds: Set<string>;
  onToggleOpen: () => void;
  onPick: (source: ArtistWork) => void;
}) {
  const isOpen = activeKind === kind;
  // Only show works that have at least one priced size — copying from
  // a work with empty pricing leaves the target with zeros, which
  // confuses the artist far more than just hiding empty sources.
  const candidates = works.filter(
    (w) =>
      !excludeIds.has(w.id) &&
      w.pricing.some((p) => p.label && p.price > 0),
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggleOpen}
        className={`text-xs px-3 py-1.5 rounded-sm transition-colors ${
          isOpen
            ? "bg-white text-foreground"
            : "bg-white/10 hover:bg-white/20 text-white"
        }`}
      >
        {label} ▾
      </button>
      {isOpen && (
        <ul
          role="listbox"
          className="absolute bottom-full mb-2 left-0 max-h-72 w-80 overflow-y-auto rounded-sm bg-white text-foreground shadow-xl border border-border"
        >
          {candidates.map((source) => (
            <li key={source.id}>
              <button
                type="button"
                onClick={() => onPick(source)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 flex items-center gap-2"
              >
                <span className="relative w-7 h-7 rounded-sm overflow-hidden bg-border/30 shrink-0">
                  {source.image && (
                    <Image
                      src={source.image}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="28px"
                    />
                  )}
                </span>
                <span className="truncate font-medium flex-1">
                  {source.title}
                </span>
                <span className="text-stone-400 shrink-0">
                  {source.pricing.length} size
                  {source.pricing.length === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
          {candidates.length === 0 && (
            <li className="px-3 py-2 text-xs text-stone-400">
              No other works with pricing to copy from.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Compact two-button picker that lives inside the Add/Edit work form
 * next to the size table header. Each button toggles a small popover
 * listing the artist's other works; picking one calls `onPick` which
 * mutates the open form. Surfaces the same Copy-from affordance the
 * bulk-add modal already has, just for the single-form flow.
 *
 * Why a separate component (vs. reusing CopyFromSourceButton):
 *   - That one styles for the dark sticky bulk-edit toolbar (white
 *     text on transparent bg). This one needs the lighter accent
 *     style to fit the form chrome.
 *   - This one only takes ArtistWork sources (no drafts), so the
 *     dropdown is simpler.
 */
function FormCopyFromPicker({
  works,
  activeKind,
  onToggleOpen,
  onPick,
}: {
  works: ArtistWork[];
  activeKind: "sizes" | "prices" | null;
  onToggleOpen: (k: "sizes" | "prices") => void;
  onPick: (source: ArtistWork, kind: "sizes" | "prices") => void;
}) {
  const candidates = works.filter((w) =>
    w.pricing.some((p) => p.label && p.price > 0),
  );
  if (candidates.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {(["sizes", "prices"] as const).map((kind) => (
        <div key={kind} className="relative">
          <button
            type="button"
            onClick={() => onToggleOpen(kind)}
            className={`text-xs transition-colors ${
              activeKind === kind
                ? "text-foreground"
                : "text-accent hover:text-accent-hover"
            }`}
          >
            Copy {kind} from… ▾
          </button>
          {activeKind === kind && (
            <ul
              role="listbox"
              className="absolute right-0 top-full mt-1 max-h-72 w-72 overflow-y-auto rounded-sm bg-white text-foreground shadow-xl border border-border z-30"
            >
              {candidates.map((source) => (
                <li key={source.id}>
                  <button
                    type="button"
                    onClick={() => onPick(source, kind)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 flex items-center gap-2"
                  >
                    <span className="relative w-7 h-7 rounded-sm overflow-hidden bg-border/30 shrink-0">
                      {source.image && (
                        <Image
                          src={source.image}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="28px"
                        />
                      )}
                    </span>
                    <span className="truncate font-medium flex-1">
                      {source.title}
                    </span>
                    <span className="text-stone-400 shrink-0">
                      {source.pricing.length} size
                      {source.pricing.length === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
