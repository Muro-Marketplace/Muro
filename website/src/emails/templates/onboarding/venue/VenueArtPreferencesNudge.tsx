// Stream: notify. Day-4/7 nudge for venues to set their art preferences.

import { EmailShell, H1, P, Button, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenueArtPreferencesNudgeProps {
  firstName: string;
  venueName: string;
  preferencesUrl: string;
  styleExamples: string[];
}

export function VenueArtPreferencesNudge({ firstName, venueName, preferencesUrl, styleExamples }: VenueArtPreferencesNudgeProps) {
  return (
    <EmailShell stream="notify" persona="venue" category="recommendations" preview="Tell us the kind of art you're drawn to">
      <H1>What should we match you with?</H1>
      <P>Hi {firstName} — a minute of preferences means we only show you artists who suit {venueName}.</P>
      <P>Think: {styleExamples.slice(0, 4).join(", ")}…</P>
      <Button href={preferencesUrl} persona="venue">Set preferences</Button>
      <Small>You can change them any time, and we&rsquo;ll never send you a match that ignores them.</Small>
    </EmailShell>
  );
}

export const mock: VenueArtPreferencesNudgeProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  preferencesUrl: "https://wallplace.co.uk/venue-portal/profile#preferences",
  styleExamples: ["Photography", "Abstract painting", "Landscape", "Portraiture", "Black-and-white"],
};

const entry: TemplateEntry<VenueArtPreferencesNudgeProps> = {
  id: "venue_art_preferences_nudge",
  name: "Venue art preferences nudge",
  description: "Asks venues to set their art style preferences.",
  stream: "notify",
  persona: "venue",
  category: "recommendations",
  subject: "Tell us the kind of art {{venueName}} is drawn to",
  previewText: "Shapes the matches we send you.",
  component: VenueArtPreferencesNudge,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
