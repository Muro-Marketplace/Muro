// Stream: tx. Sent to the OTHER party when someone cancels an
// in-flight placement (either side can cancel, status -> "cancelled").
// Mirrors the decline template tone, soft, not punitive, with a nudge
// back into the marketplace.
//
// R4.12 (WS5.5): was notify/placements. Cancellation ends a commercial
// arrangement (for paid loans, a monthly liability), so it now rides
// orders_and_payouts, the critical always-send category; sendEmail()
// enforces it via TEMPLATE_CATEGORY_OVERRIDES.
//
// Also sent to the CANCELLER, with `selfCancelled`, as their own
// confirmation. They used to get a bell and no email at all, on a placement
// that may carry the monthly payment they have just stopped.

import { EmailShell, H1, P, Button, Badge } from "@/emails/_components";
import type { EmailPersona } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface PlacementCancelledProps {
  firstName: string;
  // Who cancelled (display name).
  cancelledByName: string;
  // Recipient's role. Drives accent + next-step CTA.
  recipientPersona: Extract<EmailPersona, "artist" | "venue">;
  placementUrl: string;
  // Where to send them next, browse other venues / artists.
  nextStepUrl: string;
  /**
   * The monthly fee that stops with the placement, in pounds, when there was a
   * live paid-loan subscription. Omitted for a free loan or revenue share.
   *
   * Rows 2179-2187: cancelling a paid-loan placement produced no word about the
   * money to either party. The artist got this email and it said nothing about
   * the payments ending; the venue, who is the one being charged, got nothing
   * at all.
   */
  monthlyFeeGbp?: number | null;
  /**
   * True when the recipient is the party who cancelled. "X cancelled the
   * placement" reads wrongly to the person who did it, so the copy switches
   * to the second person and names the other party instead.
   */
  selfCancelled?: boolean;
  /** The other party's display name, used by the self-cancelled copy. */
  counterpartyName?: string;
}

export function PlacementCancelled({
  firstName,
  cancelledByName,
  recipientPersona,
  placementUrl,
  nextStepUrl,
  monthlyFeeGbp,
  selfCancelled = false,
  counterpartyName,
}: PlacementCancelledProps) {
  const isArtist = recipientPersona === "artist";
  const nextLabel = isArtist ? "Discover more venues" : "Browse artists";
  const other = counterpartyName || (isArtist ? "the venue" : "the artist");
  const headline = selfCancelled
    ? "You cancelled the placement"
    : `${cancelledByName} cancelled the placement`;
  return (
    <EmailShell
      stream="tx"
      persona={recipientPersona}
      category="orders_and_payouts"
      preview={headline}
    >
      <H1>
        <Badge tone="danger">Cancelled</Badge>{" "}
        <span style={{ marginLeft: 6 }}>{headline}</span>
      </H1>
      <P>
        {selfCancelled ? (
          <>
            Hi {firstName}, you cancelled the placement with {other}. It is now closed on both
            sides, and {other} has been told.
          </>
        ) : (
          <>
            Hi {firstName}, {cancelledByName} has cancelled this placement. The placement is now
            closed on both sides.
          </>
        )}
      </P>
      {typeof monthlyFeeGbp === "number" && monthlyFeeGbp > 0 && (
        <P>
          {isArtist
            ? `The venue's monthly payment of £${monthlyFeeGbp.toFixed(2)} ends with it. Your last payment covers the month they have already paid for.`
            : `Your monthly payment of £${monthlyFeeGbp.toFixed(2)} ends with it. You won't be charged again, and the month you have already paid for runs to the end of its period.`}
        </P>
      )}
      <P>
        It happens. Plans shift, schedules change. We&rsquo;ll keep helping you find the
        right {isArtist ? "wall" : "artist"} for the next one.
      </P>
      <div>
        <Button href={placementUrl} persona={recipientPersona}>
          Open placement
        </Button>{" "}
        <Button href={nextStepUrl} persona={recipientPersona}>
          {nextLabel}
        </Button>
      </div>
    </EmailShell>
  );
}

export const mock: PlacementCancelledProps = {
  firstName: "Maya",
  cancelledByName: "The Curzon",
  recipientPersona: "artist",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  nextStepUrl: "https://wallplace.co.uk/spaces",
  monthlyFeeGbp: 12,
};

const entry: TemplateEntry<PlacementCancelledProps> = {
  id: "placement_cancelled",
  name: "Placement cancelled (to other party)",
  description: "Fires when either side cancels an in-flight placement.",
  stream: "tx",
  persona: "multi",
  category: "orders_and_payouts",
  subject: "{{cancelledByName}} cancelled the placement",
  previewText: "The placement was cancelled.",
  component: PlacementCancelled,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
