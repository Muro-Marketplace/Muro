// Stream: notify. Day-4 nudge for venues missing wall photos.

import { EmailShell, H1, P, Button, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenuePhotoUploadNudgeProps {
  firstName: string;
  venueName: string;
  uploadPhotosUrl: string;
  photoTips: string[];
}

export function VenuePhotoUploadNudge({ firstName, venueName, uploadPhotosUrl, photoTips }: VenuePhotoUploadNudgeProps) {
  return (
    <EmailShell stream="notify" persona="venue" category="recommendations" preview={`Photos make ${venueName}'s listing come alive`}>
      <H1>Show artists your walls</H1>
      <P>Hi {firstName} — photos are the single biggest factor in whether an artist chooses to place work with {venueName}.</P>
      <P>Quick tips:</P>
      <ul style={{ fontSize: 14, color: "#4A4740", lineHeight: 1.7, paddingLeft: 18, margin: "8px 0 20px" }}>
        {photoTips.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <Button href={uploadPhotosUrl} persona="venue">Add photos</Button>
      <Small>Three or four shots is plenty — daytime, eye-level, minimal clutter.</Small>
    </EmailShell>
  );
}

export const mock: VenuePhotoUploadNudgeProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  uploadPhotosUrl: "https://wallplace.co.uk/venue-portal/profile#photos",
  photoTips: [
    "Shoot in daylight — avoid mixed warm/cool lighting",
    "Show the wall as it would be lived in",
    "Include at least one wide shot for context",
  ],
};

const entry: TemplateEntry<VenuePhotoUploadNudgeProps> = {
  id: "venue_photo_upload_nudge",
  name: "Venue photo upload nudge",
  description: "Nudges venues without photos to upload them.",
  stream: "notify",
  persona: "venue",
  category: "recommendations",
  subject: "Photos make {{venueName}}'s listing come alive",
  previewText: "Three or four shots is all it takes.",
  component: VenuePhotoUploadNudge,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;
