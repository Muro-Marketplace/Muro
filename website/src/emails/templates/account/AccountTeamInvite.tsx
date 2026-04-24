// Stream: tx (security-ish) — invites are one-time, not suppressible.
// Venues can invite staff so multiple people manage the same space.

import { EmailShell, H1, P, Button, Small, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface AccountTeamInviteProps {
  inviterName: string;
  venueName: string;
  role: string;
  acceptUrl: string;
  expiresIn: string;
  supportUrl?: string;
}

export function AccountTeamInvite({ inviterName, venueName, role, acceptUrl, expiresIn, supportUrl }: AccountTeamInviteProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview={`${inviterName} invited you to ${venueName} on Wallplace`}>
      <H1>You&rsquo;ve been invited to {venueName}</H1>
      <P>{inviterName} has invited you to join <strong>{venueName}</strong> on Wallplace as a <strong>{role}</strong>.</P>
      <Button href={acceptUrl} persona="venue">Accept invite</Button>
      <Small>This invite expires in {expiresIn}. If you weren&rsquo;t expecting this, you can safely ignore it.</Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: AccountTeamInviteProps = {
  inviterName: "Hannah Webb",
  venueName: "The Curzon",
  role: "Manager",
  acceptUrl: "https://wallplace.co.uk/invites/accept?t=example",
  expiresIn: "7 days",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<AccountTeamInviteProps> = {
  id: "account_team_invite",
  name: "Team invite",
  description: "Invitation for a team member to join a venue account.",
  stream: "tx",
  persona: "venue",
  category: "security",
  subject: "{{inviterName}} invited you to {{venueName}} on Wallplace",
  previewText: "Tap accept to join the team.",
  component: AccountTeamInvite,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
