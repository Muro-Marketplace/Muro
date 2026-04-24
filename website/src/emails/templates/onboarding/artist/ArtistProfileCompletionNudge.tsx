// Stream: notify. Fires at day 2 if profile < 80% complete.

import { EmailShell, H1, P, Button, Small, Badge } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistProfileCompletionNudgeProps {
  firstName: string;
  completionPct: number;
  missingItems: string[];
  profileUrl: string;
}

export function ArtistProfileCompletionNudge({ firstName, completionPct, missingItems, profileUrl }: ArtistProfileCompletionNudgeProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="recommendations" preview={`Your profile is ${completionPct}% complete — a few minutes finishes it`}>
      <H1>You&rsquo;re almost set up, {firstName}</H1>
      <P>
        Your profile is <Badge tone="warning">{completionPct}% complete</Badge>. Venues review finished profiles faster and are more likely to accept a placement.
      </P>
      <P>Still to add:</P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {missingItems.map((m) => <li key={m}>{m}</li>)}
      </ul>
      <Button href={profileUrl} persona="artist">Finish my profile</Button>
      <Small>It usually takes about five minutes.</Small>
    </EmailShell>
  );
}

export const mock: ArtistProfileCompletionNudgeProps = {
  firstName: "Maya",
  completionPct: 60,
  missingItems: ["Artist statement", "Primary medium", "Profile photo"],
  profileUrl: "https://wallplace.co.uk/artist-portal/profile",
};

const entry: TemplateEntry<ArtistProfileCompletionNudgeProps> = {
  id: "artist_profile_completion_nudge",
  name: "Artist profile completion nudge",
  description: "Day-2 nudge if profile is under 80% complete.",
  stream: "notify",
  persona: "artist",
  category: "recommendations",
  subject: "Your profile is {{completionPct}}% done — a few minutes finishes it",
  previewText: "Venues review finished profiles faster.",
  component: ArtistProfileCompletionNudge,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
