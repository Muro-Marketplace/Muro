"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import LabelPreview from "@/components/labels/LabelPreview";
import type { LabelData } from "@/components/labels/LabelSheet";
import { LABEL_SIZES, type LabelSize } from "@/components/labels/QRLabel";
import { authFetch } from "@/lib/api-client";

interface LabelOptions {
  showMedium: boolean;
  showDimensions: boolean;
  showPrice: boolean;
}

interface Placement {
  id: string;
  work_title: string;
  work_image?: string | null;
  artist_slug: string;
  venue?: string | null;
  status: string;
}

interface ArtistLookup {
  slug: string;
  name: string;
  works?: { title: string; medium?: string; dimensions?: string; priceBand?: string }[];
}

export default function VenueLabelsPage() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [artistsBySlug, setArtistsBySlug] = useState<Record<string, ArtistLookup>>({});
  const [venueName, setVenueName] = useState("");
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [labelSize, setLabelSize] = useState<LabelSize>("medium");
  const [tagline, setTagline] = useState("");
  const [options, setOptions] = useState<LabelOptions>({
    showMedium: false,
    showDimensions: false,
    showPrice: false,
  });
  const [showPreview, setShowPreview] = useState(false);
  const [previewLabels, setPreviewLabels] = useState<LabelData[]>([]);

  // Load this venue's active placements
  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch("/api/placements");
        const data = await res.json();
        const all = (data.placements || []) as Placement[];
        const active = all.filter((p) => p.status === "active");
        setPlacements(active);

        // Best-effort lookup of artist display names
        const slugs = [...new Set(active.map((p) => p.artist_slug).filter(Boolean))];
        if (slugs.length > 0) {
          try {
            const artistRes = await fetch("/api/browse-artists");
            const artistData = await artistRes.json();
            const map: Record<string, ArtistLookup> = {};
            for (const a of (artistData.artists || [])) {
              if (slugs.includes(a.slug)) {
                map[a.slug] = {
                  slug: a.slug,
                  name: a.name,
                  // Carry the works list so the label preview can show
                  // per-work medium / dimensions / price when the venue
                  // ticks those options.
                  works: Array.isArray(a.works)
                    ? a.works.map((w: { title: string; medium?: string; dimensions?: string; priceBand?: string }) => ({
                        title: w.title,
                        medium: w.medium,
                        dimensions: w.dimensions,
                        priceBand: w.priceBand,
                      }))
                    : [],
                };
              }
            }
            setArtistsBySlug(map);
          } catch { /* fall back to formatting the slug */ }
        }

        // Get the venue name for display
        try {
          const vp = await authFetch("/api/venue-profile");
          const vpData = await vp.json();
          if (vpData.profile?.name) setVenueName(vpData.profile.name);
        } catch { /* ignore */ }
      } catch (e) {
        console.error("labels load error", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalLabels = useMemo(() => {
    let count = 0;
    selected.forEach((i) => { count += quantities[i] ?? 1; });
    return count;
  }, [selected, quantities]);

  const allSelected = placements.length > 0 && selected.size === placements.length;

  function formatArtistName(slug: string): string {
    const known = artistsBySlug[slug]?.name;
    if (known) return known;
    if (!slug) return "Artist";
    return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function getQty(i: number) {
    return quantities[i] ?? 1;
  }

  function setQty(i: number, qty: number) {
    setQuantities((prev) => ({ ...prev, [i]: Math.max(1, Math.min(50, qty)) }));
  }

  function toggleWork(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(placements.map((_, i) => i)));
  }

  function buildLabels(indices: number[]): LabelData[] {
    return indices.map((i) => {
      const p = placements[i];
      // Match the placement back to the artist's listed work so we can
      // show medium / dimensions / price when the venue ticks those
      // options. Fallbacks are safe — missing fields just render blank
      // on the label.
      const artist = artistsBySlug[p.artist_slug];
      const work = artist?.works?.find((w) => w.title === p.work_title);
      return {
        artistName: formatArtistName(p.artist_slug),
        artistSlug: p.artist_slug,
        venueName: venueName || (p.venue ?? undefined),
        workTitle: p.work_title,
        workMedium: options.showMedium ? (work?.medium || undefined) : undefined,
        workDimensions: options.showDimensions ? (work?.dimensions || undefined) : undefined,
        workPrice: options.showPrice ? (work?.priceBand || undefined) : undefined,
        _sourceMedium: work?.medium,
        _sourcePrice: work?.priceBand,
        _sourceDimensions: work?.dimensions,
        quantity: getQty(i),
        labelSize,
        tagline: (labelSize === "large" || labelSize === "xlarge") ? tagline || undefined : undefined,
      };
    });
  }

  function openPreview(indices: number[]) {
    setPreviewLabels(buildLabels(indices));
    setShowPreview(true);
  }

  return (
    <VenuePortalLayout>
      <div className="max-w-5xl pb-24">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-serif text-foreground">QR Labels</h1>
          <p className="text-sm text-muted mt-1">
            Print QR labels for artworks currently placed in your venue. Scans are tagged to your venue for tracking.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-muted py-12 text-center">Loading your placements…</p>
        ) : placements.length === 0 ? (
          <div className="bg-surface border border-border rounded-sm p-10 text-center">
            <p className="text-sm text-foreground font-medium mb-1">No active placements yet</p>
            <p className="text-xs text-muted">Once an artist has accepted a placement for your venue, you'll be able to print QR labels for those works here.</p>
          </div>
        ) : (
          <>
            {/* Options row */}
            <div className="flex flex-col lg:flex-row gap-4 mb-6">
              <div className="flex-1 bg-surface border border-border rounded-sm p-4">
                <h3 className="text-xs font-medium tracking-wider uppercase text-muted mb-3">Label Options</h3>

                <div className="mb-3">
                  <p className="text-xs text-muted mb-1.5">Label Size</p>
                  <div className="flex flex-wrap gap-1.5">
                    {LABEL_SIZES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setLabelSize(s.key)}
                        className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${
                          labelSize === s.key ? "bg-foreground text-white border-foreground" : "border-border text-muted hover:border-foreground/30"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(labelSize === "large" || labelSize === "xlarge") && (
                  <div className="mb-3">
                    <p className="text-xs text-muted mb-1.5">Tagline (shown on label)</p>
                    <input
                      type="text"
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      placeholder="e.g. Scan to view & purchase this artwork"
                      maxLength={80}
                      className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/60"
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {([
                    { key: "showMedium" as const, label: "Medium" },
                    { key: "showDimensions" as const, label: "Dimensions" },
                    { key: "showPrice" as const, label: "Price" },
                  ]).map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
                      <button
                        onClick={() => setOptions((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                          options[key] ? "bg-accent border-accent" : "bg-white border-border"
                        }`}
                      >
                        {options[key] && (
                          <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                        )}
                      </button>
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="lg:w-64 bg-surface border border-border rounded-sm p-4">
                <h3 className="text-xs font-medium tracking-wider uppercase text-muted mb-2">Your venue</h3>
                <p className="text-sm text-foreground">{venueName || "Your venue"}</p>
                <p className="text-xs text-muted mt-2">QR scans from these labels will be tagged to your venue automatically.</p>
              </div>
            </div>

            {/* Select all bar */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-foreground">Placed Works</h2>
              <button
                onClick={toggleAll}
                className="text-sm text-accent hover:text-accent/80 transition-colors"
              >
                {allSelected ? "Deselect All" : "Select All"}
              </button>
            </div>

            {/* Placements grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {placements.map((p, index) => {
                const isSelected = selected.has(index);
                const qty = getQty(index);
                const artistName = formatArtistName(p.artist_slug);
                return (
                  <div
                    key={p.id}
                    className={`group relative bg-surface border rounded-sm overflow-hidden transition-all ${
                      isSelected ? "ring-2 ring-accent border-accent/30 shadow-sm" : "border-border hover:border-border/80"
                    }`}
                  >
                    <div className="absolute top-2 right-2 z-10 cursor-pointer" onClick={() => toggleWork(index)}>
                      <div className={`w-5 h-5 rounded-sm border flex items-center justify-center transition-colors ${
                        isSelected ? "bg-accent border-accent" : "bg-white/80 border-border backdrop-blur-sm"
                      }`}>
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                        )}
                      </div>
                    </div>

                    <div className="aspect-[4/3] relative bg-border/20 cursor-pointer" onClick={() => toggleWork(index)}>
                      {p.work_image ? (
                        <Image src={p.work_image} alt={p.work_title} fill className="object-cover" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted">No image</div>
                      )}
                    </div>

                    <div className="p-3">
                      <h3 className="text-sm font-medium text-foreground leading-snug line-clamp-1">{p.work_title}</h3>
                      <p className="text-xs text-muted mt-0.5 line-clamp-1">{artistName}</p>

                      <div className="flex items-center justify-between mt-2">
                        {isSelected ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted mr-0.5">Qty</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setQty(index, qty - 1); }}
                              className="w-5 h-5 rounded-sm border border-border flex items-center justify-center text-muted hover:text-foreground transition-colors text-[10px]"
                            >−</button>
                            <span className="w-5 text-center text-xs font-medium tabular-nums">{qty}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setQty(index, qty + 1); }}
                              className="w-5 h-5 rounded-sm border border-border flex items-center justify-center text-muted hover:text-foreground transition-colors text-[10px]"
                            >+</button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">Active</span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewLabels(buildLabels([index]));
                            setShowPreview(true);
                          }}
                          className="text-[10px] text-muted hover:text-foreground transition-colors"
                        >
                          Print →
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Sticky bottom bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 lg:left-56 right-0 bg-surface border-t border-border px-6 py-3.5 flex items-center justify-between z-40 no-print">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">
              {totalLabels} label{totalLabels !== 1 ? "s" : ""} total
            </span>
            <span className="text-xs text-muted">
              ({selected.size} work{selected.size !== 1 ? "s" : ""})
            </span>
            <button
              onClick={() => { setSelected(new Set()); }}
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
          <button
            onClick={() => openPreview(Array.from(selected).sort((a, b) => a - b))}
            className="px-5 py-2 text-sm font-medium text-white bg-foreground rounded-sm hover:bg-foreground/90 transition-colors"
          >
            Preview & Print
          </button>
        </div>
      )}

      {showPreview && (
        <LabelPreview
          labels={previewLabels}
          availableSizes={[]}
          onClose={() => setShowPreview(false)}
        />
      )}
    </VenuePortalLayout>
  );
}
