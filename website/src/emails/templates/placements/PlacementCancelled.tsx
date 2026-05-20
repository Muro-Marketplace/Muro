// Stream: notify. Sent to the OTHER party when someone cancels an
// in-flight placement (either side can cancel, status -> "cancelled").
// Mirrors the decline template tone, soft, not punitive, with a nudge
// back into the marketplace.

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
}

export function PlacementCancelled({
  firstName,
  cancelledByName,
  recipientPersona,
  placementUrl,
  nextStepUrl,
}: PlacementCancelledProps) {
  const isArtist = recipientPersona === "artist";
  const nextLabel = isArtist ? "Discover more venues" : "Browse artists";
  return (
    <EmailShell
      stream="notify"
      persona={recipientPersona}
      category="placements"
      preview={`${cancelledByName} cancelled the placement`}
    >
      <H1>
        <Badge tone="danger">Cancelled</Badge>{" "}
        <span style={{ marginLeft: 6 }}>{cancelledByName} cancelled the placement</span>
      </H1>
      <P>
        Hi {firstName}, {cancelledByName} has cancelled this placement. The placement is
        now closed on both sides.
      </P>
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
};

const entry: TemplateEntry<PlacementCancelledProps> = {
  id: "placement_cancelled",
  name: "Placement cancelled (to other party)",
  description: "Fires when either side cancels an in-flight placement.",
  stream: "notify",
  persona: "multi",
  category: "placements",
  subject: "{{cancelledByName}} cancelled the placement",
  previewText: "The placement was cancelled.",
  component: PlacementCancelled,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
