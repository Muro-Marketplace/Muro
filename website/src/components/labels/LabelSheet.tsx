"use client";

import { useEffect, useState } from "react";
import QRLabel from "./QRLabel";
import { LABEL_SIZES, type LabelSize } from "./QRLabel";
import { generateQRDataURL } from "@/lib/qr";
import { slugify } from "@/lib/slugify";

export interface LabelData {
  artistName: string;
  artistSlug: string;
  workTitle?: string;
  workMedium?: string;
  workDimensions?: string;
  workPrice?: string;
  venueName?: string;
  quantity: number;
  isPortfolioLabel?: boolean;
  // Source values for restoring toggled-off fields in preview
  _sourceMedium?: string;
  _sourcePrice?: string;
  _sourceDimensions?: string;
  labelSize?: LabelSize;
  tagline?: string;
}

interface LabelSheetProps {
  labels: LabelData[];
  pageIndex?: number; // If provided, render only this page (0-based)
}

export default function LabelSheet({ labels, pageIndex }: LabelSheetProps) {
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
      const uniqueUrls = await Promise.all(
        labels.map((l) => {
          const venueParam = l.venueName ? `&v=${encodeURIComponent(l.venueName)}` : "";
          const url = l.isPortfolioLabel
            ? `${siteUrl}/api/qr/${l.artistSlug}${venueParam ? `?${venueParam.slice(1)}` : ""}`
            : `${siteUrl}/api/qr/${l.artistSlug}?work=${encodeURIComponent(l.workTitle || "")}${venueParam}`;
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
  const cols = currentSize === "xlarge" ? 1 : currentSize === "large" ? 2 : 2;
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
            {page.map((item, i) => (
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
                tagline={item.label.tagline}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
