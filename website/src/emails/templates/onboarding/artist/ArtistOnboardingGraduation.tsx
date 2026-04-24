// Stream: notify. Fires day 14 when artist has completed the core onboarding.
// Graduation = "you're live and visible to venues".

import { EmailShell, H1, P, Button, SecondaryButton, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistOnboardingGraduationProps {
  firstName: string;
  dashboardUrl: string;
  discoverVenuesUrl: string;
  profileUrl: string;
}

export function ArtistOnboardingGraduation({ firstName, dashboardUrl, discoverVenuesUrl, profileUrl }: ArtistOnboardingGraduationProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="recommendations" preview="You're live on Wallplace — here's what happens next">
      <H1>You&rsquo;re live, {firstName}</H1>
      <P>Your profile is visible to venues across the UK. From here, placements happen two ways:</P>
      <P>
        <strong>Venues reach out to you</strong> — you&rsquo;ll get an email when a new request arrives.
        <br />
        <strong>You request placements</strong> — browse venues looking for your kind of work and send a request.
      </P>
      <div style={{ margin: "16px 0" }}>
        <Button href={dashboardUrl} persona="artist">Go to dashboard</Button>{" "}
        <SecondaryButton href={discoverVenuesUrl} persona="artist">Discover venues</SecondaryButton>
      </div>
      <Small>Keep your portfolio fresh — artists with 5+ works and recent activity are shown to venues first. <a href={profileUrl} style={{ color: "#6B6760" }}>View profile</a>.</Small>
    </EmailShell>
  );
}

export const mock: ArtistOnboardingGraduationProps = {
  firstName: "Maya",
  dashboardUrl: "https://wallplace.co.uk/artist-portal",
  discoverVenuesUrl: "https://wallplace.co.uk/spaces-looking-for-art",
  profileUrl: "https://wallplace.co.uk/artist-portal/profile",
};

const entry: TemplateEntry<ArtistOnboardingGraduationProps> = {
  id: "artist_onboarding_graduation",
  name: "Artist onboarding graduation",
  description: "Day-14 'you're live' message for completed artists.",
  stream: "notify",
  persona: "artist",
  category: "recommendations",
  subject: "You're live on Wallplace, {{firstName}}",
  previewText: "Here's what happens next.",
  component: ArtistOnboardingGraduation,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
