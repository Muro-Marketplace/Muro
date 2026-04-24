// Stream: notify. Day-2 nudge if space details missing.

import { EmailShell, H1, P, Button, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenueSpaceDetailsNudgeProps {
  firstName: string;
  venueName: string;
  missingItems: string[];
  spaceUrl: string;
}

export function VenueSpaceDetailsNudge({ firstName, venueName, missingItems, spaceUrl }: VenueSpaceDetailsNudgeProps) {
  return (
    <EmailShell stream="notify" persona="venue" category="recommendations" preview="Finish your space details so artists can match">
      <H1>{venueName} is waiting for its details</H1>
      <P>Hi {firstName} — artists use these fields to decide whether your space fits their work. A few minutes and it&rsquo;s done.</P>
      <P>Still to add:</P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {missingItems.map((m) => <li key={m}>{m}</li>)}
      </ul>
      <Button href={spaceUrl} persona="venue">Complete space</Button>
      <Small>Finished spaces show up in more artist searches.</Small>
    </EmailShell>
  );
}

export const mock: VenueSpaceDetailsNudgeProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  missingItems: ["Wall space (metres)", "Lighting conditions", "Rotation frequency"],
  spaceUrl: "https://wallplace.co.uk/venue-portal/profile",
};

const entry: TemplateEntry<VenueSpaceDetailsNudgeProps> = {
  id: "venue_space_details_nudge",
  name: "Venue space details nudge",
  description: "Day-2 nudge for incomplete venue profiles.",
  stream: "notify",
  persona: "venue",
  category: "recommendations",
  subject: "Finish {{venueName}}'s details so artists can match",
  previewText: "A few fields stand between you and matches.",
  component: VenueSpaceDetailsNudge,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
