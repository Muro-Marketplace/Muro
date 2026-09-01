// Which placement statuses accept a review (F38, QA 2026-08-28).
//
// Reviews describe how a placement WENT, so they open only once it has
// genuinely ended: completed (wound down and collected), sold (the work was
// bought off the wall) or cancelled (the arrangement was called off after
// starting). Pending and active placements refuse reviews — nothing has
// happened yet to review. Shared between the API route and the review page
// so the two gates cannot drift.

export const REVIEWABLE_PLACEMENT_STATUSES = ["completed", "sold", "cancelled"] as const;

export function isReviewablePlacementStatus(status: string | null | undefined): boolean {
  return (REVIEWABLE_PLACEMENT_STATUSES as readonly string[]).includes(status || "");
}
