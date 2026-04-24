// Stream: notify. Day-14 counterpart to graduation — fires if onboarding
// isn't done. Recaps what's left without nagging.

import { EmailShell, H1, P, Button, Checklist, Small } from "@/emails/_components";
import type { ChecklistStep } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockChecklist } from "@/emails/data/mockData";

export interface ArtistOnboardingIncompleteRecapProps {
  firstName: string;
  completionPct: number;
  remainingSteps: ChecklistStep[];
  continueSetupUrl: string;
}

export function ArtistOnboardingIncompleteRecap({ firstName, completionPct, remainingSteps, continueSetupUrl }: ArtistOnboardingIncompleteRecapProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="recommendations" preview={`Your setup is ${completionPct}% done — one quick push`}>
      <H1>Nearly there, {firstName}</H1>
      <P>Your Wallplace setup is {completionPct}% complete. Here&rsquo;s what&rsquo;s left:</P>
      <Checklist steps={remainingSteps} />
      <Button href={continueSetupUrl} persona="artist">Continue setup</Button>
      <Small>We won&rsquo;t keep reminding you. If you&rsquo;d rather pause, you can do that in email preferences.</Small>
    </EmailShell>
  );
}

export const mock: ArtistOnboardingIncompleteRecapProps = {
  firstName: "Maya",
  completionPct: 60,
  remainingSteps: mockChecklist.filter((s) => !s.done),
  continueSetupUrl: "https://wallplace.co.uk/artist-portal",
};

const entry: TemplateEntry<ArtistOnboardingIncompleteRecapProps> = {
  id: "artist_onboarding_incomplete_recap",
  name: "Onboarding incomplete recap",
  description: "Day-14 recap for artists who haven't finished setup.",
  stream: "notify",
  persona: "artist",
  category: "recommendations",
  subject: "Your Wallplace setup is {{completionPct}}% done",
  previewText: "One last push to go live.",
  component: ArtistOnboardingIncompleteRecap,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
