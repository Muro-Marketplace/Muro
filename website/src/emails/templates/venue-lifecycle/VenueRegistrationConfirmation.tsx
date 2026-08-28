// Stream: tx (relational confirmation, not marketing).
// Sent when a venue submits the /signup/venue form. Registration is open:
// the account is created straight away and the profile appears on first
// verified login, with no manual review step. A44: this email used to frame
// the signup as "an application under review" with a reply promised in a few
// days, an approval that never came. It now confirms what actually happens
// next: verify your email, log in, portal ready.

import { EmailShell, H1, P, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenueRegistrationConfirmationProps {
  contactFirstName: string;
  venueName: string;
}

export function VenueRegistrationConfirmation({
  contactFirstName,
  venueName,
}: VenueRegistrationConfirmationProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview={`${venueName} is registered on Wallplace`}>
      <H1>You&rsquo;re in</H1>
      <P>Thanks {contactFirstName}, <strong>{venueName}</strong> is now registered on Wallplace.</P>
      <P>There&rsquo;s no approval step and nothing to wait for. We&rsquo;ve sent you a separate email with a verification link. Confirm your email address, log in, and your venue portal is ready.</P>
      <P>From there you can add photos of your walls, set your art preferences, and start browsing artists straight away.</P>
      <Small>If the verification email hasn&rsquo;t arrived within a few minutes, check your spam folder.</Small>
    </EmailShell>
  );
}

export const mock: VenueRegistrationConfirmationProps = {
  contactFirstName: "Hannah",
  venueName: "The Curzon",
};

const entry: TemplateEntry<VenueRegistrationConfirmationProps> = {
  id: "venue_registration_confirmation",
  name: "Venue registration confirmation",
  description: "Welcomes a newly registered venue and points them at email verification.",
  stream: "tx",
  persona: "venue",
  category: "security",
  subject: "Your venue is registered on Wallplace",
  previewText: "No approval step. Confirm your email and your portal is ready.",
  component: VenueRegistrationConfirmation,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
