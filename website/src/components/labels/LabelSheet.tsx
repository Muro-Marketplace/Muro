"use client";

import { useEffect, useState } from "react";
import QRLabel from "./QRLabel";
import { LABEL_SIZES, type LabelSize, type LabelStyle } from "./QRLabel";
import { generateQRDataURL } from "@/lib/qr";
import { slugify } from "@/lib/slugify";

export interface LabelData {
  artistName: string;
  artistSlug: string;
  workTitle?: string;
  /** Real artist_works.id, used to set analytics_events.work_id
   *  correctly when the QR is scanned. Without this, work_id was
   *  being stored as the URL-encoded title and the analytics
   *  top_works lookup couldn't join back to the work row. */
  workId?: string;
  workMedium?: string;
  workDimensions?: string;
  workPrice?: string;
  venueName?: string;
  /** Real venue_profiles.slug, used by the QR redirect to look up
   *  venue_user_id and link the scan back to the venue cleanly.
   *  Falls back to venueName when not present. */
  venueSlug?: string;
  quantity: number;
  isPortfolioLabel?: boolean;
  // Source values for restoring toggled-off fields in preview
  _sourceMedium?: string;
  _sourcePrice?: string;
  _sourceDimensions?: string;
  labelSize?: LabelSize;
  labelStyle?: LabelStyle;
  tagline?: string;
}

/** Per-label render flags. Parallel to `labels`, indexed by uniqueIndex
 *  (the position of the label in the user's selection, ignoring quantity
 *  expansion). Optional; absent means render every field that has data. */
export interface LabelVisibility {
  medium: boolean;
  dimensions: boolean;
  price: boolean;
}

interface LabelSheetProps {
  labels: LabelData[];
  labelVisibility?: LabelVisibility[];
  pageIndex?: number; // If provided, render only this page (0-based)
}

export default function LabelSheet({ labels, labelVisibility, pageIndex }: LabelSheetProps) {
  const [qrUrls, setQrUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Build expanded list (each label repeated by quantity)
  const expandedLabels: { label: LabelData; uniqueIndex: number }[] = [];
  labels.forEach((label, i) => {
    for (let q = 0; q < label.quantity; q++) {
      expandedLabels.push({ label, uniqueIndex: i });
    }
  });

  useEffect(() => {
    async function generate() {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
      // QR URL params (compact keys to keep the encoded string short):
      //   w  = work id (preferred, sets analytics_events.work_id)
      //   t  = work title (compat / display fallback)
      //   vs = venue slug (preferred, used to resolve venue_user_id)
      //   v  = venue name (compat / display fallback)
      //   size = displayed size
      const uniqueUrls = await Promise.all(
        labels.map((l) => {
          const params = new URLSearchParams();
          if (!l.isPortfolioLabel) {
            if (l.workId) params.set("w", l.workId);
            if (l.workTitle) params.set("t", l.workTitle);
          }
          if (l.venueSlug) params.set("vs", l.venueSlug);
          if (l.venueName) params.set("v", l.venueName);
          if (l.workDimensions) params.set("size", l.workDimensions);
          const qs = params.toString();
          const url = `${siteUrl}/api/qr/${l.artistSlug}${qs ? `?${qs}` : ""}`;
          return generateQRDataURL(url);
        })
      );
      setQrUrls(uniqueUrls);
      setLoading(false);
    }
    generate();
  }, [labels]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted text-sm">Generating labels…</p>
      </div>
    );
  }

  // Determine size from first label (all labels in a batch share the same size)
  const currentSize = labels[0]?.labelSize || "medium";
  const sizeConfig = LABEL_SIZES.find((s) => s.key === currentSize) || LABEL_SIZES[1];
  const perPage = sizeConfig.perPage;
  const cols = currentSize === "micro" ? 8 : currentSize === "xlarge" ? 1 : currentSize === "large" ? 2 : 2;
  const rows = Math.ceil(perPage / cols);

  // Split into pages
  const pages: typeof expandedLabels[] = [];
  for (let i = 0; i < expandedLabels.length; i += perPage) {
    pages.push(expandedLabels.slice(i, i + perPage));
  }

  const pagesToRender = pageIndex !== undefined ? [pages[pageIndex]].filter(Boolean) : pages;

  return (
    <div className="label-sheet">
      {pagesToRender.map((page, idx) => {
        const actualPageIndex = pageIndex !== undefined ? pageIndex : idx;
        return (
          <div
            key={actualPageIndex}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, ${sizeConfig.width})`,
              gridTemplateRows: `repeat(${rows}, ${sizeConfig.height})`,
              gap: "0mm",
              justifyContent: "center",
            }}
          >
            {page.map((item, i) => {
              const vis = labelVisibility?.[item.uniqueIndex];
              return (
                <QRLabel
                  key={`${actualPageIndex}-${i}`}
                  artistName={item.label.artistName}
                  workTitle={item.label.workTitle}
                  workMedium={item.label.workMedium}
                  workDimensions={item.label.workDimensions}
                  workPrice={item.label.workPrice}
                  qrDataUrl={qrUrls[item.uniqueIndex] || ""}
                  isPortfolioLabel={item.label.isPortfolioLabel}
                  labelSize={currentSize}
                  labelStyle={item.label.labelStyle}
                  tagline={item.label.tagline}
                  showMedium={vis ? vis.medium : true}
                  showDimensions={vis ? vis.dimensions : true}
                  showPrice={vis ? vis.price : true}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
