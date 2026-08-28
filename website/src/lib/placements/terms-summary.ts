// One-line summary of a placement's commercial terms, for emails and cards.
//
// K1/K3. This existed as two identical inline IIFEs inside
// `api/placements/route.ts`, and `lib/email.ts`'s notifyPlacementRequest built a
// third, differently-worded one ("Revenue Share (10%)" against "Revenue share ·
// 10%"). The two halves of one event therefore described the same arrangement in
// two different vocabularies depending on which system sent the mail.
//
// Built on the canonical `arrangement-labels` so the noun matches everywhere
// else in the product, rather than being re-invented per surface.

import { labelForArrangement } from "@/lib/arrangement-labels";
import { isRevenueShare } from "@/lib/arrangement-type";
import type { RawArrangementType } from "@/lib/arrangement-type";

export function placementTermsSummary(
  type: RawArrangementType,
  revenueSharePercent?: number | null,
  monthlyFeeGbp?: number | null,
): string {
  const rev = revenueSharePercent ?? 0;
  const fee = monthlyFeeGbp ?? 0;
  const parts: string[] = [];

  // The base noun, from the canonical label map. `free_loan` aliases to
  // "Paid loan" there, which preserves what the inline copies did.
  parts.push(rev > 0 && isRevenueShare(type) ? `${labelForArrangement(type)} · ${rev}%` : labelForArrangement(type));

  if (fee > 0) parts.push(`£${fee}/mo`);
  // A revenue share that is part of a mixed arrangement is worth spelling out;
  // on a pure revenue_share it is already in the label above.
  if (rev > 0 && !isRevenueShare(type)) parts.push(`${rev}% on QR sales`);

  return parts.join(" · ");
}
