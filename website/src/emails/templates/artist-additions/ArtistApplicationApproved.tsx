// ADDITION, decisive good news. Stream: notify.

import { EmailShell, H1, P, Button, Badge } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistApplicationApprovedProps {
  firstName: string;
  goLiveUrl: string;
  welcomeMessage?: string;
  /**
   * The plan the applicant picked on the form, when they picked one.
   *
   * Row 2362 / pass 2 item 3.7. The application detail shows "SELECTED PLAN
   * Pro" and the profile it creates carries `subscription_plan: 'none'`. That
   * is deliberate and right: choosing a plan on a form is an intent, not a
   * purchase, and provisioning one on acceptance would assert a subscription
   * nobody has paid for. What was missing is that nothing told the accepted
   * artist they still have to start it, so someone who picked Pro in the form
   * had no way to know they were on nothing.
   */
  selectedPlan?: string | null;
  /** Where they start the plan. */
  billingUrl?: string;
}

export function ArtistApplicationApproved({
  firstName,
  goLiveUrl,
  welcomeMessage,
  selectedPlan,
  billingUrl,
}: ArtistApplicationApprovedProps) {
  const plan = (selectedPlan || "").trim();
  const planName = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : null;
  return (
    <EmailShell stream="notify" persona="artist" category="placements" preview="You're in">
      <H1><Badge tone="success">Accepted</Badge> <span style={{ marginLeft: 6 }}>You&rsquo;re in, {firstName}</span></H1>
      <P>Your work has been accepted into Wallplace. Welcome aboard.</P>
      {welcomeMessage && <P>{welcomeMessage}</P>}
      <P>Next up, go live on the marketplace:</P>
      <Button href={goLiveUrl} persona="artist">Open artist portal</Button>
      {planName && billingUrl && (
        <P>
          You picked the {planName} plan on your application. Nothing has been charged and no
          plan is running yet: start it from your billing page whenever you are ready, and you
          can change your mind about which one.
        </P>
      )}
    </EmailShell>
  );
}

export const mock: ArtistApplicationApprovedProps = {
  firstName: "Maya",
  goLiveUrl: "https://wallplace.co.uk/artist-portal",
  welcomeMessage: "The Mare Street series especially caught our eye. We think venues will love it.",
  selectedPlan: "pro",
  billingUrl: "https://wallplace.co.uk/artist-portal/billing",
};

const entry: TemplateEntry<ArtistApplicationApprovedProps> = {
  id: "artist_application_approved",
  name: "Application approved",
  description: "Welcome-in email after acceptance.",
  stream: "notify",
  persona: "artist",
  category: "placements",
  subject: "You're in, welcome to Wallplace",
  previewText: "Your application was accepted.",
  component: ArtistApplicationApproved,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
