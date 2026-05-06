// Single source of truth for arrangement-type labels rendered to artists,
// venues, and customers. The DB column historically used `*_free_loan`
// for what is semantically a paid loan; we accept the legacy alias so
// callers can pass raw DB values without thinking.

export const ARRANGEMENT_TYPES = ["paid_loan", "revenue_share", "purchase"] as const;
export type ArrangementType = (typeof ARRANGEMENT_TYPES)[number];

export const ARRANGEMENT_LABEL: Record<ArrangementType, string> = {
  paid_loan: "Paid loan",
  revenue_share: "Revenue-share loan (QR-enabled)",
  purchase: "Direct purchase",
};

const LEGACY_ALIASES: Record<string, ArrangementType> = {
  // Historical: many admin/render paths used `free_loan` for what is
  // actually a paid loan. Migration 045 renamed the canonical value but
  // legacy rows / form posts may still arrive with the old string.
  free_loan: "paid_loan",
};

export function labelForArrangement(raw: string | null | undefined): string {
  if (!raw) return "Other arrangement";
  if (raw in ARRANGEMENT_LABEL) return ARRANGEMENT_LABEL[raw as ArrangementType];
  const aliased = LEGACY_ALIASES[raw];
  if (aliased) return ARRANGEMENT_LABEL[aliased];
  return "Other arrangement";
}
