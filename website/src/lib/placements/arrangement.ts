// Phase 2 chunk 2.0e. TypeScript mirror of the SQL CASE expression
// migrations 051 + 062 used to backfill placements.arrangement_type.
// Phase 2.2 calls this on every placement create/counter write so the
// arrangement_type column is set explicitly at the source instead of
// being implied by other columns and re-derived downstream.
//
// Logic (precedence, top to bottom):
//
//   purchase_amount_pence > 0    -> 'purchase'
//   monthly_fee_gbp > 0 AND
//     qr_enabled                 -> 'mixed'
//   monthly_fee_gbp > 0          -> 'paid_loan'
//   revenue_share_percent > 0    -> 'revenue_share'
//   qr_enabled                   -> 'revenue_share'   (QR-only loans
//                                                       imply rev-share
//                                                       per legacy data)
//   otherwise                    -> 'free_loan'
//
// `qr_enabled` alone falling into 'revenue_share' matches the placement
// status helper (arrangementLabel in src/lib/placements/status.ts) so
// the derived header label and the stored column don't diverge.

export type ArrangementType =
  | "free_loan"
  | "paid_loan"
  | "revenue_share"
  | "purchase"
  | "mixed";

export interface DeriveArrangementInput {
  monthly_fee_gbp: number | null;
  qr_enabled: boolean;
  revenue_share_percent: number | null;
  /** Only set on purchase placements (artwork was bought outright). */
  purchase_amount_pence?: number | null;
}

export function deriveArrangementType(
  input: DeriveArrangementInput,
): ArrangementType {
  const fee = input.monthly_fee_gbp ?? 0;
  const rev = input.revenue_share_percent ?? 0;
  const purchase = input.purchase_amount_pence ?? 0;
  const qr = !!input.qr_enabled;

  if (purchase > 0) return "purchase";
  if (fee > 0 && qr) return "mixed";
  if (fee > 0) return "paid_loan";
  if (rev > 0) return "revenue_share";
  if (qr) return "revenue_share";
  return "free_loan";
}
