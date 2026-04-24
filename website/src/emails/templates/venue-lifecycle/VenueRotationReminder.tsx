// Stream: notify. Fires at the rotation interval the venue chose
// (e.g. every 3 months, 6 months).

import { EmailShell, H1, P, Button, PlacementCard, ArtistCard } from "@/emails/_components";
import type { Artist, Placement } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockArtist, mockPlacement } from "@/emails/data/mockData";

export interface VenueRotationReminderProps {
  firstName: string;
  venueName: string;
  currentPlacements: Placement[];
  rotateUrl: string;
  suggestedArtists: Artist[];
}

export function VenueRotationReminder({ firstName, venueName, currentPlacements, rotateUrl, suggestedArtists }: VenueRotationReminderProps) {
  return (
    <EmailShell stream="notify" persona="venue" category="recommendations" preview={`Time to rotate the walls at ${venueName}?`}>
      <H1>Time to rotate the walls?</H1>
      <P>Hi {firstName} — {venueName}&rsquo;s current placements have been up for a while. Rotation keeps the walls interesting for returning guests.</P>
      {currentPlacements.slice(0, 2).map((p) => <PlacementCard key={p.id} placement={p} />)}
      {suggestedArtists.length > 0 && (
        <>
          <P style={{ marginTop: 20 }}>A few artists who could take the next rotation:</P>
          {suggestedArtists.slice(0, 2).map((a) => <ArtistCard key={a.id} artist={a} />)}
        </>
      )}
      <div style={{ marginTop: 20 }}>
        <Button href={rotateUrl} persona="venue">Plan a rotation</Button>
      </div>
    </EmailShell>
  );
}

export const mock: VenueRotationReminderProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  currentPlacements: [mockPlacement],
  rotateUrl: "https://wallplace.co.uk/venue-portal/placements",
  suggestedArtists: [mockArtist],
};

const entry: TemplateEntry<VenueRotationReminderProps> = {
  id: "venue_rotation_reminder",
  name: "Venue rotation reminder",
  description: "Nudge to rotate active placements.",
  stream: "notify",
  persona: "venue",
  category: "recommendations",
  subject: "Time to rotate the walls at {{venueName}}?",
  previewText: "Keeps returning guests looking up.",
  component: VenueRotationReminder,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
