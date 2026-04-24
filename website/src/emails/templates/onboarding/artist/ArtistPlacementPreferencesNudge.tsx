// Stream: notify. Fires around day 10. Helps the matching engine do its job.

import { EmailShell, H1, P, Button, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistPlacementPreferencesNudgeProps {
  firstName: string;
  preferencesUrl: string;
  exampleVenueTypes: string[];
}

export function ArtistPlacementPreferencesNudge({ firstName, preferencesUrl, exampleVenueTypes }: ArtistPlacementPreferencesNudgeProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="recommendations" preview="Tell us where you'd love your work to live">
      <H1>Where should your work live, {firstName}?</H1>
      <P>Tell us which kinds of venues you&rsquo;d love to be placed in. We&rsquo;ll match you to the best matches first.</P>
      <P>For example: {exampleVenueTypes.slice(0, 4).join(", ")}…</P>
      <Button href={preferencesUrl} persona="artist">Set preferences</Button>
      <Small>Takes under two minutes. You can change them any time.</Small>
    </EmailShell>
  );
}

export const mock: ArtistPlacementPreferencesNudgeProps = {
  firstName: "Maya",
  preferencesUrl: "https://wallplace.co.uk/artist-portal/profile#preferences",
  exampleVenueTypes: ["Boutique cafés", "Independent cinemas", "Co-working studios", "Galleries"],
};

const entry: TemplateEntry<ArtistPlacementPreferencesNudgeProps> = {
  id: "artist_placement_preferences_nudge",
  name: "Placement preferences nudge",
  description: "Asks artists to set preferences so the matcher can work.",
  stream: "notify",
  persona: "artist",
  category: "recommendations",
  subject: "Tell us where you'd love your work to live",
  previewText: "Set preferences so we can match you well.",
  component: ArtistPlacementPreferencesNudge,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
