// Stream: news. The final "re-permission" email. If unclicked, the user
// gets sunset and moved to suppressions.

import { EmailShell, H1, P, Button, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface UserRepermissionCampaignProps {
  firstName: string;
  confirmSubscriptionUrl: string;
  unsubscribeUrl: string;
}

export function UserRepermissionCampaign({ firstName, confirmSubscriptionUrl, unsubscribeUrl }: UserRepermissionCampaignProps) {
  return (
    <EmailShell stream="news" persona="multi" category="newsletter" preview="Should we keep in touch?">
      <H1>Should we keep in touch?</H1>
      <P>Hi {firstName} — we only want to land in inboxes where we&rsquo;re welcome. Tap the button if you&rsquo;d like to keep hearing from us. Silence = we&rsquo;ll stop.</P>
      <Button href={confirmSubscriptionUrl}>Keep me subscribed</Button>
      <Small>
        No? That&rsquo;s fine too —{" "}
        <a href={unsubscribeUrl} style={{ color: "#6B6760", textDecoration: "underline" }}>unsubscribe here</a>.
      </Small>
    </EmailShell>
  );
}

export const mock: UserRepermissionCampaignProps = {
  firstName: "Maya",
  confirmSubscriptionUrl: "https://wallplace.co.uk/account/email/confirm?t=example",
  unsubscribeUrl: "https://wallplace.co.uk/account/email/unsubscribe?t=example",
};

const entry: TemplateEntry<UserRepermissionCampaignProps> = {
  id: "user_repermission_campaign",
  name: "Re-permission campaign",
  description: "Final confirm-or-sunset email.",
  stream: "news",
  persona: "multi",
  category: "newsletter",
  subject: "Should we keep in touch?",
  previewText: "A gentle consent check.",
  component: UserRepermissionCampaign,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;
