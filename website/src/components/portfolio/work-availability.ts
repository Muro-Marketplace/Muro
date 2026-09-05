// The two availability controls on the portfolio form and how they combine.
//
// `available` is the artist's intent (for sale, or withdrawn / marked sold in
// bulk). `quantityAvailable` is the count: a number is tracked stock, null is
// unlimited (print-on-demand). Stock hitting zero flips `available` to false,
// both in the DB (decrement_work_stock, migration 120) and in the form's save
// (deriveAvailable below), so the marketplace pill reads Sold either way. That
// needs a mirror on the way back up, which restock_work has and the form did
// not: the box hydrated from the stored flag, so a work that had sold out
// opened unticked, the save ANDed that with the new count, and a restock from
// 0 to 100 saved available=false. Owner report, 5 September 2026.

export interface WorkAvailabilityFields {
  available?: boolean;
  quantityAvailable?: number | null;
}

/** The count ran out. Untracked (null / unset) stock is never sold out. */
export function isSoldOutByStock(work: WorkAvailabilityFields): boolean {
  return typeof work.quantityAvailable === "number" && work.quantityAvailable <= 0;
}

/**
 * What the "Available for purchase" box shows when the edit form opens.
 *
 * A work whose flag is false only because its stock reached zero is still for
 * sale as far as the artist is concerned, so it opens ticked: raising the
 * count then puts it back on the marketplace with nothing else to remember.
 * A work with stock left and the flag off was withdrawn on purpose and stays
 * unticked.
 */
export function hydrateAvailable(work: WorkAvailabilityFields): boolean {
  return work.available === true || isSoldOutByStock(work);
}

/**
 * What the save writes. `quantity` is the parsed field: null for blank
 * (unlimited) or anything non-numeric. The box wins when unticked; a ticked
 * box with a tracked count of zero is sold out, mirroring decrement_work_stock.
 */
export function deriveAvailable(formAvailable: boolean, quantity: number | null): boolean {
  return formAvailable && (quantity === null || quantity > 0);
}
