// Stream: notify (team operational). Sent to the inviter when their invitee
// accepts.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountTeamInviteAcceptedProps {
  inviterFirstName: string;
  memberName: string;
  memberEmail: string;
  venueName: string;
  teamUrl: string;
}

export function AccountTeamInviteAccepted({ inviterFirstName, memberName, memberEmail, venueName, teamUrl }: AccountTeamInviteAcceptedProps) {
  return (
    <EmailShell stream="notify" persona="venue" category="placements" preview={`${memberName} joined ${venueName}`}>
      <H1>{memberName} joined {venueName}</H1>
      <P>Hi {inviterFirstName} — {memberName} ({memberEmail}) accepted your invite and can now manage {venueName} with you.</P>
      <Button href={teamUrl} persona="venue">Manage team</Button>
    </EmailShell>
  );
}

export const mock: AccountTeamInviteAcceptedProps = {
  inviterFirstName: "Hannah",
  memberName: "Joel Reyes",
  memberEmail: "joel@thecurzon.co.uk",
  venueName: "The Curzon",
  teamUrl: "https://wallplace.co.uk/venue-portal/settings/team",
};

const entry: TemplateEntry<AccountTeamInviteAcceptedProps> = {
  id: "account_team_invite_accepted",
  name: "Team invite accepted",
  description: "Notifies the inviter that a team member joined.",
  stream: "notify",
  persona: "venue",
  category: "placements",
  subject: "{{memberName}} joined {{venueName}}",
  previewText: "Your team just got bigger.",
  component: AccountTeamInviteAccepted,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
