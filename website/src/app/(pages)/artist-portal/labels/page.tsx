"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import LabelPreview from "@/components/labels/LabelPreview";
import type { LabelData } from "@/components/labels/LabelSheet";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";
import { authFetch } from "@/lib/api-client";

interface LabelOptions {
  showMedium: boolean;
  showDimensions: boolean;
  showPrice: boolean;
}

export default function LabelsPage() {
  const { artist, loading: artistLoading } = useCurrentArtist();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [quantities, setQuantities] = useState<Record<number, number>>({});
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
      });
    }

    indices.forEach((i) => {
      const work = currentArtist.works[i];
      labels.push({
        artistName: currentArtist.name,
        artistSlug: currentArtist.slug,
        venueName: selectedVenue || undefined,
        workTitle: work.title,
        workMedium: options.showMedium ? work.medium : undefined,
        workDimensions: options.showDimensions ? work.dimensions : undefined,
        workPrice: options.showPrice ? work.priceBand : undefined,
        quantity: getQty(i),
        _sourceMedium: work.medium,
        _sourcePrice: work.priceBand,
        _sourceDimensions: work.dimensions,
      });
    });
    return labels;
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
            <h3 className="text-xs font-medium tracking-wider uppercase text-muted mb-3">Label Options</h3>
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
          availableSizes={currentArtist.availableSizes}
          onClose={() => setShowPreview(false)}
        />
      )}
    </ArtistPortalLayout>
  );
}
