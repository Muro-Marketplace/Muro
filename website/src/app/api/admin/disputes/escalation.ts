// G20. Escalating a dispute used to write `category = "escalated"`, which
// overwrote the classification the opener chose when they filed it. The list
// heading renders that column, and the list endpoint filters on it, so one
// click destroyed the only record of what the dispute was actually about.
//
// The right shape is a separate flag column on `disputes`. That needs a
// migration, which this pass is not allowed to add, so the flag rides on the
// category as a prefix instead: non-destructive, reversible, and readable by
// both the decision route and the admin list without a schema change.
//
// Pure and dependency-free on purpose: it is imported by the API route AND by
// the admin page (a client component), so it must not pull in anything
// server-side.

export const ESCALATED_PREFIX = "escalated:";

/** True when this category carries the escalation flag. */
export function isEscalated(category: string | null | undefined): boolean {
  return typeof category === "string" && category.startsWith(ESCALATED_PREFIX);
}

/** The classification the opener filed under, with any escalation flag stripped. */
export function baseCategory(category: string | null | undefined): string {
  if (!category) return "";
  return isEscalated(category) ? category.slice(ESCALATED_PREFIX.length).trim() : category;
}

/**
 * The value to store when escalating.
 *
 * Idempotent: escalating an already-escalated dispute must not stack prefixes.
 * A dispute filed with no category at all still gets flagged, it just has no
 * classification to preserve.
 */
export function markEscalated(category: string | null | undefined): string {
  const base = baseCategory(category);
  return base ? `${ESCALATED_PREFIX} ${base}` : ESCALATED_PREFIX;
}
