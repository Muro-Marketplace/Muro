// Stream: notify (first-touch onboarding). Suppressible only via the broader
// "onboarding" preference — we don't let users opt out of individual steps.

import { EmailShell, H1, P, Button, Checklist, Small } from "@/emails/_components";
import type { ChecklistStep } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockChecklist } from "@/emails/data/mockData";

export interface ArtistWelcomeChecklistProps {
  firstName: string;
  profileUrl: string;
  uploadArtworkUrl: string;
  connectStripeUrl: string;
  placementPreferencesUrl: string;
  completedSteps: number;
  remainingSteps: ChecklistStep[];
}

export function ArtistWelcomeChecklist({ firstName, remainingSteps }: ArtistWelcomeChecklistProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="recommendations" preview="Welcome to Wallplace — here's how artists get placed">
      <H1>Welcome to Wallplace, {firstName}</H1>
      <P>You&rsquo;re in. Here&rsquo;s a short setup list to get your work in front of venues.</P>
      <Checklist steps={remainingSteps} />
      <Button href={remainingSteps.find((s) => !s.done)?.url || "https://wallplace.co.uk/artist-portal"} persona="artist">
        Continue setup
      </Button>
      <Small>Finished profiles are reviewed faster and have a better chance of acceptance with venues.</Small>
    </EmailShell>
  );
}

export const mock: ArtistWelcomeChecklistProps = {
  firstName: "Maya",
  profileUrl: "https://wallplace.co.uk/artist-portal/profile",
  uploadArtworkUrl: "https://wallplace.co.uk/artist-portal/portfolio",
  connectStripeUrl: "https://wallplace.co.uk/artist-portal/billing",
  placementPreferencesUrl: "https://wallplace.co.uk/artist-portal/profile#preferences",
  completedSteps: 2,
  remainingSteps: mockChecklist,
};

const entry: TemplateEntry<ArtistWelcomeChecklistProps> = {
  id: "artist_welcome_checklist",
  name: "Artist welcome + checklist",
  description: "Day-0 onboarding for artists.",
  stream: "notify",
  persona: "artist",
  category: "recommendations",
  subject: "Welcome to Wallplace, {{firstName}} — here's how artists get placed",
  previewText: "Three steps to start getting matched with venues.",
  component: ArtistWelcomeChecklist,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
