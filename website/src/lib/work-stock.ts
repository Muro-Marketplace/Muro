// One definition of "this work can no longer be bought".
//
// The cart checkout has re-validated stock at session creation since T1 shipped;
// the offer checkout, written later, never inherited it (D7). That is the same
// drift as the confirmation emails in T3: a rule implemented inline in one branch
// is a rule the next branch does not get. So the predicate lives here and both
// call it.

export interface WorkStockRow {
  available?: boolean | null;
  quantity_available?: number | null;
}

/**
 * Is this work sold out or withdrawn from sale?
 *
 * `quantity_available === null` means "not tracked", NOT "zero". 23 of the 35
 * works in the live table have it null, and the whole codebase reads null as
 * buyable: the webhook only decrements when it is a number
 * (webhooks/stripe/route.ts), and so does the placement install path. Treating
 * null as sold out here would make two thirds of the catalogue unbuyable.
 *
 * A negative value counts as sold, which is why the artist-works input schema
 * has a lower bound on it (E46a): without that, a negative made a work
 * permanently unbuyable.
 */
export function isWorkSold(row: WorkStockRow): boolean {
  return (
    row.available === false ||
    (typeof row.quantity_available === "number" && row.quantity_available <= 0)
  );
}
