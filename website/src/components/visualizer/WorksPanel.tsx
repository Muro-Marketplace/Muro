"use client";

/**
 * WorksPanel, left-side rail in the editor showing placeable works.
 *
 * Presentational only, the parent owns the data lifecycle. This makes
 * it easy for the parent to keep its own `workById` map for image
 * lookups inside the canvas.
 *
 * Sections (venue_my_walls mode only):
 *   - My Works  , works currently on display at the venue (auto from
 *                  active placements).
 *   - Saved     , works the venue has bookmarked (saved_items).
 *   - All       , gallery feed (everything else).
 *
 * For non-venue modes (artist_*, customer_artwork_page) the panel
 * shows a single flat list.
 *
 * The panel emits two interactions:
 *   - onSelect(work)            user clicked a thumbnail (parent decides
 *                               whether to add to the wall)
 *   - drag with type
 *     "application/x-wallplace-work" carrying the work id, so the canvas
 *     can place at drop coordinates.
 */

import { useMemo, useRef, useState } from "react";
import type {
  SizeVariant,
  WorkOrientation,
} from "@/lib/visualizer/dimensions";
import type { VisualizerMode } from "@/lib/visualizer/types";
import { formatDimensionsForDisplay } from "@/lib/format-dimensions";
import ImageWithFallback from "@/components/ImageWithFallback";

export interface PanelWork {
  id: string;
  title: string;
  imageUrl: string;
  artistName?: string;
  /** Original dimension label as listed on the site (e.g. "70 x 50 cm"). */
  dimensions?: string;
  /** Parsed cm for the natural size, if `dimensions` could be parsed. */
  widthCm?: number;
  heightCm?: number;
  /** All listed size variants (parsed from the work's pricing array). */
  sizes?: SizeVariant[];
  /** Intended orientation, used to align the picked size to the
   *  artwork's actual rotation when pricing labels disagree. */
  orientation?: WorkOrientation;
}

type Tab = "my" | "saved" | "all";

interface Props {
  mode: VisualizerMode;
  /** For non-venue modes, single flat list. */
  works?: PanelWork[];

  /** Venue mode, three sections. */
  myWorks?: PanelWork[];
  savedWorks?: PanelWork[];
  allWorks?: PanelWork[];

  loading?: boolean;
  error?: string | null;
  onSelect?: (work: PanelWork) => void;
}

