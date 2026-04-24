// ADDITION — decisive good news. Stream: notify.

import { EmailShell, H1, P, Button, Badge } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistApplicationApprovedProps {
  firstName: string;
  goLiveUrl: string;
  welcomeMessage?: string;
}

export function ArtistApplicationApproved({ firstName, goLiveUrl, welcomeMessage }: ArtistApplicationApprovedProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="placements" preview="You're in">
      <H1><Badge tone="success">Accepted</Badge> <span style={{ marginLeft: 6 }}>You&rsquo;re in, {firstName}</span></H1>
      <P>Your work has been accepted into Wallplace. Welcome aboard.</P>
      {welcomeMessage && <P>{welcomeMessage}</P>}
      <P>Next up — go live on the marketplace:</P>
      <Button href={goLiveUrl} persona="artist">Open artist portal</Button>
    </EmailShell>
  );
}

export const mock: ArtistApplicationApprovedProps = {
  firstName: "Maya",
  goLiveUrl: "https://wallplace.co.uk/artist-portal",
  welcomeMessage: "The Mare Street series especially caught our eye. We think venues will love it.",
};

const entry: TemplateEntry<ArtistApplicationApprovedProps> = {
  id: "artist_application_approved",
  name: "Application approved",
  description: "Welcome-in email after acceptance.",
  stream: "notify",
  persona: "artist",
  category: "placements",
  subject: "You're in — welcome to Wallplace",
  previewText: "Your application was accepted.",
  component: ArtistApplicationApproved,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
