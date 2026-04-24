// Stream: notify. Day-0 venue welcome.

import { EmailShell, H1, P, Button, Checklist } from "@/emails/_components";
import type { ChecklistStep } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

const venueSteps: ChecklistStep[] = [
  { label: "Verify your email", done: true },
  { label: "Add your space details", done: false, url: "https://wallplace.co.uk/venue-portal/profile" },
  { label: "Upload photos of your walls", done: false, url: "https://wallplace.co.uk/venue-portal/profile#photos" },
  { label: "Set your art preferences", done: false, url: "https://wallplace.co.uk/venue-portal/profile#preferences" },
  { label: "Invite teammates (optional)", done: false, url: "https://wallplace.co.uk/venue-portal/settings/team" },
];

export interface VenueWelcomeChecklistProps {
  firstName: string;
  venueName: string;
  spaceUrl: string;
  uploadPhotosUrl: string;
  artPreferencesUrl: string;
  inviteTeamUrl: string;
  completedSteps: number;
  remainingSteps: ChecklistStep[];
}

export function VenueWelcomeChecklist({ firstName, venueName, remainingSteps }: VenueWelcomeChecklistProps) {
  return (
    <EmailShell stream="notify" persona="venue" category="recommendations" preview={`Welcome to Wallplace — how ${venueName} finds art`}>
      <H1>Welcome, {firstName}</H1>
      <P>{venueName} is signed up. A few steps will get you ready to host work.</P>
      <Checklist steps={remainingSteps} />
      <Button href={remainingSteps.find((s) => !s.done)?.url || "https://wallplace.co.uk/venue-portal"} persona="venue">
        Continue setup
      </Button>
    </EmailShell>
  );
}

export const mock: VenueWelcomeChecklistProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  spaceUrl: "https://wallplace.co.uk/venue-portal/profile",
  uploadPhotosUrl: "https://wallplace.co.uk/venue-portal/profile#photos",
  artPreferencesUrl: "https://wallplace.co.uk/venue-portal/profile#preferences",
  inviteTeamUrl: "https://wallplace.co.uk/venue-portal/settings/team",
  completedSteps: 1,
  remainingSteps: venueSteps,
};

const entry: TemplateEntry<VenueWelcomeChecklistProps> = {
  id: "venue_welcome_checklist",
  name: "Venue welcome + checklist",
  description: "Day-0 onboarding for venues.",
  stream: "notify",
  persona: "venue",
  category: "recommendations",
  subject: "Welcome to Wallplace — how {{venueName}} finds art",
  previewText: "A short setup list to get you hosting.",
  component: VenueWelcomeChecklist,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
