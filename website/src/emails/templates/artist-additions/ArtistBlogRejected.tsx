// G14 + G15. The admin reject prompt promises the reason is "visible to the
// author", but it only ever reached moderation_queue.reason, which nothing
// read back. This email is what makes that promise true. Sent from PATCH
// /api/admin/blogs/[id] on reject. Stream: notify.

import { EmailShell, H1, P, Small, InfoBox, Button, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ArtistBlogRejectedProps {
  firstName: string;
  title: string;
  reason: string;
  editUrl: string;
  supportUrl?: string;
}

export function ArtistBlogRejected({ firstName, title, reason, editUrl, supportUrl }: ArtistBlogRejectedProps) {
  return (
    <EmailShell stream="notify" persona="artist" category="placements" preview="A note on your Wallplace post">
      <H1>A note on your post</H1>
      <P>Hi {firstName}, thank you for sending us {title}. We are not able to publish it as it stands.</P>
      <InfoBox tone="warning">
        <strong>Why:</strong> {reason}
      </InfoBox>
      <P>Your draft is still yours. Make the changes and send it back whenever you are ready, and we will look again.</P>
      <Button href={editUrl}>Edit your post</Button>
      <Small>If you think we have read this wrong, reply and tell us. We would rather hear it than lose the piece.</Small>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistBlogRejectedProps = {
  firstName: "Maya",
  title: "Painting for small rooms",
  reason: "The post names a venue we have not placed with yet, so readers would go looking for something that is not there.",
  editUrl: "https://wallplace.co.uk/artist-portal/blogs",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistBlogRejectedProps> = {
  id: "artist_blog_rejected",
  name: "Blog not published",
  description: "Author told their submitted post did not pass review, with the moderator's reason.",
  stream: "notify",
  persona: "artist",
  category: "placements",
  subject: "A note on your Wallplace post",
  previewText: "What we would need changed before it goes live.",
  component: ArtistBlogRejected,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 2,
};
export default entry;