export default function WorksPanel({
  mode,
  works,
  myWorks,
  savedWorks,
  allWorks,
  loading,
  error,
  onSelect,
}: Props) {
  const [filter, setFilter] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("my");
  // Lazy-load works in batches of 20. Venues with hundreds of saved
  // works in the All tab were paying a layout-thrash + image-decode
  // cost up front for content they'd never scroll through. The
  // counter resets when the tab or the search filter changes so
  // every list view starts at 20 fresh.
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const isVenueMode = mode === "venue_my_walls";

  // Resolve which list to show based on mode + tab.
  const list = useMemo<PanelWork[]>(() => {
    if (!isVenueMode) return works ?? [];
    if (activeTab === "my") return myWorks ?? [];
    if (activeTab === "saved") return savedWorks ?? [];
    return allWorks ?? [];
  }, [isVenueMode, works, myWorks, savedWorks, allWorks, activeTab]);

  const filtered = filter.trim()
    ? list.filter((w) =>
        (w.title + " " + (w.artistName ?? ""))
          .toLowerCase()
          .includes(filter.toLowerCase()),
      )
    : list;

  // Reset the lazy-load window whenever the underlying list changes
  // (tab switch, search input). useEffect would also work but
  // computing the slice + reset in a single render keeps things
  // simple and the count never lags by a frame.
  const filteredKey = `${activeTab}|${filter}|${filtered.length}`;
  const lastKeyRef = useRef(filteredKey);
  if (lastKeyRef.current !== filteredKey) {
    lastKeyRef.current = filteredKey;
    if (visibleCount !== PAGE_SIZE) setVisibleCount(PAGE_SIZE);
  }
  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  return (
    <aside className="h-full w-60 shrink-0 border-r border-black/5 bg-white/60 backdrop-blur flex flex-col">
      <div className="px-3 py-3 border-b border-black/5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-2">
          {isVenueMode
            ? "Works"
            : mode === "customer_artwork_page"
              ? "This artwork"
              : "Your works"}
        </p>

        {isVenueMode && (
          <div
            role="tablist"
            aria-label="Works source"
            className="flex items-center gap-0.5 mb-2 -mx-0.5"
          >
            <TabButton
              active={activeTab === "my"}
              onClick={() => setActiveTab("my")}
              label="My"
              count={myWorks?.length ?? 0}
              hint="Currently on display"
            />
            <TabButton
              active={activeTab === "saved"}
              onClick={() => setActiveTab("saved")}
              label="Saved"
              count={savedWorks?.length ?? 0}
              hint="Bookmarked artworks"
            />
            <TabButton
              active={activeTab === "all"}
              onClick={() => setActiveTab("all")}
              label="All"
              count={allWorks?.length ?? 0}
              hint="Gallery feed"
            />
          </div>
        )}

        {/* Hide the search box entirely when there's nothing to
            search through, the customer "view on a wall" mode locks
            to a single artwork, so a search field is just dead UI
            (was already disabled, but disabled empty inputs read as
            broken). */}
        {list.length > 1 && (
          <input
            type="search"
            placeholder="Search…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded border border-black/10 focus:border-black/30 focus:outline-none bg-white"
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && <p className="text-xs text-stone-400 px-2 py-3">Loading…</p>}
        {error && (
          <p className="text-xs text-red-600 px-2 py-3">
            Couldn&apos;t load works.
          </p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <EmptyTab tab={isVenueMode ? activeTab : null} mode={mode} />
        )}

        <ul className="grid grid-cols-2 gap-2">
          {visible.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                draggable
                onClick={() => onSelect?.(w)}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-wallplace-work", w.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="group block w-full text-left rounded overflow-hidden border border-black/5 bg-white hover:border-black/20 transition cursor-grab active:cursor-grabbing"
                title={dragHint(w)}
              >
                <ImageWithFallback
                  src={w.imageUrl}
                  alt={w.title}
                  className="block w-full aspect-square object-cover"
                  placeholderClassName="block w-full aspect-square bg-accent/10 text-accent flex items-center justify-center text-xl font-medium"
                />
                <div className="px-2 py-1.5">
                  <p className="text-[11px] font-medium text-stone-800 truncate">
                    {w.title}
                  </p>
                  {w.dimensions && (
                    <p className="text-[10px] text-stone-500 truncate">
                      {formatDimensionsForDisplay(w.dimensions)}
                      {w.sizes && w.sizes.length > 1 && (
                        <span className="ml-1 text-stone-400">
                          · {w.sizes.length} sizes
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
        {/* Show more, incremental reveal at PAGE_SIZE per click. The
            All tab on a venue with hundreds of saved works can still
            scroll forever, but the initial render only pays for 20
            cards. */}
        {hasMore && (
          <div className="px-1 pt-3 pb-1 text-center">
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              className="text-[11px] font-medium text-stone-700 hover:text-stone-900 transition-colors px-3 py-1.5 rounded border border-black/10 hover:border-black/30 bg-white"
            >
              Show {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more
            </button>
            <p className="mt-1 text-[10px] text-stone-400">
              Showing {visible.length} of {filtered.length}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Tab button ──────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  label,
  count,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={hint}
      className={`flex-1 px-1.5 py-1 rounded text-[10px] font-medium transition ${
        active
          ? "bg-stone-900 text-white"
          : "text-stone-600 hover:bg-stone-100"
      }`}
    >
      {label}
      <span className="ml-1 text-[9px] opacity-70 tabular-nums">{count}</span>
    </button>
  );
}

// ── Empty-state copy by tab ─────────────────────────────────────────────

function EmptyTab({ tab, mode }: { tab: Tab | null; mode: VisualizerMode }) {
  if (tab === null) {
    if (mode === "customer_artwork_page") {
      return (
        <p className="text-xs text-stone-500 px-2 py-3">
          Drag the artwork onto the wall to preview it.
        </p>
      );
    }
    return (
      <p className="text-xs text-stone-500 px-2 py-3">No works match.</p>
    );
  }
  if (tab === "my") {
    return (
      <div className="px-2 py-3 space-y-1.5">
        <p className="text-xs text-stone-600">
          No artworks on display yet.
        </p>
        <p className="text-[11px] text-stone-500 leading-snug">
          Once a placement is accepted, the artwork shows up here automatically.
        </p>
      </div>
    );
  }
  if (tab === "saved") {
    return (
      <div className="px-2 py-3 space-y-1.5">
        <p className="text-xs text-stone-600">
          No saved works yet.
        </p>
        <p className="text-[11px] text-stone-500 leading-snug">
          Tap the heart on any artwork while browsing, it&apos;ll appear here.
        </p>
      </div>
    );
  }
  return (
    <p className="text-xs text-stone-500 px-2 py-3">
      Browse the gallery loading…
    </p>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function dragHint(w: PanelWork): string {
  if (w.widthCm && w.heightCm) {
    return `${w.title}, drops at ${Math.round(w.widthCm)}×${Math.round(w.heightCm)} cm`;
  }
  return w.title;
}
