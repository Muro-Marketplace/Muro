"use client";

import { useState } from "react";
import LabelSheet, { type LabelVisibility } from "./LabelSheet";
import type { LabelData } from "./LabelSheet";
import { LABEL_SIZES, LABEL_STYLES, type LabelSize } from "./QRLabel";

interface LabelPreviewProps {
  labels: LabelData[];
  availableSizes: string[];
  /** Initial per-label show flags. Index-parallel to `labels`. If
   *  omitted, defaults are derived from each label's data presence. */
  initialVisibility?: LabelVisibility[];
  onClose: () => void;
}

export default function LabelPreview({
  labels: initialLabels,
  availableSizes = [],
  initialVisibility,
  onClose,
}: LabelPreviewProps) {
  const [labels, setLabels] = useState<LabelData[]>(initialLabels);
  const [showControls, setShowControls] = useState(true);
  // Per-label visibility flags, decoupled from the data fields. Toggle
  // handlers below flip these flags only, the underlying workMedium /
  // workDimensions / workPrice strings stay populated from the upstream
  // construction so a flag flipped off and on again restores correctly.
  // Without this decoupling, the second-label deselect bug appeared
  // because the toggle was both the data carrier and the visibility
  // carrier, leaving no way to distinguish "off" from "no data".
  const [labelVisibility, setLabelVisibility] = useState<LabelVisibility[]>(
    () =>
      initialVisibility ??
      initialLabels.map((l) => ({
        medium: !!l.workMedium,
        dimensions: !!l.workDimensions,
        price: !!l.workPrice,
      })),
  );

  // Calculate total including quantities
  const totalCount = labels.reduce((sum, l) => sum + l.quantity, 0);
  const currentSize = labels[0]?.labelSize || "medium";
  const currentStyle = labels[0]?.labelStyle || "minimal";
  const styleConfig = LABEL_STYLES.find((s) => s.key === currentStyle);
  const sizeConfig = LABEL_SIZES.find((s) => s.key === currentSize) || LABEL_SIZES[1];
  const pageCount = Math.ceil(totalCount / sizeConfig.perPage);

  function updateLabel(index: number, updates: Partial<LabelData>) {
    setLabels((prev) => prev.map((l, i) => (i === index ? { ...l, ...updates } : l)));
  }

  function setVisibility(index: number, key: keyof LabelVisibility, next: boolean) {
    setLabelVisibility((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [key]: next } : v)),
    );
  }

  function removeLabel(index: number) {
    setLabels((prev) => prev.filter((_, i) => i !== index));
    setLabelVisibility((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="fixed inset-0 z-[110] bg-white flex flex-col">
      {/* Toolbar */}
      <div className="label-preview-toolbar no-print border-b border-border bg-surface px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-medium text-foreground">
            Print Preview – {totalCount} label{totalCount !== 1 ? "s" : ""}
          </h2>
          {/* Style + size pills so the venue/artist can verify what
              they're about to send to the printer at a glance. The
              earlier toolbar only showed the page count, leaving
              "which style is this?" to a side-panel hunt. */}
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm border border-accent/30 bg-accent/5 text-accent">
            {styleConfig?.name || currentStyle}
          </span>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm border border-border text-muted">
            {sizeConfig.label} · {sizeConfig.width} × {sizeConfig.height}
          </span>
          <span className="text-xs text-muted">
            {pageCount} page{pageCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setShowControls((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 text-xs border rounded-sm transition-colors ${
              showControls ? "text-accent border-accent/30 bg-accent/5" : "text-muted border-border"
            }`}
          >
            {showControls ? "Hide Controls" : "Edit Labels"}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`transition-transform duration-200 ${showControls ? "rotate-180" : ""}`}>
              <polyline points="2 4 6 8 10 4" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 sm:py-1.5 text-sm text-muted hover:text-foreground border border-border rounded-sm transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => window.print()}
            className="px-5 py-2 sm:py-1.5 text-sm font-medium text-white bg-foreground rounded-sm hover:bg-foreground/90 transition-colors"
          >
            Print Labels
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#f0f0f0] no-print-bg">
        <div className="flex gap-0">
          {/* Controls sidebar */}
          {showControls && (
            <div className="no-print w-80 shrink-0 bg-surface border-r border-border overflow-y-auto p-4 space-y-3">
              <h3 className="text-xs font-medium tracking-wider uppercase text-muted mb-2">Edit Labels</h3>

              {/* Size selector */}
              <div className="bg-background border border-border rounded-sm p-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Label Size</p>
                <div className="flex flex-wrap gap-1">
                  {LABEL_SIZES.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setLabels((prev) => prev.map((l) => ({ ...l, labelSize: s.key as LabelSize })))}
                      className={`px-1.5 py-0.5 text-[9px] rounded-sm border transition-colors ${
                        currentSize === s.key ? "bg-accent text-white border-accent" : "text-muted border-border hover:border-foreground/30"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {labels.map((label, index) => (
                <div key={index} className="bg-background border border-border rounded-sm p-3 space-y-2">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {label.isPortfolioLabel ? "Portfolio Label" : label.workTitle}
                      </p>
                      {!label.isPortfolioLabel && (
                        <p className="text-[10px] text-muted">{label.artistName}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeLabel(index)}
                      className="text-muted hover:text-red-500 transition-colors ml-2 shrink-0"
                      title="Remove"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                    </button>
                  </div>

                  {/* Quantity */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted uppercase tracking-wider">Copies</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateLabel(index, { quantity: Math.max(1, label.quantity - 1) })}
                        className="w-6 h-6 rounded-sm border border-border flex items-center justify-center text-muted hover:text-foreground text-xs"
                      >−</button>
                      <span className="w-6 text-center text-xs font-medium tabular-nums">{label.quantity}</span>
                      <button
                        onClick={() => updateLabel(index, { quantity: Math.min(50, label.quantity + 1) })}
                        className="w-6 h-6 rounded-sm border border-border flex items-center justify-center text-muted hover:text-foreground text-xs"
                      >+</button>
                    </div>
                  </div>

                  {!label.isPortfolioLabel && (
                    <>
                      {/* Size selector */}
                      <div>
                        <span className="text-[10px] text-muted uppercase tracking-wider block mb-1">Size on label</span>
                        <div className="flex flex-wrap gap-1">
                          {availableSizes.map((size) => (
                            <button
                              key={size}
                              onClick={() => updateLabel(index, { workDimensions: label.workDimensions === size ? undefined : size })}
                              className={`px-2 py-0.5 text-[10px] rounded-sm border transition-colors ${
                                label.workDimensions === size
                                  ? "bg-accent text-white border-accent"
                                  : "text-muted border-border hover:border-foreground/30"
                              }`}
                            >
                              {size}
                            </button>
                          ))}
                          {label.workDimensions && !availableSizes.includes(label.workDimensions) && (
                            <span className="px-2 py-0.5 text-[10px] rounded-sm bg-accent/10 text-accent border border-accent/20">
                              {label.workDimensions}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Toggle fields, flips visibility flags only,
                          leaves workMedium / workDimensions / workPrice
                          intact so re-enabling restores the data. */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {([
                          { key: "medium" as const, label: "Medium" },
                          { key: "dimensions" as const, label: "Dimensions" },
                          { key: "price" as const, label: "Price" },
                        ]).map(({ key, label: fieldLabel }) => {
                          const isOn = labelVisibility[index]?.[key] ?? false;
                          return (
                            <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                              <button
                                onClick={() => setVisibility(index, key, !isOn)}
                                className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${
                                  isOn ? "bg-accent border-accent" : "bg-white border-border"
                                }`}
                              >
                                {isOn && (
                                  <svg width="8" height="8" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                                )}
                              </button>
                              <span className="text-[10px] text-muted">{fieldLabel}</span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {/* Tagline, only for large/xlarge */}
                  {(currentSize === "large" || currentSize === "xlarge") && (
                    <div>
                      <span className="text-[10px] text-muted uppercase tracking-wider block mb-1">Tagline</span>
                      <input
                        type="text"
                        value={label.tagline || ""}
                        onChange={(e) => updateLabel(index, { tagline: e.target.value })}
                        placeholder="e.g. Scan to view & buy"
                        className="w-full px-2 py-1 bg-surface border border-border rounded-sm text-[10px] text-foreground focus:outline-none focus:border-accent/50"
                      />
                    </div>
                  )}
                </div>
              ))}

              {labels.length === 0 && (
                <p className="text-sm text-muted text-center py-8">No labels – close and select some works.</p>
              )}
            </div>
          )}

          {/* A4 paper preview, scales to fit on mobile */}
          <div className="flex-1 overflow-auto">
            <div className="py-4 sm:py-8 flex flex-col items-center gap-4 sm:gap-8">
              {Array.from({ length: pageCount }, (_, pageIdx) => (
                <div
                  key={pageIdx}
                  className="origin-top scale-[0.45] sm:scale-[0.6] lg:scale-100 -mb-[160mm] sm:-mb-[120mm] lg:mb-0"
                >
                <div
                  className="bg-white shadow-lg label-page"
                  style={{
                    width: "210mm",
                    height: "297mm",
                    padding: "10mm",
                    boxSizing: "border-box",
                    position: "relative",
                  }}
                >
                  {/* Page number badge */}
                  <div className="no-print absolute top-2 right-3 text-[10px] text-muted/50">
                    Page {pageIdx + 1} of {pageCount}
                  </div>
                  <LabelSheet labels={labels} labelVisibility={labelVisibility} pageIndex={pageIdx} />
                </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
