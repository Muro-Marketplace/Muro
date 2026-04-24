// Stream: notify. Soft copy — no need to make the decline feel like a wall.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistPlacementDeclinedProps {
  firstName: string;
  venueName: string;
  reason?: string;
  discoverMoreVenuesUrl: string;
}

export function ArtistPlacementDeclined({ firstName, venueName, reason, discoverMoreVenuesUrl }: ArtistPlacementDeclinedProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="placements" preview={`${venueName} passed on the placement`}>
      <H1>{venueName} passed this time</H1>
      <P>Hi {firstName} — {venueName} isn&rsquo;t able to host the placement right now.{reason ? ` They said: "${reason}".` : ""}</P>
      <P>Declines are part of the rhythm — we&rsquo;ll keep matching your work to the right spaces.</P>
      <Button href={discoverMoreVenuesUrl} persona="artist">Discover more venues</Button>
    </EmailShell>
  );
}

export const mock: ArtistPlacementDeclinedProps = {
  firstName: "Maya",
  venueName: "The Curzon",
  reason: "Our wall is booked until September, but we'd love to revisit later in the year.",
  discoverMoreVenuesUrl: "https://wallplace.co.uk/spaces-looking-for-art",
};

const entry: TemplateEntry<ArtistPlacementDeclinedProps> = {
  id: "artist_placement_declined",
  name: "Placement declined (to artist)",
  description: "Soft decline with a nudge to other venues.",
  stream: "notify",
  persona: "artist",
  category: "placements",
  subject: "{{venueName}} passed on this placement",
  previewText: "A gentle note — plus a few other venues to consider.",
  component: ArtistPlacementDeclined,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
