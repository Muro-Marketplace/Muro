// LA-C067 (launch audit 2026-09-05). The artwork page's fallback meta
// description was built from the raw columns, so pixel dimensions the page
// body already hides, and empty media, reached search results as
// "2420 × 3632 px" and orphan commas. Same formatter as the page, and only the
// parts that exist.

import { formatDimensionsForDisplay } from "@/lib/format-dimensions";

export interface ArtworkMetaSource {
  title: string;
  medium?: string | null;
  dimensions?: string | null;
  available?: boolean | null;
  description?: string | null;
}

export function artworkMetaDescription(work: ArtworkMetaSource, artistName: string): string {
  const own = (work.description ?? "").trim();
  if (own) return own.slice(0, 160);
  const parts = [work.title.trim(), (work.medium ?? "").trim(), formatDimensionsForDisplay(work.dimensions)].filter(Boolean);
  return `${parts.join(", ")}. ${work.available ? "Available" : "Sold"}. By ${artistName} on Wallplace.`;
}
