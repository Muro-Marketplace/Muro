// Bulk price-editor merges, extracted from the portfolio page so they can be
// unit-tested without rendering the editor.
//
// E41-e: both bulk paths used to REBUILD each size row from scratch, keeping only
// {label, price} (and, in the copy-sizes path, quantityAvailable). That discarded
// the other SizePricing fields — per-size shippingPrice and inStorePrice — so
// tweaking one price in the bulk editor wiped per-size shipping + in-store pricing
// for every row of every work, and with it the "Collect from venue" CTA. The fix in
// both is to MERGE onto the existing row (spread it first) rather than replace it.

import type { SizePricing } from "@/data/artists";

export interface BulkPriceInput {
  /** Index into the work's original `pricing` array. */
  sizeIndex: number;
  label: string;
  price: number;
  /** True when the row is a brand-new size with no existing entry to merge onto. */
  isNew: boolean;
}

/**
 * Fold bulk-editor rows back onto a work's pricing. Rows are matched to the
 * existing size by `sizeIndex` (so a rename keeps the other fields), and
 * shippingPrice / inStorePrice / quantityAvailable are preserved. Empty-label or
 * £0 rows are dropped so an artist can clear a row to delete it.
 */
export function mergeBulkPricing(existing: SizePricing[], rows: BulkPriceInput[]): SizePricing[] {
  return rows
    .filter((r) => r.label.trim() && r.price > 0)
    .map((r) => {
      const prev = r.isNew ? undefined : existing[r.sizeIndex];
      return {
        ...(prev ?? {}),
        label: r.label.trim(),
        price: Math.round(r.price * 100) / 100,
      };
    });
}

/**
 * Copy the size LABELS of a source work onto a target work, keeping the target's
 * own price / stock / shipping / in-store values for any size whose label matches.
 * Matched case-insensitively by label (the copy-sizes bulk action).
 */
export function copySizesPricing(source: SizePricing[], target: SizePricing[]): SizePricing[] {
  return source.map((s) => {
    const existing = target.find((x) => x.label.toLowerCase() === s.label.toLowerCase());
    return {
      ...(existing ?? {}),
      label: s.label,
      price: existing?.price ?? 0,
      quantityAvailable: existing?.quantityAvailable ?? null,
    };
  });
}
