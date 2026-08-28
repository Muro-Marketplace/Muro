// Single source of truth for arrangement-type labels rendered to artists,
// venues, and customers.
//
// K3 (07 §3). There were four implementations, plus two more ladders in the API
// layer, producing five vocabularies for the same five values:
//
//   this file             "Paid loan" / "Revenue-share loan (QR-enabled)" / "Direct purchase"
//   placements/status.ts  "Paid loan + QR" / "Paid loan" / "Revenue share" / "Free display"
//   arrangement-type.ts   a re-export alias with the SAME NAME as status.ts's
//                         function, so two different `arrangementLabel`s were in
//                         scope depending on which module you imported
//   PlacementDetailClient a hardcoded flag-gated JSX ladder, title-cased
//                         differently from all of the above
//   placements/route.ts   the same ladder again, twice within one file
//
// `/spaces` rendered two of them on one page: the literal "Revenue Share" beside
// `ARRANGEMENT_LABEL.revenue_share` = "Revenue-share loan (QR-enabled)". That is
// finding E13.
//
// The DB column is overloaded, which is what made this hard to centralise:
// `free_loan` is a legacy alias meaning a PAID loan when a monthly fee is
// attached and a genuine FREE display when there is not. `paid_loan` is the
// canonical paid value, and `mixed` is paid loan plus revenue share. All three
// are real values in production.

export const ARRANGEMENT_TYPES = ["paid_loan", "revenue_share", "purchase"] as const;
export type ArrangementType = (typeof ARRANGEMENT_TYPES)[number];

/**
 * The bare noun per canonical type, with no fee or QR nuance applied.
 *
 * K3: `revenue_share` was "Revenue-share loan (QR-enabled)". It is not a loan,
 * and the parenthetical described a configuration rather than the arrangement.
 */
export const ARRANGEMENT_LABEL: Record<ArrangementType, string> = {
  paid_loan: "Paid loan",
  revenue_share: "Revenue share",
  purchase: "Direct purchase",
};

const LEGACY_ALIASES: Record<string, ArrangementType> = {
  // Historical: many admin/render paths used `free_loan` for what is
  // actually a paid loan. Migration 045 renamed the canonical value but
  // legacy rows / form posts may still arrive with the old string.
  free_loan: "paid_loan",
};

export interface ArrangementLabelInput {
  arrangementType?: string | null;
  monthlyFeeGbp?: number | null;
  qrEnabled?: boolean | null;
  revenueSharePercent?: number | null;
}

const FREE_DISPLAY = "Free display";
const MIXED = "Paid loan + revenue share";
const PAID_LOAN_QR = "Paid loan + QR";
const UNKNOWN = "Other arrangement";

/**
 * Every label this module can produce. Exported so a caller that needs to match
 * on the output (and a guard that needs to check nothing else emits them) has
 * one list rather than a hand-copied set.
 */
export const ALL_ARRANGEMENT_LABELS: readonly string[] = [
  ...Object.values(ARRANGEMENT_LABEL),
  FREE_DISPLAY,
  MIXED,
  PAID_LOAN_QR,
  UNKNOWN,
];

/**
 * The label for an arrangement.
 *
 * Accepts a raw type string for the many callers that have only that, or the
 * full input when fee and QR state are available — those change the answer,
 * which is why `placements/status.ts` grew a second implementation rather than
 * calling this one.
 *
 * Deliberately NOT carried over from that implementation: it regexed the
 * free-text message body for "£X/month" to infer a fee when the column was
 * null. Inferring a monetary amount from prose a user typed is a bug generator.
 * If `monthly_fee_gbp` is null on legacy rows, backfill the column.
 */
export function labelForArrangement(input: string | null | undefined | ArrangementLabelInput): string {
  // The two implementations this replaces disagreed on one input, and the
  // disagreement is preserved rather than papered over, because each was right
  // for its own callers.
  //
  //   labelForArrangement("free_loan")                     -> "Paid loan"
  //   arrangementLabel({ arrangement_type: "free_loan" })   -> "Free display"
  //
  // A caller with only a type string knows nothing about the fee, and the alias
  // map's reading (free_loan IS the paid-loan option on the forms that write it)
  // is the right default there. A caller passing the OBJECT is in the
  // data-derived world, where the absence of a fee means there is no fee. So the
  // call form decides, and both sets of existing callers keep their meaning.
  const dataDerived = !(typeof input === "string" || input == null);
  const opts: ArrangementLabelInput = dataDerived
    ? (input as ArrangementLabelInput)
    : { arrangementType: input as string | null | undefined };

  const raw = opts.arrangementType ?? "";
  const fee = opts.monthlyFeeGbp ?? 0;
  const hasFee = typeof fee === "number" && fee > 0;
  const qr = opts.qrEnabled === true;

  // `mixed` is paid loan AND revenue share, so it needs saying before the
  // canonical map, which has no entry for it. It was returning
  // "Other arrangement" for a value that is live in production.
  //
  // With QR on, "+ QR" is what the placement lists already show and it names the
  // mechanism the revenue share is collected through, so it wins.
  if (raw === "mixed") return qr ? PAID_LOAN_QR : MIXED;

  if (raw === "purchase") return ARRANGEMENT_LABEL.purchase;

  if (raw === "revenue_share") return ARRANGEMENT_LABEL.revenue_share;

  // paid_loan, or the free_loan alias. The alias is the overloaded one: with a
  // fee it is a paid loan, without one it is a genuinely free display.
  if (raw === "paid_loan" || raw in LEGACY_ALIASES) {
    if (raw === "free_loan" && dataDerived && !hasFee && !qr) return FREE_DISPLAY;
    if (hasFee && qr) return PAID_LOAN_QR;
    return ARRANGEMENT_LABEL.paid_loan;
  }

  // Fee or QR with no recognisable type still describes something real, so say
  // what it is rather than "Other arrangement".
  if (hasFee) return qr ? PAID_LOAN_QR : ARRANGEMENT_LABEL.paid_loan;
  if (qr) return ARRANGEMENT_LABEL.revenue_share;

  return UNKNOWN;
}
