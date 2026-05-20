// Stream: tx (relational confirmation, not marketing).
// Sent when a venue submits the /register-venue form, before manual approval.

import { EmailShell, H1, P, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenueRegistrationConfirmationProps {
  contactFirstName: string;
  venueName: string;
  reviewTimelineDays?: number;
}

export function VenueRegistrationConfirmation({
  contactFirstName,
  venueName,
  reviewTimelineDays = 3,
}: VenueRegistrationConfirmationProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview={`We've received the application for ${venueName}`}>
      <H1>Application received</H1>
      <P>Thanks {contactFirstName} - your application for <strong>{venueName}</strong> is in.</P>
      <P>Our team reviews each space personally to make sure Wallplace stays a good fit for the artists we work with. You&rsquo;ll hear back within {reviewTimelineDays} working days.</P>
      <Small>No action needed from you in the meantime. We&rsquo;ll reach out if anything is unclear.</Small>
    </EmailShell>
  );
}

export const mock: VenueRegistrationConfirmationProps = {
  contactFirstName: "Hannah",
  venueName: "The Curzon",
  reviewTimelineDays: 3,
};

const entry: TemplateEntry<VenueRegistrationConfirmationProps> = {
  id: "venue_registration_confirmation",
  name: "Venue registration confirmation",
  description: "Confirms a venue's pre-launch registration submission.",
  stream: "tx",
  persona: "venue",
  category: "security",
  subject: "We've received your Wallplace application",
  previewText: "Application received - we'll be in touch within a few days.",
  component: VenueRegistrationConfirmation,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
