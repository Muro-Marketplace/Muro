"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import LabelPreview from "@/components/labels/LabelPreview";
import type { LabelData } from "@/components/labels/LabelSheet";
import { LABEL_SIZES, LABEL_STYLES, type LabelSize, type LabelStyle } from "@/components/labels/QRLabel";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";
import { authFetch } from "@/lib/api-client";

interface LabelOptions {
  showMedium: boolean;
  showDimensions: boolean;
  showPrice: boolean;
}

export default function LabelsPage() {
  const { artist, loading: artistLoading } = useCurrentArtist();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [selectedSizes, setSelectedSizes] = useState<Record<number, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [previewLabels, setPreviewLabels] = useState<LabelData[]>([]);
  const [options, setOptions] = useState<LabelOptions>({
    showMedium: true,
    showDimensions: false,
    showPrice: false,
  });
  // Portfolio label
  const [portfolioQty, setPortfolioQty] = useState(0);
  // Venue context for QR tracking
  const [selectedVenue, setSelectedVenue] = useState("");
  const [venues, setVenues] = useState<string[]>([]);
  const [venueDropdownOpen, setVenueDropdownOpen] = useState(false);
  const [preselected, setPreselected] = useState(false);
  const [labelSize, setLabelSize] = useState<LabelSize>("medium");
  const [tagline, setTagline] = useState("");
  // High-level style picker — drives size + which fields to show, so
  // the artist doesn't have to think about both. Falling back to
  // "minimal" matches the existing default size of medium.
  const [labelStyle, setLabelStyle] = useState<LabelStyle>("minimal");

  function applyStyle(style: LabelStyle) {
    // Style + size are independent now (per design feedback). Picking
    // a style sets the *default* size for that style on first selection
    // but doesn't override an explicit size the user has already
    // chosen. Field toggles are always live so Editorial actually
    // shows medium/dimensions/price.
    setLabelStyle(style);
    const cfg = LABEL_STYLES.find((s) => s.key === style);
    if (cfg) setLabelSize(cfg.defaultSize);
    if (style === "editorial") {
      setOptions({ showMedium: true, showDimensions: true, showPrice: true });
    } else if (style === "minimal") {
      setOptions({ showMedium: false, showDimensions: false, showPrice: false });
    }
  }

  // Pre-select venue and works from query params (from placement QR
  // button). Two flavours of size param:
  //   - `sizes=` (comma-separated, parallel to works) for multi-work
  //     placements where each work has its own agreed size
  //   - `size=` (single) for legacy single-work links
  useEffect(() => {
    if (!artist || preselected) return;
    const paramVenue = searchParams.get("venue");
    const paramWorks = searchParams.get("works");
    const paramSizes = searchParams.get("sizes");
    const paramSize = searchParams.get("size");
    if (paramVenue) setSelectedVenue(paramVenue);
    if (paramWorks && artist.works) {
      const workTitles = paramWorks.split(",").map((w) => w.trim());
      const sizeList = paramSizes
        ? paramSizes.split(",").map((s) => s.trim())
        : null;
      const indices = new Set<number>();
      const sizeMap: Record<number, string> = {};
      artist.works.forEach((w, i) => {
        const at = workTitles.indexOf(w.title);
        if (at === -1) return;
        indices.add(i);
        // Per-work size from `sizes=` if available; otherwise fall
        // back to the legacy single `size=` param applied to all.
        const perWork = sizeList?.[at];
        const chosen = perWork && perWork.length > 0
          ? perWork
          : (paramSize || "");
        if (chosen) sizeMap[i] = chosen;
      });
      if (indices.size > 0) {
        setSelected(indices);
        if (Object.keys(sizeMap).length > 0) setSelectedSizes(sizeMap);
      }
    }
    setPreselected(true);
  }, [artist, searchParams, preselected]);

  // All hooks MUST be before any early return
  const totalLabels = useMemo(() => {
    let count = portfolioQty;
    selected.forEach((i) => { count += quantities[i] ?? 1; });
    return count;
  }, [selected, quantities, portfolioQty]);

  // Fetch unique venue names from placements
  useEffect(() => {
    authFetch("/api/placements")
      .then((r) => r.json())
      .then((data) => {
        if (data.placements) {
          const uniqueVenues = [...new Set(
            data.placements
              .map((p: { venue?: string }) => p.venue)
              .filter(Boolean) as string[]
          )];
          setVenues(uniqueVenues);
        }
      })
      .catch(() => {});
  }, []);

  if (artistLoading || !artist) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/labels">
        <p className="text-muted text-sm py-12 text-center">{artistLoading ? "Loading..." : "No artist profile found."}</p>
      </ArtistPortalLayout>
    );
  }

  // artist is guaranteed non-null past the guard above
  const currentArtist = artist!;
  const allSelected = selected.size === currentArtist.works.length;

  function getQty(index: number) {
    return quantities[index] ?? 1;
  }

  function setQty(index: number, qty: number) {
    setQuantities((prev) => ({ ...prev, [index]: Math.max(1, Math.min(50, qty)) }));
  }

  function toggleWork(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(currentArtist.works.map((_, i) => i)));
  }

  function buildLabels(indices: number[]): LabelData[] {
    const labels: LabelData[] = [];

    // Portfolio labels first
    if (portfolioQty > 0) {
      labels.push({
        artistName: currentArtist.name,
        artistSlug: currentArtist.slug,
        venueName: selectedVenue || undefined,
        quantity: portfolioQty,
        isPortfolioLabel: true,
        labelSize,
        labelStyle,
        tagline: (labelSize === "large" || labelSize === "xlarge") && labelStyle !== "qr_only" ? tagline || undefined : undefined,
      });
    }

    indices.forEach((i) => {
      const work = currentArtist.works[i];
      labels.push({
        artistName: currentArtist.name,
        artistSlug: currentArtist.slug,
        workId: work.id,
        venueName: selectedVenue || undefined,
        workTitle: work.title,
        workMedium: work.medium,
        workDimensions: selectedSizes[i] || work.dimensions,
        workPrice: work.priceBand,
        quantity: getQty(i),
        _sourceMedium: work.medium,
        _sourcePrice: work.priceBand,
        _sourceDimensions: work.dimensions,
        labelSize,
        labelStyle,
        tagline: (labelSize === "large" || labelSize === "xlarge") && labelStyle !== "qr_only" ? tagline || undefined : undefined,
      });
    });
    return labels;
  }

  function buildVisibility(labels: LabelData[]): { medium: boolean; dimensions: boolean; price: boolean }[] {
    return labels.map((l) => ({
      medium: l.isPortfolioLabel ? false : options.showMedium,
      dimensions: l.isPortfolioLabel ? false : options.showDimensions,
      price: l.isPortfolioLabel ? false : options.showPrice,
    }));
  }

  function openPreview(indices: number[]) {
    setPreviewLabels(buildLabels(indices));
    setShowPreview(true);
  }

  return (
    <ArtistPortalLayout activePath="/artist-portal/labels">
      <div className="max-w-5xl pb-24">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-serif text-foreground">QR Labels</h1>
          <p className="text-sm text-muted mt-1">
            Generate printable labels with QR codes. Visitors scan to view your profile and enquire.
          </p>
        </div>

        {/* Customisation + Venue + Portfolio row */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          {/* Customisation panel */}
          <div className="flex-1 bg-surface border border-border rounded-sm p-4">
            <h3 className="text-xs font-medium tracking-wider uppercase text-muted mb-3">Label Style</h3>

            {/* High-level style picker — three curated presets that
                pre-fill the right size + field toggles. */}
            <div className="grid sm:grid-cols-3 gap-2 mb-4">
              {LABEL_STYLES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => applyStyle(s.key)}
                  className={`text-left p-3 rounded-sm border transition-colors ${
                    labelStyle === s.key ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"
                  }`}
                >
                  <p className="text-sm font-medium text-foreground mb-0.5">{s.name}</p>
                  <p className="text-[11px] text-muted leading-snug">{s.description}</p>
                </button>
              ))}
            </div>

            {/* Label size — front-and-centre. Style + size are
                independent: pick the visual treatment above, then the
                physical dimensions here. */}
            <div className="mb-3">
              <p className="text-xs text-muted mb-1.5">Label size</p>
              <div className="flex gap-1.5 flex-wrap">
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

            {(labelSize === "large" || labelSize === "xlarge") && labelStyle !== "qr_only" && (
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

            {/* Field toggles — only meaningful for Editorial style. */}
            {labelStyle === "editorial" && (
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
            )}
          </div>

          {/* Venue selector */}
          <div className="lg:w-64 bg-surface border border-border rounded-sm p-4">
            <h3 className="text-xs font-medium tracking-wider uppercase text-muted mb-2">Venue</h3>
            <p className="text-xs text-muted mb-3">Tag scans to a specific venue</p>
            <div className="relative">
              <button
                onClick={() => setVenueDropdownOpen(!venueDropdownOpen)}
                className="w-full flex items-center justify-between text-sm border border-border rounded-sm px-3 py-2 bg-background hover:bg-background/80 transition-colors text-left"
              >
                <span className={selectedVenue ? "text-foreground" : "text-muted"}>
                  {selectedVenue || "No venue"}
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-muted shrink-0">
                  <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {venueDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-surface border border-border rounded-sm shadow-sm z-20 max-h-48 overflow-y-auto">
                  <button
                    onClick={() => { setSelectedVenue(""); setVenueDropdownOpen(false); }}
                    className={`w-full text-left text-sm px-3 py-2 hover:bg-background transition-colors ${
                      !selectedVenue ? "text-accent font-medium" : "text-foreground"
                    }`}
                  >
                    No venue
                  </button>
                  {venues.map((v) => (
                    <button
                      key={v}
                      onClick={() => { setSelectedVenue(v); setVenueDropdownOpen(false); }}
                      className={`w-full text-left text-sm px-3 py-2 hover:bg-background transition-colors ${
                        v === selectedVenue ? "text-accent font-medium" : "text-foreground"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                  {venues.length === 0 && (
                    <p className="text-xs text-muted px-3 py-2">No placements yet</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Portfolio QR */}
          <div className="lg:w-64 bg-surface border border-border rounded-sm p-4">
            <h3 className="text-xs font-medium tracking-wider uppercase text-muted mb-2">Portfolio Label</h3>
            <p className="text-xs text-muted mb-3">QR linking to your full portfolio</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPortfolioQty((q) => Math.max(0, q - 1))}
                className="w-7 h-7 rounded-sm border border-border flex items-center justify-center text-muted hover:text-foreground hover:border-foreground/30 transition-colors text-sm"
              >
                −
              </button>
              <span className="w-8 text-center text-sm font-medium tabular-nums">{portfolioQty}</span>
              <button
                onClick={() => setPortfolioQty((q) => Math.min(50, q + 1))}
                className="w-7 h-7 rounded-sm border border-border flex items-center justify-center text-muted hover:text-foreground hover:border-foreground/30 transition-colors text-sm"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Select all bar */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-foreground">Individual Works</h2>
          <button
            onClick={toggleAll}
            className="text-sm text-accent hover:text-accent/80 transition-colors"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </button>
        </div>

        {/* Works grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {currentArtist.works.map((work, index) => {
            const isSelected = selected.has(index);
            const qty = getQty(index);
            return (
              <div
                key={index}
                className={`group relative bg-surface border rounded-sm overflow-hidden transition-all ${
                  isSelected
                    ? "ring-2 ring-accent border-accent/30 shadow-sm"
                    : "border-border hover:border-border/80"
                }`}
              >
                {/* Checkbox */}
                <div
                  className="absolute top-2 right-2 z-10 cursor-pointer"
                  onClick={() => toggleWork(index)}
                >
                  <div
                    className={`w-5 h-5 rounded-sm border flex items-center justify-center transition-colors ${
                      isSelected ? "bg-accent border-accent" : "bg-white/80 border-border backdrop-blur-sm"
                    }`}
                  >
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                    )}
                  </div>
                </div>

                {/* Thumbnail */}
                <div className="aspect-[4/3] relative bg-border/20 cursor-pointer" onClick={() => toggleWork(index)}>
                  <Image
                    src={work.image}
                    alt={work.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  />
                </div>

                {/* Info */}
                <div className="p-3">
                  <h3 className="text-sm font-medium text-foreground leading-snug line-clamp-1">{work.title}</h3>
                  <p className="text-xs text-muted mt-0.5">{work.medium}</p>

                  {/* Quantity + actions row */}
                  <div className="flex items-center justify-between mt-2">
                    {isSelected ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted mr-0.5">Qty</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setQty(index, qty - 1); }}
                          className="w-5 h-5 rounded-sm border border-border flex items-center justify-center text-muted hover:text-foreground transition-colors text-[10px]"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-xs font-medium tabular-nums">{qty}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setQty(index, qty + 1); }}
                          className="w-5 h-5 rounded-sm border border-border flex items-center justify-center text-muted hover:text-foreground transition-colors text-[10px]"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          work.available ? "bg-accent/10 text-accent" : "bg-border/50 text-muted"
                        }`}
                      >
                        {work.available ? "Available" : "Sold"}
                      </span>
                    )}
                    {isSelected && work.pricing && work.pricing.length > 0 && (
                      <select
                        value={selectedSizes[index] || ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); setSelectedSizes((prev) => ({ ...prev, [index]: e.target.value })); }}
                        className="text-[10px] px-1 py-0.5 bg-background border border-border rounded-sm text-foreground focus:outline-none"
                      >
                        <option value="">Size</option>
                        {work.pricing.map((p) => (
                          <option key={p.label} value={p.label}>{p.label}</option>
                        ))}
                      </select>
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
      </div>

      {/* Sticky bottom bar */}
      {(selected.size > 0 || portfolioQty > 0) && (
        <div className="fixed bottom-0 left-0 lg:left-56 right-0 bg-surface border-t border-border px-6 py-3.5 flex items-center justify-between z-40 no-print">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">
              {totalLabels} label{totalLabels !== 1 ? "s" : ""} total
            </span>
            <span className="text-xs text-muted">
              ({selected.size} work{selected.size !== 1 ? "s" : ""}{portfolioQty > 0 ? ` + ${portfolioQty} portfolio` : ""})
            </span>
            <button
              onClick={() => { setSelected(new Set()); setPortfolioQty(0); }}
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

      {/* Print preview overlay */}
      {showPreview && (
        <LabelPreview
          labels={previewLabels}
          initialVisibility={buildVisibility(previewLabels)}
          availableSizes={currentArtist.availableSizes}
          onClose={() => setShowPreview(false)}
        />
      )}
    </ArtistPortalLayout>
  );
}
